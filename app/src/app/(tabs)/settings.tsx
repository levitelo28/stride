import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, ErrorText, Screen, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

function AppleHealthCard() {
  const { mode, health, connectHealth, disconnectHealth, refresh, refreshing } = useStore();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (Platform.OS !== 'ios')
    return (
      <Card>
        <T variant="eyebrow">Apple Health</T>
        <T variant="muted">
          Available in the Stride iPhone app: workouts from Apple Watch, Garmin, Strava and other apps, plus sleep,
          resting heart rate and HRV, synced automatically.
        </T>
      </Card>
    );

  if (!health.supported)
    return (
      <Card>
        <T variant="eyebrow">Apple Health</T>
        <T variant="muted">Health data isn’t available on this device.</T>
      </Card>
    );

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = await connectHealth();
      setNote(n ? `Imported ${n} workouts.` : 'Connected. New workouts will appear as they reach Apple Health.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect Apple Health');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T variant="eyebrow">Apple Health</T>
      {mode === 'demo' ? (
        <T variant="muted">Sign in to connect Apple Health.</T>
      ) : health.connected ? (
        <>
          <T>
            Connected
            {health.lastSync ? <T variant="small"> · synced {ago(health.lastSync)}</T> : null}
          </T>
          <T variant="small">
            Stride reads workouts, sleep, resting heart rate and HRV each time you open the app. It never writes to
            Health. To change what Stride can read: iPhone Settings → Health → Data Access & Devices → Stride.
          </T>
          {note ? <T variant="small" style={{ color: colors.accent }}>{note}</T> : null}
          <Button label="Sync now" onPress={refresh} busy={refreshing} />
          <Button label="Stop syncing on this iPhone" kind="secondary" onPress={disconnectHealth} />
        </>
      ) : (
        <>
          <T variant="h2">Sync your workouts automatically</T>
          <T variant="muted">
            Stride can read your workouts (from Apple Watch, Garmin, Strava and any app that saves to Apple Health),
            sleep, resting heart rate and HRV. Your coach uses them to judge recovery. Stride never writes to Health.
          </T>
          <T variant="small">Tip: in Strava or Garmin Connect, turn on “Apple Health” so their workouts arrive too.</T>
          <Button label="Connect Apple Health" onPress={connect} busy={busy} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export default function Settings() {
  const { mode, session, signOut, data } = useStore();
  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow">Settings</T>
        <T variant="title">You.</T>
      </View>

      <Card>
        <T variant="eyebrow">Account</T>
        {mode === 'demo' ? (
          <T variant="muted">You’re exploring sample data. Nothing is saved.</T>
        ) : (
          <T>Signed in as {session?.user.email}</T>
        )}
        <T variant="small">
          {data?.activities.length ?? 0} activities · {Object.keys(data?.plan?.sessions ?? {}).length} planned sessions
        </T>
        <Button label={mode === 'demo' ? 'Leave sample data' : 'Sign out'} kind="secondary" onPress={signOut} />
      </Card>

      <AppleHealthCard />

      <Card>
        <T variant="eyebrow">Stride web app</T>
        <T variant="muted">
          Workouts logged or imported at stridehealth.netlify.app are copied into this app automatically.
        </T>
      </Card>

      <T variant="small" style={{ textAlign: 'center' }}>
        Stride {Constants.expoConfig?.version ?? ''} · preview
      </T>
    </Screen>
  );
}
