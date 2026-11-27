import { Redirect, Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Loading } from '@/components/ui';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

type IconName = SymbolViewProps['name'];

const icon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={24} />;
  };

export default function TabLayout() {
  const { mode, profile } = useStore();
  if (mode === 'loading') return <Loading />;
  if (mode === 'signed-out') return <Redirect href="/sign-in" />;
  // New accounts see the intro once (profile is null until loaded; demo mode has none).
  if (mode === 'cloud' && profile && !profile.onboardedAt) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.base, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.base },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: icon({ ios: 'house', android: 'home', web: 'home' }) }}
      />
      <Tabs.Screen
        name="training"
        options={{ title: 'Training', tabBarIcon: icon({ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }) }}
      />
      <Tabs.Screen
        name="coach"
        options={{ title: 'Coach', tabBarIcon: icon({ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }) }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: icon({ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: icon({ ios: 'gearshape', android: 'settings', web: 'settings' }) }}
      />
    </Tabs>
  );
}
