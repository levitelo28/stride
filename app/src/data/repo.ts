/** Supabase reads and writes for the new tables. */
import { addDays, today } from '@/domain/dates';
import type { OverrideRow } from '@/domain/legacy';
import {
  activityFromRow,
  planFromRows,
  sessionToRow,
  sleepFromRows,
  V9_PREFIX,
  type ActivityRow,
  type MetricRow,
  type PlanRow,
  type PlanSessionRow,
} from '@/domain/rows';
import { dedupeActivities } from '@/domain/stats';
import { planLegacySync } from '@/domain/sync';
import type { UserData } from '@/domain/types';
import { supabase } from '@/lib/supabase';

const PAGE = 1000; // PostgREST's default maximum rows per request
const CHUNK = 500;

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Fetch every row of a query, a page at a time. */
async function all<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    fail(error, what);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const ACTIVITY_COLUMNS = 'id,user_id,source,external_id,kind,name,local_date,duration_sec,distance_km,avg_hr,rpe,notes';
const SESSION_COLUMNS = 'plan_id,user_id,local_date,kind,label,distance_km,minutes,note,edited';

async function activePlan(userId: string): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from('plans')
    .select('id,user_id,status,source,goal,warnings,legacy_fingerprint,created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  fail(error, 'Loading plan');
  return (data as PlanRow | null) ?? null;
}

export interface SyncReport {
  activities: number;
  deleted: number;
  sleep: number;
  plan: 'none' | 'create' | 'replace';
}

/**
 * Copy the v9 web app's record into the new tables. Safe to run on every launch:
 * rows are keyed by "v9:" external IDs, and plans made in the new app are never touched.
 */
export async function syncFromWebApp(userId: string): Promise<SyncReport> {
  const [state, overrides, existing, plan] = await Promise.all([
    supabase.from('stride_user_state').select('state').eq('user_id', userId).maybeSingle(),
    supabase
      .from('stride_training_overrides')
      .select('training_date,activity,planned_km,instructions')
      .eq('user_id', userId)
      .order('training_date'),
    all<{ external_id: string }>(
      (from, to) =>
        supabase.from('activities').select('external_id').eq('user_id', userId).like('external_id', `${V9_PREFIX}%`).range(from, to),
      'Reading copied activities',
    ),
    activePlan(userId),
  ]);
  fail(state.error, 'Reading web-app record');
  fail(overrides.error, 'Reading web-app plan');
  if (!state.data) return { activities: 0, deleted: 0, sleep: 0, plan: 'none' };

  const sync = planLegacySync({
    userId,
    legacyState: state.data.state,
    overrides: (overrides.data ?? []) as OverrideRow[],
    existingV9Ids: existing.map((r) => r.external_id),
    activePlan: plan,
  });

  for (let i = 0; i < sync.activityUpserts.length; i += CHUNK) {
    const { error } = await supabase
      .from('activities')
      .upsert(sync.activityUpserts.slice(i, i + CHUNK), { onConflict: 'user_id,source,external_id' });
    fail(error, 'Copying activities');
  }
  for (let i = 0; i < sync.activityDeletes.length; i += CHUNK) {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .in('external_id', sync.activityDeletes.slice(i, i + CHUNK));
    fail(error, 'Removing deleted activities');
  }
  if (sync.metricUpserts.length) {
    const { error } = await supabase
      .from('daily_metrics')
      .upsert(sync.metricUpserts, { onConflict: 'user_id,local_date,metric,source' });
    fail(error, 'Copying sleep');
  }

  const action = sync.planAction;
  if (action.type !== 'none') {
    let planId: string;
    if (action.type === 'create') {
      const { data, error } = await supabase
        .from('plans')
        .insert({ user_id: userId, source: 'legacy', goal: action.plan.goal, warnings: action.plan.warnings })
        .select('id')
        .single();
      fail(error, 'Creating plan');
      planId = (data as { id: string }).id;
    } else {
      planId = action.planId;
      const { error } = await supabase.from('plan_sessions').delete().eq('plan_id', planId);
      fail(error, 'Clearing old plan sessions');
    }
    const rows = Object.values(action.plan.sessions).map((s) => sessionToRow(s, planId, userId));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('plan_sessions').insert(rows.slice(i, i + CHUNK));
      fail(error, 'Copying plan sessions');
    }
    // Written last, so an interrupted copy is retried on the next launch.
    const { error } = await supabase
      .from('plans')
      .update({ legacy_fingerprint: action.fingerprint, goal: action.plan.goal })
      .eq('id', planId);
    fail(error, 'Finishing plan copy');
  }

  return {
    activities: sync.activityUpserts.length,
    deleted: sync.activityDeletes.length,
    sleep: sync.metricUpserts.length,
    plan: action.type,
  };
}

export async function loadUserData(userId: string): Promise<UserData> {
  const sleepSince = addDays(today(), -90);
  const [activities, metrics, plan] = await Promise.all([
    all<ActivityRow>(
      (from, to) =>
        supabase
          .from('activities')
          .select(ACTIVITY_COLUMNS)
          .eq('user_id', userId)
          .order('local_date', { ascending: false })
          .order('id')
          .range(from, to),
      'Loading activities',
    ),
    all<MetricRow>(
      (from, to) =>
        supabase
          .from('daily_metrics')
          .select('user_id,local_date,metric,value,source')
          .eq('user_id', userId)
          .eq('metric', 'sleep_hours')
          .gte('local_date', sleepSince)
          .range(from, to),
      'Loading sleep',
    ),
    activePlan(userId),
  ]);
  const sessions = plan
    ? await all<PlanSessionRow>(
        (from, to) =>
          supabase.from('plan_sessions').select(SESSION_COLUMNS).eq('plan_id', plan.id).order('local_date').range(from, to),
        'Loading plan sessions',
      )
    : [];
  return {
    activities: dedupeActivities(activities.map(activityFromRow)),
    sleep: sleepFromRows(metrics),
    plan: plan ? planFromRows(plan, sessions) : null,
  };
}
