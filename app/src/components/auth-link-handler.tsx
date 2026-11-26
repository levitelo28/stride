// Completes sign-in when an emailed Supabase link opens the iPhone/Android app (stride://…).
// On the web, supabase-js reads the link from the page URL itself (detectSessionInUrl).
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { parseAuthLink } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';

export function AuthLinkHandler() {
  const url = Linking.useLinkingURL();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    const link = parseAuthLink(url);
    if (!link) return;
    handled.current = url;
    const done = ({ error }: { error: { message: string } | null }) => {
      if (error) Alert.alert('Sign-in failed', error.message);
    };
    if (link.kind === 'session')
      supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken }).then(done);
    else if (link.kind === 'code') supabase.auth.exchangeCodeForSession(link.code).then(done);
    else Alert.alert('Sign-in link problem', `${link.message}. Request a new link.`);
  }, [url]);

  return null;
}
