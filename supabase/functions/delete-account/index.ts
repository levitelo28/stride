// Stride: permanently delete the signed-in user's account. POST { confirm: "DELETE" }.
// The caller is identified by their own JWT; only then is the service-role client used, and only for that user.
// Every Stride table references auth.users with ON DELETE CASCADE, so deleting the auth user removes all
// their rows. Storage objects don't cascade, so the user's meal-photos folder is emptied first.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

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
  if (!authHeader) return reply(401, { error: 'Sign in to delete your account' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: 'Sign in to delete your account' });
  const userId = userData.user.id;

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the check below
  }
  if (body.confirm !== 'DELETE') return reply(400, { error: 'Confirmation missing' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Meal photos live under <userId>/ in the meal-photos bucket.
  for (;;) {
    const { data: files, error } = await admin.storage.from('meal-photos').list(userId, { limit: 100 });
    if (error) return reply(500, { error: 'Could not delete your photos, so your account was not deleted. Try again.' });
    if (!files?.length) break;
    const { error: removeError } = await admin.storage.from('meal-photos').remove(files.map((f) => `${userId}/${f.name}`));
    if (removeError) return reply(500, { error: 'Could not delete your photos, so your account was not deleted. Try again.' });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('deleteUser failed', userId, deleteError.message);
    return reply(500, { error: 'Could not delete your account. Try again, or email us.' });
  }
  console.log('account deleted', userId);
  return reply(200, { deleted: true });
});
