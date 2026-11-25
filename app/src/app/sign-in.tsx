import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Loading, Screen, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

export default function SignIn() {
  const { mode, enterDemo } = useStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (mode === 'loading') return <Loading />;
  if (mode !== 'signed-out') return <Redirect href="/" />;

  const sendLink = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setMessage('Enter a valid email address.');
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: Platform.OS === 'web' ? { emailRedirectTo: window.location.origin } : undefined,
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMessage(error.message);
  };

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.xxl }}>
        <T variant="eyebrow">Train · Fuel · Recover</T>
        <T variant="title">stride.</T>
        <T variant="muted">Your training, recovery and coaching in one place, built around your own goal.</T>
      </View>

      <Card>
        {!sent ? (
          <>
            <T variant="h2">Sign in or create an account</T>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              style={styles.input}
              onSubmitEditing={sendLink}
            />
            <Button label="Email me a sign-in link" onPress={sendLink} busy={busy} />
          </>
        ) : (
          <>
            <T variant="h2">Check your email</T>
            <T variant="muted">
              We sent a sign-in link to {email.trim()}. Open it on this device, or enter the 6-digit code if the email
              includes one.
            </T>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={8}
              style={styles.input}
              onSubmitEditing={verify}
            />
            <Button label="Verify code" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
            <Button label="Use a different email" kind="secondary" onPress={() => setSent(false)} />
          </>
        )}
        {message ? <T style={{ color: colors.danger }}>{message}</T> : null}
      </Card>

      <Card>
        <T variant="h2">Just looking?</T>
        <T variant="muted">Explore Stride with sample training data. Nothing is saved.</T>
        <Button label="Explore with sample data" kind="secondary" onPress={enterDemo} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.base,
    color: colors.text,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 48,
    fontSize: 16,
  },
});
