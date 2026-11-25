/// <reference types="node" />
// Tests for the server function's pure module (supabase/functions/coach/prompt.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildUserMessage, checkInput, MAX_INPUT_BYTES, parseReview, REVIEW_SCHEMA } from '../../../supabase/functions/coach/prompt';
import { buildCoachInput } from './coach';
import { demoData } from './demo';

test('the app-built summary passes the server check and fits the size cap', () => {
  const input = buildCoachInput(demoData('2026-11-25'), '2026-11-25');
  const r = checkInput({ input });
  assert.ok(r.ok);
  assert.ok(JSON.stringify(input).length < MAX_INPUT_BYTES / 2);
  assert.match(buildUserMessage(input as unknown as Record<string, unknown>), /Today is 2026-11-25/);
});

test('server rejects malformed or oversized input', () => {
  assert.equal(checkInput({}).ok, false);
  assert.equal(checkInput({ input: { today: 'x', weeks: [], recent: [], upcoming: [] } }).ok, false);
  const big = { today: '2026-11-25', weeks: [], recent: [], upcoming: [], pad: 'x'.repeat(MAX_INPUT_BYTES) };
  assert.equal(checkInput({ input: big }).ok, false);
});

test('schema requires every field and forbids extras (structured-output rules)', () => {
  const walk = (s: Record<string, unknown>): void => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...(s.required as string[])].sort(), Object.keys(s.properties as object).sort());
      Object.values(s.properties as Record<string, Record<string, unknown>>).forEach(walk);
    }
    if (s.type === 'array') walk(s.items as Record<string, unknown>);
  };
  walk(REVIEW_SCHEMA as unknown as Record<string, unknown>);
});

test('parseReview trims, caps and drops malformed proposals', () => {
  const review = parseReview(
    JSON.stringify({
      summary: '  Solid week.  ',
      going_well: ['a', 'b', 'c', 'd'],
      needs_attention: [],
      today: 'Easy 5 km.',
      proposals: [
        { action: 'move', date: '2026-11-27', new_date: '2026-11-28', kind: null, label: null, distance_km: null, minutes: null, reason: 'Rest after the long run' },
        { action: 'explode', date: '2026-11-27', reason: 'bad' },
        { action: 'change', date: 'tomorrow', reason: 'bad date' },
        { action: 'change', date: '2026-11-29', new_date: null, kind: 'run', label: 'Easy', distance_km: 8, minutes: 47.6, reason: 'r' },
      ],
    }),
  );
  assert.equal(review.summary, 'Solid week.');
  assert.equal(review.going_well.length, 3);
  assert.equal(review.proposals.length, 2);
  assert.equal(review.proposals[1].minutes, 48);
});
