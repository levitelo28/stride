/** Supabase reads and writes for the new tables. */
import type { CoachInput } from '@/domain/coach';
import type { HealthRead } from '@/health/types';
import { addDays, today } from '@/domain/dates';
import type { OverrideRow } from '@/domain/legacy';
import {
  activityFromRow,
  activityToRow,
  DETACHED,
  planFromRows,
  seriesFromRows,
  sessionToRow,
  sleepFromRows,
  V9_PREFIX,
  type ActivityRow,
  type MetricRow,
  type PlanRow,
  type PlanSessionRow,
} from '@/domain/rows';
import { dedupeActivities } from '@/domain/stats';
import type { CoachReview } from '@/domain/proposals';
import { planLegacySync } from '@/domain/sync';
import type { Activity, Plan, PlannedSession, UserData } from '@/domain/types';
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
  const [state, overrides, existing, plan, legacyPlans] = await Promise.all([
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
    supabase.from('plans').select('id').eq('user_id', userId).eq('source', 'legacy').limit(1),
  ]);
  fail(state.error, 'Reading web-app record');
  fail(legacyPlans.error, 'Reading plans');
  fail(overrides.error, 'Reading web-app plan');
  if (!state.data) return { activities: 0, deleted: 0, sleep: 0, plan: 'none' };

  const sync = planLegacySync({
    userId,
    legacyState: state.data.state,
    overrides: (overrides.data ?? []) as OverrideRow[],
    existingV9Ids: existing.map((r) => r.external_id),
    activePlan: plan,
    hasLegacyPlan: (legacyPlans.data ?? []).length > 0,
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
  const metricsSince = addDays(today(), -90);
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
          .in('metric', ['sleep_hours', 'resting_hr', 'hrv_sdnn_ms'])
          .gte('local_date', metricsSince)
          .range(from, to),
      'Loading daily metrics',
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
    restingHr: seriesFromRows(metrics, 'resting_hr'),
    hrv: seriesFromRows(metrics, 'hrv_sdnn_ms'),
    plan: plan ? planFromRows(plan, sessions) : null,
  };
}

// ---- Writes from the app's own screens ----

/** Archive the active plan and save `plan` as the new active plan, atomically (database function). */
export async function replacePlan(plan: Plan): Promise<void> {
  const sessions = Object.values(plan.sessions).map((s) => {
    const { plan_id: _p, user_id: _u, edited: _e, ...row } = sessionToRow(s, '', '');
    return row;
  });
  const { error } = await supabase.rpc('stride_replace_active_plan', {
    p_goal: plan.goal,
    p_warnings: plan.warnings,
    p_sessions: sessions,
  });
  fail(error, 'Saving plan');
}

/** Insert or update one planned session. Editing a copied web-app plan detaches it from the web app. */
export async function saveSession(plan: Plan, session: PlannedSession, userId: string): Promise<void> {
  if (!plan.id) throw new Error('This plan has not been saved yet');
  const { plan_id, user_id, ...fields } = sessionToRow(session, plan.id, userId);
  if (session.id) {
    const { error } = await supabase.from('plan_sessions').update(fields).eq('id', session.id);
    fail(error, 'Saving session');
  } else {
    const { error } = await supabase.from('plan_sessions').insert({ plan_id, user_id, ...fields });
    fail(error, 'Adding session');
  }
  await detachIfCopied(plan);
}

export async function deleteSession(plan: Plan, session: PlannedSession): Promise<void> {
  if (!session.id) throw new Error('This session has not been saved yet');
  const { error } = await supabase.from('plan_sessions').delete().eq('id', session.id);
  fail(error, 'Removing session');
  await detachIfCopied(plan);
}

async function detachIfCopied(plan: Plan): Promise<void> {
  if (plan.source !== 'legacy' || !plan.id) return;
  const { error } = await supabase.from('plans').update({ legacy_fingerprint: DETACHED }).eq('id', plan.id);
  fail(error, 'Updating plan');
}

/** Log or update a workout entered in this app (never a copy from the web app). */
export async function saveActivity(activity: Omit<Activity, 'id'> & { id?: string }, userId: string): Promise<void> {
  if (activity.fromWebApp) throw new Error('Edit this workout in the web app');
  const { user_id, external_id: _x, ...fields } = activityToRow({ id: '', ...activity }, userId, null);
  if (activity.id) {
    const { error } = await supabase.from('activities').update(fields).eq('id', activity.id).is('external_id', null);
    fail(error, 'Saving workout');
  } else {
    const { error } = await supabase.from('activities').insert({ user_id, ...fields });
    fail(error, 'Logging workout');
  }
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id).is('external_id', null);
  fail(error, 'Deleting workout');
}

// ---- AI coach ----

export interface SavedReview {
  review: CoachReview;
  createdAt: string;
}

export async function loadCoachState(userId: string): Promise<{ consentAt: string | null; latest: SavedReview | null }> {
  const [profile, latest] = await Promise.all([
    supabase.from('profiles').select('ai_coach_consent_at').eq('user_id', userId).maybeSingle(),
    supabase
      .from('coach_reviews')
      .select('review,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  fail(profile.error, 'Loading coach settings');
  fail(latest.error, 'Loading last review');
  return {
    consentAt: (profile.data?.ai_coach_consent_at as string | null) ?? null,
    latest: latest.data ? { review: latest.data.review as CoachReview, createdAt: latest.data.created_at as string } : null,
  };
}

export async function setCoachConsent(userId: string, on: boolean): Promise<string | null> {
  const consentAt = on ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, ai_coach_consent_at: consentAt }, { onConflict: 'user_id' });
  fail(error, 'Saving coach setting');
  return consentAt;
}

export async function requestReview(input: CoachInput): Promise<SavedReview> {
  const { data, error } = await supabase.functions.invoke('coach', { body: { input } });
  if (error) {
    // Error responses carry { error: "<message for the user>" }.
    let message = 'The coach is unavailable right now';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // keep the default message
      }
    }
    throw new Error(message);
  }
  const d = data as { review: CoachReview; created_at: string };
  return { review: d.review, createdAt: d.created_at };
}

// ---- Apple Health ----

/** Write one Health read to the tables. Idempotent: workouts are keyed by their HealthKit UUID. */
export async function writeHealth(userId: string, read: HealthRead): Promise<void> {
  const rows = read.activities.map((a) => activityToRow(a, userId, a.id));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('activities')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,source,external_id' });
    fail(error, 'Saving Health workouts');
  }
  for (let i = 0; i < read.deletedIds.length; i += CHUNK) {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'apple_health')
      .in('external_id', read.deletedIds.slice(i, i + CHUNK));
    fail(error, 'Removing deleted Health workouts');
  }
  const metric = (m: MetricRow['metric'], list: { date: string; value: number }[]): MetricRow[] =>
    list.map((x) => ({ user_id: userId, local_date: x.date, metric: m, value: x.value, source: 'apple_health' }));
  const metrics = [
    ...metric('sleep_hours', read.sleep.map((s) => ({ date: s.date, value: s.hours }))),
    ...metric('resting_hr', read.restingHr),
    ...metric('hrv_sdnn_ms', read.hrv),
  ];
  for (let i = 0; i < metrics.length; i += CHUNK) {
    const { error } = await supabase
      .from('daily_metrics')
      .upsert(metrics.slice(i, i + CHUNK), { onConflict: 'user_id,local_date,metric,source' });
    fail(error, 'Saving Health metrics');
  }
}
