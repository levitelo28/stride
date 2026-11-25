import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Choice, ErrorText, Field, Row, Sheet, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { addDays, formatDay, formatShort, today } from '@/domain/dates';
import { parseGoalForm, type GoalForm } from '@/domain/forms';
import { buildPlan, GOAL_LABELS, GOAL_TYPES, PlanInputError } from '@/domain/plan';
import type { GoalType, Plan } from '@/domain/types';
import { colors, space } from '@/theme';

const RUNNING: GoalType[] = ['5k', '10k', 'half', 'marathon', 'custom'];

function initialForm(existing: Plan | null): GoalForm {
  const g = existing?.goal;
  const keep = g && g.targetDate && g.targetDate >= today() && existing?.source !== 'legacy';
  return {
    type: keep ? g.type : 'half',
    name: keep ? (g.name ?? '') : '',
    targetDate: keep ? g.targetDate : addDays(today(), 7 * 16),
    runDays: keep ? g.runDays : 3,
    strengthDays: keep ? g.strengthDays : 2,
    baseWeeklyKm: keep && g.baseWeeklyKm ? String(g.baseWeeklyKm) : '',
    currentLongestKm: keep && g.currentLongestKm ? String(g.currentLongestKm) : '',
    constraints: keep ? (g.constraints ?? '') : '',
  };
}

export default function GoalScreen() {
  const { mode, data, replacePlan } = useStore();
  const [form, setForm] = useState<GoalForm>(() => initialForm(data?.plan ?? null));
  const [preview, setPreview] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GoalForm>(k: K, v: GoalForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
  };
  const running = RUNNING.includes(form.type);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (mode === 'signed-out') return <Redirect href="/sign-in" />;

  const makePreview = () => {
    setError(null);
    const goal = parseGoalForm(form);
    if (!goal.ok) return setError(goal.error);
    try {
      setPreview(buildPlan(goal.value, today()));
    } catch (e) {
      setError(e instanceof PlanInputError ? e.message : 'Could not build a plan');
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await replacePlan(preview);
      // Close the modal, then switch to the existing Training tab (replace would stack a second tab navigator).
      if (router.canDismiss()) router.dismiss();
      router.navigate('/training');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan');
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    const weeks = preview.weeks;
    const shown = weeks.length > 8 ? [...weeks.slice(0, 4), null, ...weeks.slice(-3)] : weeks;
    const count = Object.keys(preview.sessions).length;
    return (
      <Sheet title="Review your plan" onClose={close}>
        <View style={{ gap: 4 }}>
          <T variant="eyebrow">{GOAL_LABELS[preview.goal.type]}</T>
          <T variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
            {preview.goal.name || GOAL_LABELS[preview.goal.type]}
          </T>
          <T variant="muted">
            {count} sessions over {weeks.length} weeks · target {formatDay(preview.goal.targetDate)}
          </T>
        </View>
        {preview.warnings.map((w) => (
          <Card key={w} style={{ borderColor: colors.warn }}>
            <T variant="small" style={{ color: colors.warn }}>
              {w}
            </T>
          </Card>
        ))}
        <Card style={{ gap: 0 }}>
          {shown.map((w, i) =>
            w ? (
              <Row key={w.weekStart} style={{ justifyContent: 'space-between', paddingVertical: space.sm }}>
                <T variant="small">Week of {formatShort(w.weekStart)}</T>
                <T style={{ fontWeight: '700' }}>
                  {w.plannedKm !== undefined
                    ? `${w.plannedKm} km${w.longRunKm ? ` · long ${w.longRunKm} km` : ''}`
                    : `${w.sessions} sessions`}
                </T>
              </Row>
            ) : (
              <T key={`gap-${i}`} variant="small" style={{ textAlign: 'center', paddingVertical: 4 }}>
                ⋯
              </T>
            ),
          )}
        </Card>
        <T variant="small">
          A rules-based starting plan, not medical advice. You can edit or move any session, and nothing you’ve already
          logged is changed.{data?.plan ? ' Your current plan will be archived.' : ''}
        </T>
        <ErrorText>{error}</ErrorText>
        <Button label="Save this plan" onPress={save} busy={busy} />
        <Button label="Back to edit" kind="secondary" onPress={() => setPreview(null)} />
      </Sheet>
    );
  }

  return (
    <Sheet title={data?.plan ? 'New goal' : 'Set your goal'} onClose={close}>
      <Choice
        label="What are you training for?"
        value={form.type}
        options={GOAL_TYPES.map((t) => ({ value: t, label: GOAL_LABELS[t] }))}
        onChange={(v) => set('type', v)}
      />
      <Field
        label="Name (optional)"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        placeholder={running ? 'e.g. Berlin Half' : 'e.g. Stronger by summer'}
        maxLength={100}
      />
      <Field
        label="Target date"
        value={form.targetDate}
        onChangeText={(v) => set('targetDate', v)}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        hint={running ? 'Race or goal day' : 'When you want to reach your goal'}
      />
      {running ? (
        <>
          <Choice
            label="Runs per week"
            value={form.runDays}
            options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            onChange={(v) => set('runDays', v)}
          />
          <Field
            label="Kilometres you run per week now"
            value={form.baseWeeklyKm}
            onChangeText={(v) => set('baseWeeklyKm', v)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="e.g. 20"
          />
          <Field
            label="Your longest recent run (km)"
            value={form.currentLongestKm}
            onChangeText={(v) => set('currentLongestKm', v)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="e.g. 10"
          />
        </>
      ) : null}
      <Choice
        label="Strength days per week"
        value={form.strengthDays}
        options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
        onChange={(v) => set('strengthDays', v)}
      />
      <Field
        label="Injuries or limitations (optional)"
        value={form.constraints}
        onChangeText={(v) => set('constraints', v)}
        placeholder="e.g. sore Achilles, can't run Mondays"
        multiline
        maxLength={600}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Preview my plan" onPress={makePreview} />
    </Sheet>
  );
}
