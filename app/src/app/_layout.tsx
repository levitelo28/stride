import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { AuthLinkHandler } from '@/components/auth-link-handler';

import { StoreProvider } from '@/data/store';
import { colors } from '@/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.base, card: colors.base, primary: colors.accent, text: colors.text, border: colors.line },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StoreProvider>
        <StatusBar style="light" />
        {Platform.OS !== 'web' ? <AuthLinkHandler /> : null}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="goal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="session" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log" options={{ presentation: 'modal' }} />
        </Stack>
      </StoreProvider>
    </ThemeProvider>
  );
}
