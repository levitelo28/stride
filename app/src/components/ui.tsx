import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, maxWidth, radius, space } from '@/theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          ) : undefined
        }>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Variant = 'eyebrow' | 'title' | 'h2' | 'body' | 'muted' | 'big' | 'small';

export function T({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text style={[styles[variant], style]} {...rest} />;
}

export function Card({ children, hero, style }: { children: ReactNode; hero?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, hero && styles.hero, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.7 },
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? colors.accentInk : colors.text} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.accentInk : colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <T variant="small">{label}</T>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl * 2 },
  inner: { width: '100%', maxWidth, alignSelf: 'center', gap: space.lg },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 13 },
  big: { color: colors.text, fontSize: 56, lineHeight: 60, fontWeight: '800', letterSpacing: -1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
  hero: { backgroundColor: colors.hero, borderColor: colors.alt },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.alt },
  buttonText: { fontSize: 16, fontWeight: '700' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.alt,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  pillText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 26, fontWeight: '800' },
  statUnit: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={formStyles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...input}
        style={[formStyles.input, input.style]}
      />
      {hint ? <T variant="small">{hint}</T> : null}
    </View>
  );
}

/** Single-choice segmented control. */
export function Choice<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={formStyles.label}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: active }}
              onPress={() => onChange(o.value)}
              style={[formStyles.chip, active && formStyles.chipActive]}>
              <Text style={[formStyles.chipText, active && { color: colors.accentInk }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 15 }}>
      {children}
    </Text>
  ) : null;
}

/** Modal screen chrome: title row with a close link. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={formStyles.sheetHead}>
        <Text style={styles.h2}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const formStyles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.base,
    color: colors.text,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
    fontSize: 16,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.alt,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
