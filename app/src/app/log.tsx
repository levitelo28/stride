// Log a workout, or edit/delete one logged in this app. Route: /log?date=YYYY-MM-DD or /log?id=<activity id>
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

import { activitySummary } from '@/components/sessions';
import { Button, Choice, ErrorText, Field, Row, Sheet, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { addDays, formatDay, isISODate, today } from '@/domain/dates';
import { parseActivityForm, type ActivityForm } from '@/domain/forms';
import type { ActivityKind } from '@/domain/types';

const KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'walk', label: 'Walk' },
  { value: 'ride', label: 'Ride' },
  { value: 'swim', label: 'Swim' },
  { value: 'strength', label: 'Strength' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'other', label: 'Other' },
];

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Delete workout?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function LogScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const { mode, data, saveActivity, deleteActivity } = useStore();
  const existing = params.id ? data?.activities.find((a) => a.id === params.id) : undefined;
  const now = today();
  const [form, setForm] = useState<ActivityForm>(() =>
    existing
      ? {
          date: existing.date,
          kind: existing.kind,
          name: existing.name ?? '',
          distanceKm: existing.distanceKm ? String(existing.distanceKm) : '',
          minutes: existing.durationSec ? String(Math.round(existing.durationSec / 60)) : '',
          rpe: existing.rpe ? String(existing.rpe) : '',
          notes: existing.notes ?? '',
        }
      : {
          date: isISODate(params.date) && params.date <= now ? params.date : now,
          kind: 'run',
          name: '',
          distanceKm: '',
          minutes: '',
          rpe: '',
          notes: '',
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ActivityForm>(k: K, v: ActivityForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (mode === 'signed-out') return <Redirect href="/sign-in" />;

  if (existing?.fromWebApp)
    return (
      <Sheet title="Workout" onClose={close}>
        <T variant="h2">{existing.name ?? 'Workout'}</T>
        <T variant="muted">
          {formatDay(existing.date)} · {activitySummary(existing)}
        </T>
        <T variant="small">This workout was copied from the web app. Edit or delete it there; this app picks up the change.</T>
      </Sheet>
    );

  const save = async () => {
    const parsed = parseActivityForm(form, now);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    setError(null);
    try {
      await saveActivity({ ...parsed.value, id: existing?.id });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || !(await confirm('Delete this workout? This cannot be undone.'))) return;
    setBusy(true);
    try {
      await deleteActivity(existing.id);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
      setBusy(false);
    }
  };

  return (
    <Sheet title={existing ? 'Edit workout' : 'Log a workout'} onClose={close}>
      <Choice label="What did you do?" value={form.kind} options={KINDS} onChange={(v) => set('kind', v)} />
      <Field label="Date" value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <Row>
        <T variant="small" onPress={() => set('date', now)} accessibilityRole="button">
          Today
        </T>
        <T variant="small" onPress={() => set('date', addDays(now, -1))} accessibilityRole="button">
          Yesterday
        </T>
      </Row>
      <Field
        label="Distance (km)"
        value={form.distanceKm}
        onChangeText={(v) => set('distanceKm', v)}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={form.kind === 'run' ? 'e.g. 8' : 'optional'}
      />
      <Field
        label="Duration (minutes)"
        value={form.minutes}
        onChangeText={(v) => set('minutes', v)}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="e.g. 45"
      />
      <Field
        label="Effort, 1–10 (optional)"
        value={form.rpe}
        onChangeText={(v) => set('rpe', v)}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        hint="1 = very easy, 10 = all-out"
      />
      <Field label="Name (optional)" value={form.name} onChangeText={(v) => set('name', v)} maxLength={200} />
      <Field
        label="Notes (optional)"
        value={form.notes}
        onChangeText={(v) => set('notes', v)}
        multiline
        maxLength={2000}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <ErrorText>{error}</ErrorText>
      <Button label={existing ? 'Save changes' : 'Save workout'} onPress={save} busy={busy} />
      {existing ? <Button label="Delete workout" kind="secondary" onPress={remove} disabled={busy} /> : null}
    </Sheet>
  );
}
