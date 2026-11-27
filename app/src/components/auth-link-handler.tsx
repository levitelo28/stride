// Completes sign-in when an emailed Supabase link opens the iPhone/Android app (stride://…).
// On the web, supabase-js reads the link from the page URL itself (detectSessionInUrl).
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { isNetworkError, parseAuthLink, type AuthLink } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';

type Result = { error: { name?: string; message: string; status?: number } | null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// iOS can cancel requests made while Mail is still handing the link over, so start once the app is active.
function whenActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

async function completeSignIn(link: Exclude<AuthLink, null | { kind: 'error' }>): Promise<Result> {
  let result: Result = { error: null };
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await wait(800 * attempt);
    await whenActive();
    result =
      link.kind === 'session'
        ? await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
        : await supabase.auth.exchangeCodeForSession(link.code);
    if (!result.error || !isNetworkError(result.error)) return result;
    console.warn(`Sign-in link: attempt ${attempt + 1} failed (${result.error.message}); retrying`);
  }
  return result;
}

export function AuthLinkHandler() {
  const url = Linking.useLinkingURL();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    const link = parseAuthLink(url);
    if (!link) return;
    handled.current = url;
    if (link.kind === 'error') {
      Alert.alert('Sign-in link problem', `${link.message}. Request a new link.`);
      return;
    }
    completeSignIn(link).then(async ({ error }) => {
      if (!error) return;
      // A link can be delivered twice; if an earlier attempt already signed in, say nothing.
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      console.warn('Sign-in link failed:', error.name, error.message);
      Alert.alert(
        'Sign-in failed',
        isNetworkError(error)
          ? 'Stride couldn’t reach the server. Check your connection, then tap the link in the email again.'
          : `${error.message}. Request a new link.`,
      );
    });
  }, [url]);

  return null;
}
