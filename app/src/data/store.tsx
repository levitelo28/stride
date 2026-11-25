import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { today } from '@/domain/dates';
import { demoData } from '@/domain/demo';
import { fromLegacyState, type OverrideRow } from '@/domain/legacy';
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

async function loadCloudData(userId: string): Promise<UserData> {
  const [state, overrides] = await Promise.all([
    supabase.from('stride_user_state').select('state').eq('user_id', userId).maybeSingle(),
    supabase
      .from('stride_training_overrides')
      .select('training_date,activity,planned_km,instructions')
      .eq('user_id', userId)
      .order('training_date'),
  ]);
  if (state.error) throw state.error;
  if (overrides.error) throw overrides.error;
  return fromLegacyState(state.data?.state, (overrides.data ?? []) as OverrideRow[]);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (s: Session) => {
    setRefreshing(true);
    try {
      setData(await loadCloudData(s.user.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data');
    } finally {
      setRefreshing(false);
    }
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
