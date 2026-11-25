// Edit, move, add or remove one planned session. Route: /session?date=YYYY-MM-DD
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Alert } from 'react-native';

import { Button, Choice, ErrorText, Field, Sheet, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { formatDay, isISODate, today } from '@/domain/dates';
import { parseSessionForm, sessionToForm, type SessionForm } from '@/domain/forms';
import type { SessionKind } from '@/domain/types';

const KINDS: { value: SessionKind; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'long', label: 'Long run' },
  { value: 'strength', label: 'Strength' },
  { value: 'other', label: 'Other' },
  { value: 'event', label: 'Race / event' },
];

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Remove session?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function SessionScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = isISODate(params.date) ? params.date : today();
  const { mode, data, saveSession, deleteSession } = useStore();
  const existing = data?.plan?.sessions[date];
  const [form, setForm] = useState<SessionForm>(() =>
    existing ? sessionToForm(existing) : { date, kind: 'run', label: 'Easy run', distanceKm: '', minutes: '', note: '' },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SessionForm>(k: K, v: SessionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/training'));
  if (mode === 'signed-out') return <Redirect href="/sign-in" />;

  if (!data?.plan)
    return (
      <Sheet title="Session" onClose={close}>
        <T variant="muted">Set a goal first; then you can edit any session in your plan.</T>
        <Button label="Set a goal" onPress={() => router.replace('/goal')} />
      </Sheet>
    );

  const save = async () => {
    const parsed = parseSessionForm(form);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    setError(null);
    try {
      await saveSession(existing ? date : null, parsed.value);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`Remove “${existing?.label}” on ${formatDay(date)}? Workouts you've logged are not affected.`)))
      return;
    setBusy(true);
    try {
      await deleteSession(date);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove');
      setBusy(false);
    }
  };

  return (
    <Sheet title={existing ? 'Edit session' : `Add session · ${formatDay(date)}`} onClose={close}>
      {data.plan.source === 'legacy' ? (
        <T variant="small">
          This plan came from the web app. Once you edit it here, changes made in the web app won’t be copied over.
        </T>
      ) : null}
      <Choice label="Type" value={form.kind} options={KINDS} onChange={(v) => set('kind', v)} />
      <Field label="Name" value={form.label} onChangeText={(v) => set('label', v)} maxLength={200} />
      <Field
        label="Date"
        value={form.date}
        onChangeText={(v) => set('date', v)}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        hint="Change the date to move this session."
      />
      <Field
        label="Distance (km)"
        value={form.distanceKm}
        onChangeText={(v) => set('distanceKm', v)}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="optional"
      />
      <Field
        label="Duration (minutes)"
        value={form.minutes}
        onChangeText={(v) => set('minutes', v)}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="optional"
      />
      <Field
        label="Notes"
        value={form.note}
        onChangeText={(v) => set('note', v)}
        multiline
        maxLength={1000}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Save" onPress={save} busy={busy} />
      {existing ? <Button label="Remove from plan" kind="secondary" onPress={remove} disabled={busy} /> : null}
    </Sheet>
  );
}
