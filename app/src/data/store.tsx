import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { loadUserData, syncFromWebApp } from '@/data/repo';
import { today } from '@/domain/dates';
import { demoData } from '@/domain/demo';
import type { UserData } from '@/domain/types';
import { supabase } from '@/lib/supabase';

type Mode = 'loading' | 'signed-out' | 'demo' | 'cloud';

interface StoreValue {
  mode: Mode;
  session: Session | null;
  data: UserData | null;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  enterDemo: () => void;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback((s: Session) => {
    // getSession and onAuthStateChange both fire at startup; run one load at a time.
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      setRefreshing(true);
      let syncError: string | null = null;
      try {
        // Copy anything new from the web app first; a failure here shouldn't hide existing data.
        await syncFromWebApp(s.user.id).catch((e) => {
          syncError = `Web-app sync failed: ${message(e, 'unknown error')}`;
        });
        setData(await loadUserData(s.user.id));
        setError(syncError);
      } catch (e) {
        setError(message(e, 'Could not load your data'));
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setMode((m) => (m === 'demo' ? m : s ? 'cloud' : 'signed-out'));
      if (s) load(s);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setMode('cloud');
        load(s);
      } else {
        setMode((m) => (m === 'demo' ? m : 'signed-out'));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<StoreValue>(
    () => ({
      mode,
      session,
      data,
      error,
      refreshing,
      refresh: async () => {
        if (mode === 'cloud' && session) await load(session);
      },
      enterDemo: () => {
        setData(demoData(today()));
        setMode('demo');
      },
      signOut: async () => {
        if (mode === 'demo') {
          setData(null);
          setMode('signed-out');
          return;
        }
        await supabase.auth.signOut();
        setData(null);
        setMode('signed-out');
      },
    }),
    [mode, session, data, error, refreshing, load],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
