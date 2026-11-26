/**
 * Reads the session (or error) from a Supabase sign-in link that opened the app, e.g.
 * stride://#access_token=...&refresh_token=...&type=magiclink  (implicit flow, the supabase-js default)
 * stride://?code=...                                            (PKCE flow)
 */
export type AuthLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | null;

export function parseAuthLink(url: string | null | undefined): AuthLink {
  if (!url) return null;
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(hash);
  new URLSearchParams(query).forEach((v, k) => {
    if (!params.has(k)) params.set(k, v);
  });
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', message: error.replace(/\+/g, ' ') };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return null;
}
