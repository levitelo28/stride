// First-run intro: what Stride does, then goal, Apple Health and AI coach, each optional and explained
// before anything is asked. Shown once per account (profiles.onboarded_at); Settings can show it again.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, ErrorText, Row, Screen, T } from '@/components/ui';
import * as repo from '@/data/repo';
import { useStore } from '@/data/store';
import { colors, space } from '@/theme';

type Step = 'welcome' | 'goal' | 'health' | 'coach';

function Progress({ steps, current }: { steps: Step[]; current: Step }) {
  const at = steps.indexOf(current);
  return (
    <Row style={{ gap: space.xs }}>
      {steps.map((s, i) => (
        <View
          key={s}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? colors.accent : colors.line }}
        />
      ))}
    </Row>
  );
}

export default function Onboarding() {
  const { mode, session, data, health, connectHealth, setOnboarded } = useStore();
  const steps: Step[] = ['welcome', 'goal', ...(Platform.OS === 'ios' && health.supported ? (['health'] as const) : []), 'coach'];
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'signed-out') return <Redirect href="/sign-in" />;
  if (mode !== 'cloud') return <Redirect href="/" />;

  const next = () => {
    setNote(null);
    setError(null);
    const i = steps.indexOf(step);
    if (i < steps.length - 1) setStep(steps[i + 1]);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const finish = (coach: boolean) =>
    run(async () => {
      if (coach && session) await repo.setCoachConsent(session.user.id, true);
      await setOnboarded(true);
      router.replace('/');
    });

  const hasPlan = !!data?.plan && data.plan.source !== 'legacy';

  return (
    <Screen>
      <View style={{ gap: space.md, marginTop: space.lg }}>
        <Progress steps={steps} current={step} />
      </View>

      {step === 'welcome' ? (
        <>
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">Welcome to Stride</T>
            <T variant="title">Train with a plan that keeps up with you.</T>
          </View>
          <Card>
            <T>• A training plan built around your goal and the days you can train.</T>
            <T>• Your workouts, sleep and recovery pulled in automatically.</T>
            <T>• A weekly review from an AI coach, with plan changes you approve.</T>
          </Card>
          <T variant="small">
            Stride gives training guidance, not medical advice. If you have an injury or a health condition, check with
            a doctor before you start a new plan.
          </T>
          <Button label="Get started" onPress={next} />
        </>
      ) : null}

      {step === 'goal' ? (
        <>
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">Step 1 · Your goal</T>
            <T variant="title">{hasPlan ? 'Your goal is set.' : 'What are you training for?'}</T>
          </View>
          <Card>
            {hasPlan ? (
              <T variant="muted">
                You’re training for {data?.plan?.goal.name || 'your goal'}. You can change it any time from Training.
              </T>
            ) : (
              <T variant="muted">
                Pick a race or a distance, a date, and how many days a week you can run. Stride builds a plan that
                ramps up safely and tapers before the day.
              </T>
            )}
            {hasPlan ? null : (
              <Button label="Set my goal" onPress={() => router.push({ pathname: '/goal', params: { from: 'onboarding' } })} />
            )}
          </Card>
          <Button label={hasPlan ? 'Continue' : 'Skip for now'} kind={hasPlan ? 'primary' : 'secondary'} onPress={next} />
        </>
      ) : null}

      {step === 'health' ? (
        <>
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">Step 2 · Apple Health</T>
            <T variant="title">Sync your workouts automatically.</T>
          </View>
          <Card>
            <T variant="muted">
              Stride can read your workouts (from Apple Watch, Garmin, Strava and any app that saves to Apple Health),
              sleep, resting heart rate and heart-rate variability. They’re used to track your training and judge your
              recovery.
            </T>
            <T variant="small">
              Stride only reads; it never writes to Health. Your Health data is stored in your Stride account, is never
              used for advertising and is never sold. iOS asks you to choose exactly what to share.
            </T>
            {health.connected ? (
              <T style={{ color: colors.accent }}>{note ?? 'Connected.'}</T>
            ) : (
              <Button
                label="Connect Apple Health"
                busy={busy}
                onPress={() =>
                  run(async () => {
                    const n = await connectHealth();
                    setNote(n ? `Connected. Imported ${n} workouts.` : 'Connected.');
                  })
                }
              />
            )}
            <ErrorText>{error}</ErrorText>
          </Card>
          <Button label={health.connected ? 'Continue' : 'Not now'} kind={health.connected ? 'primary' : 'secondary'} onPress={next} />
        </>
      ) : null}

      {step === 'coach' ? (
        <>
          <View style={{ gap: space.sm }}>
            <T variant="eyebrow">{`Step ${steps.length - 1} · AI coach`}</T>
            <T variant="title">Get a weekly review.</T>
          </View>
          <Card>
            <T variant="muted">
              The coach reads a summary of your last six weeks: your goal, planned and completed sessions, workout
              distances, durations, heart rate, effort and notes, average sleep, and resting heart rate and HRV against
              your own baseline. It tells you what’s going well, what to watch, and can suggest plan changes that you
              approve one by one.
            </T>
            <T variant="small">
              To write your review, that summary is sent to Anthropic, the maker of Claude. It isn’t used for
              advertising, and Anthropic doesn’t use it to train its models. You can turn the coach off at any time in
              the Coach tab. It’s not medical advice.
            </T>
            <Button label="Turn on the AI coach" busy={busy} onPress={() => finish(true)} />
            <ErrorText>{error}</ErrorText>
          </Card>
          <Button label="Not now" kind="secondary" onPress={() => finish(false)} />
        </>
      ) : null}
    </Screen>
  );
}
