// Prompt, output schema and response validation for the coach. Plain TypeScript, no Deno APIs,
// so it is unit-tested from the app (app/src/domain/coach-prompt.test.ts).

export const MODEL = 'claude-opus-5-5';
export const MAX_INPUT_BYTES = 24_000;

export const SYSTEM_PROMPT = `You are Stride's running and fitness coach. You write a short weekly review for one athlete from a JSON summary of their training.

What you receive: their goal, six weeks of planned vs completed running (oldest first, the last week is the current, partial week), recent workouts with optional effort ratings (RPE 1-10) and notes, recent sleep, a load ratio (last 7 days vs 28-day weekly average), recovery signals from Apple Health when available (7-day resting heart rate and HRV vs their own baseline; null means no data), the next 14 days of planned sessions, and insights Stride's rule engine already detected.

How to coach:
- Be specific to their numbers. Mention actual distances, dates and trends. No generic advice.
- For counts and totals, quote the "totals" field exactly; don't recount from the weekly table.
- Be honest and encouraging. Say what is going well before what needs attention.
- Favour consistency and easy running. Never suggest making up missed distance. Treat load ratio above 1.3, average RPE of 8+, short sleep, resting heart rate 5+ bpm above baseline, HRV 15%+ below baseline, or notes about pain as reasons to ease off. Compare recovery numbers only to the athlete's own baseline, never to population norms.
- You are not a doctor. If notes mention pain, injury or illness, recommend rest and seeing a qualified professional rather than training through it.
- Plan changes are optional. Propose at most 3, only for dates on or after today, only when they clearly help. Prefer reducing, moving or swapping sessions over adding load. Never change a race/event session. Every proposal is checked against safety rules and must be approved by the athlete.
- If there is little data, say so briefly and keep the review short.

Output fields:
- summary: 1-2 sentences on how training is going overall.
- going_well: up to 3 short points.
- needs_attention: up to 3 short points (empty if nothing).
- today: one sentence of guidance for today's session or rest day.
- proposals: plan changes. action is "move" (set new_date), "change" (set any of kind, label, distance_km, minutes), "remove", or "add" (set kind and label, plus distance_km or minutes). date is the existing session's date (or the empty day for "add"). Use null for fields that don't apply. reason: one sentence the athlete will read.

Write in plain, friendly English using kilometres. Keep the whole review under 200 words.`;

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'going_well', 'needs_attention', 'today', 'proposals'],
  properties: {
    summary: { type: 'string' },
    going_well: { type: 'array', items: { type: 'string' } },
    needs_attention: { type: 'array', items: { type: 'string' } },
    today: { type: 'string' },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'date', 'new_date', 'kind', 'label', 'distance_km', 'minutes', 'reason'],
        properties: {
          action: { type: 'string', enum: ['move', 'change', 'remove', 'add'] },
          date: { type: 'string', format: 'date' },
          new_date: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
          kind: { anyOf: [{ type: 'string', enum: ['run', 'long', 'strength', 'other'] }, { type: 'null' }] },
          label: nullable('string'),
          distance_km: nullable('number'),
          minutes: nullable('integer'),
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface ReviewProposal {
  action: 'move' | 'change' | 'remove' | 'add';
  date: string;
  new_date: string | null;
  kind: 'run' | 'long' | 'strength' | 'other' | null;
  label: string | null;
  distance_km: number | null;
  minutes: number | null;
  reason: string;
}

export interface Review {
  summary: string;
  going_well: string[];
  needs_attention: string[];
  today: string;
  proposals: ReviewProposal[];
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Light structural check of the app-built summary; the size cap bounds cost. */
export function checkInput(raw: unknown): { ok: true; input: Obj } | { ok: false; error: string } {
  if (!isObj(raw) || !isObj(raw.input)) return { ok: false, error: 'Expected { input: {...} }' };
  const input = raw.input;
  const size = new TextEncoder().encode(JSON.stringify(input)).length;
  if (size > MAX_INPUT_BYTES) return { ok: false, error: 'Training summary is too large' };
  if (typeof input.today !== 'string' || !DATE.test(input.today)) return { ok: false, error: 'Missing today' };
  if (!Array.isArray(input.weeks) || !Array.isArray(input.recent) || !Array.isArray(input.upcoming))
    return { ok: false, error: 'Malformed training summary' };
  return { ok: true, input };
}

export function buildUserMessage(input: Obj): string {
  return `Here is my training summary as JSON. Today is ${input.today}.\n\n${JSON.stringify(input)}`;
}

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const strs = (x: unknown, n: number) => (Array.isArray(x) ? x.map((s) => str(s, 300)).filter(Boolean).slice(0, n) : []);
const numOrNull = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Parse and sanitise the model's JSON. Structured output guarantees the shape; this bounds sizes and drops bad items. */
export function parseReview(text: string): Review {
  const raw: unknown = JSON.parse(text);
  if (!isObj(raw)) throw new Error('Review is not an object');
  const proposals: ReviewProposal[] = [];
  for (const p of Array.isArray(raw.proposals) ? raw.proposals : []) {
    if (!isObj(p) || !['move', 'change', 'remove', 'add'].includes(String(p.action))) continue;
    if (typeof p.date !== 'string' || !DATE.test(p.date)) continue;
    proposals.push({
      action: p.action as ReviewProposal['action'],
      date: p.date,
      new_date: typeof p.new_date === 'string' && DATE.test(p.new_date) ? p.new_date : null,
      kind: ['run', 'long', 'strength', 'other'].includes(String(p.kind)) ? (p.kind as ReviewProposal['kind']) : null,
      label: str(p.label, 200) || null,
      distance_km: numOrNull(p.distance_km),
      minutes: numOrNull(p.minutes) === null ? null : Math.round(p.minutes as number),
      reason: str(p.reason, 300),
    });
    if (proposals.length === 3) break;
  }
  return {
    summary: str(raw.summary, 600),
    going_well: strs(raw.going_well, 3),
    needs_attention: strs(raw.needs_attention, 3),
    today: str(raw.today, 300),
    proposals,
  };
}
