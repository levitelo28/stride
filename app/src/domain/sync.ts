/**
 * Plans the one-way copy from the v9 web app's JSON record into the new tables.
 * Pure: given the legacy record and what's already in the tables, returns the writes to make.
 * Re-running it is safe: every copied row is keyed by a "v9:" external ID.
 */
import { fromLegacyState, legacyActivities, type OverrideRow } from './legacy';
import {
  activityToRow,
  DETACHED,
  planFingerprint,
  sleepToRow,
  V9_PREFIX,
  type ActivityRow,
  type MetricRow,
  type PlanRow,
} from './rows';
import type { Plan } from './types';

export interface LegacySyncInput {
  userId: string;
  legacyState: unknown;
  overrides: OverrideRow[];
  /** external_id values of activities already copied from v9 (all start with "v9:"). */
  existingV9Ids: string[];
  activePlan: Pick<PlanRow, 'id' | 'source' | 'legacy_fingerprint'> | null;
  /** True if a copied web-app plan was ever stored (active or archived). */
  hasLegacyPlan: boolean;
}

export type PlanAction =
  | { type: 'none' }
  | { type: 'create'; plan: Plan; fingerprint: string }
  | { type: 'replace'; planId: string; plan: Plan; fingerprint: string };

export interface LegacySyncPlan {
  activityUpserts: ActivityRow[];
  /** Copied activities that no longer exist in the web app (deleted there). */
  activityDeletes: string[];
  metricUpserts: MetricRow[];
  planAction: PlanAction;
}

export function planLegacySync(input: LegacySyncInput): LegacySyncPlan {
  const { userId, legacyState, overrides, existingV9Ids, activePlan, hasLegacyPlan } = input;

  const byExternal = new Map<string, ActivityRow>();
  for (const a of legacyActivities(legacyState)) {
    const ext = V9_PREFIX + a.id;
    byExternal.set(ext, activityToRow(a, userId, ext));
  }
  const activityUpserts = [...byExternal.values()];

  // Only propagate deletions when the record still has activities; an empty record is more
  // likely a reset or a read problem than the user deleting everything.
  const activityDeletes =
    byExternal.size === 0 ? [] : existingV9Ids.filter((id) => id.startsWith(V9_PREFIX) && !byExternal.has(id));

  const legacy = fromLegacyState(legacyState, overrides);
  const sleepByDate = new Map(legacy.sleep.map((s) => [s.date, s]));
  const metricUpserts = [...sleepByDate.values()].map((s) => sleepToRow(s, userId));

  let planAction: PlanAction = { type: 'none' };
  if (legacy.plan && Object.keys(legacy.plan.sessions).length) {
    const fingerprint = planFingerprint(legacy.plan);
    // Copy the web-app plan only once: if the user has since replaced it, don't bring it back.
    if (!activePlan && !hasLegacyPlan) planAction = { type: 'create', plan: legacy.plan, fingerprint };
    else if (
      activePlan?.source === 'legacy' &&
      activePlan.legacy_fingerprint !== DETACHED &&
      activePlan.legacy_fingerprint !== fingerprint
    )
      planAction = { type: 'replace', planId: activePlan.id, plan: legacy.plan, fingerprint };
    // Plans created or edited in the new app are never overwritten by the web app.
  }

  return { activityUpserts, activityDeletes, metricUpserts, planAction };
}
