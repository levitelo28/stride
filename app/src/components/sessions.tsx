import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, formatDay, weekdayShort } from '@/domain/dates';
import { formatDuration, formatPace } from '@/domain/stats';
import type { Activity, ISODate, PlannedSession } from '@/domain/types';
import { colors, radius, space } from '@/theme';

import { T } from './ui';

export function sessionSummary(s: PlannedSession): string {
  if (s.distanceKm) return `${s.distanceKm} km`;
  if (s.minutes) return `${s.minutes} min`;
  return '';
}

export function activitySummary(a: Activity): string {
  return [a.distanceKm ? `${a.distanceKm.toFixed(1)} km` : undefined, formatDuration(a.durationSec), formatPace(a.distanceKm, a.durationSec), a.avgHr ? `${a.avgHr} bpm` : undefined]
    .filter(Boolean)
    .join(' · ');
}

const KIND_LABEL: Record<Activity['kind'], string> = {
  run: 'Run',
  walk: 'Walk',
  ride: 'Ride',
  swim: 'Swim',
  strength: 'Strength',
  mobility: 'Mobility',
  other: 'Workout',
};

export function ActivityRow({ a, onPress }: { a: Activity; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '700' }}>{a.name ?? KIND_LABEL[a.kind]}</T>
        <T variant="small">
          {formatDay(a.date)}
          {activitySummary(a) ? ` · ${activitySummary(a)}` : ''}
        </T>
      </View>
      {onPress ? <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text> : null}
    </Pressable>
  );
}

/** Seven-day strip; dots mark planned sessions, filled dots mark days with activity. */
export function WeekStrip({
  start,
  selected,
  onSelect,
  planned,
  done,
}: {
  start: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  planned: Set<ISODate>;
  done: Set<ISODate>;
}) {
  return (
    <View style={styles.strip}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const active = d === selected;
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityLabel={formatDay(d)}
            onPress={() => onSelect(d)}
            style={[styles.day, active && styles.dayActive]}>
            <Text style={[styles.dayName, active && { color: colors.accent }]}>{weekdayShort(d).slice(0, 1)}</Text>
            <Text style={styles.dayNum}>{Number(d.slice(8))}</Text>
            <View
              style={[
                styles.dot,
                planned.has(d) && { backgroundColor: colors.alt },
                done.has(d) && { backgroundColor: colors.accent },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  strip: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 2,
  },
  dayActive: { borderColor: colors.accent, backgroundColor: colors.hero },
  dayName: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  dayNum: { color: colors.text, fontSize: 17, fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
});
