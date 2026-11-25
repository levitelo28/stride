import Constants from 'expo-constants';
import { View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { useStore } from '@/data/store';

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

      <Card>
        <T variant="eyebrow">Data sources</T>
        <T variant="muted">
          Apple Health (iPhone) and Health Connect (Android) sync will appear here. Until then, the Stride web app at
          stridehealth.netlify.app is where you log and import workouts; this app reads the same account.
        </T>
      </Card>

      <T variant="small" style={{ textAlign: 'center' }}>
        Stride {Constants.expoConfig?.version ?? ''} · preview
      </T>
    </Screen>
  );
}
