import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as repo from '@/data/repo';
import { loadUserData, syncFromWebApp } from '@/data/repo';
import { today } from '@/domain/dates';
import { demoData } from '@/domain/demo';
import { applySessionEdit, removeSession } from '@/domain/forms';
import { dedupeActivities } from '@/domain/stats';
import type { Activity, ISODate, Plan, PlannedSession, UserData } from '@/domain/types';
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
  /** Writes. Each throws an Error with a user-facing message on failure. */
  replacePlan: (plan: Plan) => Promise<void>;
  saveSession: (fromDate: ISODate | null, session: PlannedSession) => Promise<void>;
  deleteSession: (date: ISODate) => Promise<void>;
  saveActivity: (activity: Omit<Activity, 'id'> & { id?: string }) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
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

  // After a cloud write, re-read the tables (no web-app sync needed).
  const reload = useCallback(async () => {
    if (session) setData(await loadUserData(session.user.id));
  }, [session]);

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

      replacePlan: async (plan) => {
        if (mode === 'demo') return setData((d) => d && { ...d, plan: { ...plan, source: 'rules' } });
        await repo.replacePlan(plan);
        await reload();
      },
      saveSession: async (fromDate, edited) => {
        const plan = data?.plan;
        if (!plan) throw new Error('Set a goal first');
        const result = fromDate
          ? applySessionEdit(plan, fromDate, edited)
          : plan.sessions[edited.date]
            ? { ok: false as const, error: `There is already a session on ${edited.date}.` }
            : { ok: true as const, value: { ...plan, sessions: { ...plan.sessions, [edited.date]: edited } } };
        if (!result.ok) throw new Error(result.error);
        if (mode === 'demo') return setData((d) => d && { ...d, plan: result.value });
        if (!session) throw new Error('Sign in again to save');
        const original = fromDate ? plan.sessions[fromDate] : undefined;
        await repo.saveSession(plan, { ...edited, id: original?.id }, session.user.id);
        await reload();
      },
      deleteSession: async (date) => {
        const plan = data?.plan;
        const s = plan?.sessions[date];
        if (!plan || !s) return;
        if (mode === 'demo') return setData((d) => d && { ...d, plan: removeSession(plan, date) });
        await repo.deleteSession(plan, s);
        await reload();
      },
      saveActivity: async (activity) => {
        if (mode === 'demo')
          return setData((d) => {
            if (!d) return d;
            const id = activity.id ?? `demo-${Date.now()}`;
            const rest = d.activities.filter((a) => a.id !== id);
            return { ...d, activities: dedupeActivities([{ ...activity, id }, ...rest]) };
          });
        if (!session) throw new Error('Sign in again to save');
        await repo.saveActivity(activity, session.user.id);
        await reload();
      },
      deleteActivity: async (id) => {
        if (mode === 'demo') return setData((d) => d && { ...d, activities: d.activities.filter((a) => a.id !== id) });
        await repo.deleteActivity(id);
        await reload();
      },
    }),
    [mode, session, data, error, refreshing, load, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
