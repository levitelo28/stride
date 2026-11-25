// Stride AI coach: POST { input: CoachInput } → weekly review JSON.
// Runs as the signed-in user (their JWT), so row-level security applies to every read and write.
// Requires the ANTHROPIC_API_KEY secret: `supabase secrets set ANTHROPIC_API_KEY=...`.
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

import { buildUserMessage, checkInput, MODEL, parseReview, REVIEW_SCHEMA, SYSTEM_PROMPT } from './prompt.ts';

const REVIEWS_PER_DAY = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply(401, { error: 'Sign in to use the coach' });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: 'Sign in to use the coach' });
  const userId = userData.user.id;

  const { data: profile } = await supabase.from('profiles').select('ai_coach_consent_at').eq('user_id', userId).maybeSingle();
  if (!profile?.ai_coach_consent_at) return reply(403, { error: 'Turn on the AI coach in the app first' });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('coach_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if ((count ?? 0) >= REVIEWS_PER_DAY) return reply(429, { error: 'Daily review limit reached. Try again tomorrow.' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }
  const checked = checkInput(body);
  if (!checked.ok) return reply(400, { error: checked.error });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reply(503, { error: 'The AI coach is not set up yet' });
  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(checked.input) }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
      // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') return reply(502, { error: 'The coach could not review this week. Try again later.' });
    if (response.stop_reason === 'max_tokens') return reply(502, { error: 'The review was cut short. Try again.' });
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const review = parseReview(text);

    const { data: saved, error: saveError } = await supabase
      .from('coach_reviews')
      .insert({
        user_id: userId,
        review,
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      })
      .select('id,created_at')
      .single();
    if (saveError) console.error('coach: saving review failed', saveError.message);

    return reply(200, { review, id: saved?.id ?? null, created_at: saved?.created_at ?? new Date().toISOString() });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return reply(503, { error: 'The coach is busy. Try again in a minute.' });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('coach: Anthropic API key rejected');
      return reply(503, { error: 'The AI coach is not set up correctly' });
    }
    if (e instanceof Anthropic.APIError) {
      console.error('coach: Anthropic API error', e.status, e.message);
      return reply(502, { error: 'The coach is unavailable right now' });
    }
    console.error('coach: unexpected error', e instanceof Error ? e.message : e);
    return reply(500, { error: 'Something went wrong' });
  }
});
