/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAuthLink } from './auth-link';

test('reads tokens from an implicit-flow sign-in link', () => {
  assert.deepEqual(parseAuthLink('stride://#access_token=AAA&expires_in=3600&refresh_token=RRR&token_type=bearer&type=magiclink'), {
    kind: 'session',
    accessToken: 'AAA',
    refreshToken: 'RRR',
  });
});

test('reads a PKCE code and Supabase errors', () => {
  assert.deepEqual(parseAuthLink('stride:///?code=abc123'), { kind: 'code', code: 'abc123' });
  assert.deepEqual(parseAuthLink('stride://#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), {
    kind: 'error',
    message: 'Email link is invalid or has expired',
  });
});

test('ignores ordinary app links', () => {
  assert.equal(parseAuthLink(null), null);
  assert.equal(parseAuthLink('stride://training'), null);
  assert.equal(parseAuthLink('exp+stride://expo-development-client/?url=http%3A%2F%2F192.168.1.73%3A8081'), null);
});
