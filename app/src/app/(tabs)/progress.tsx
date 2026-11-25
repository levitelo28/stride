import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Row, Screen, Stat, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { formatShort, today } from '@/domain/dates';
import { weeklyStats } from '@/domain/stats';
import { colors, radius, space } from '@/theme';

const RANGES = [8, 12, 26] as const;

export default function Progress() {
  const { data, mode, refresh, refreshing } = useStore();
  const [range, setRange] = useState<(typeof RANGES)[number]>(12);
  const weeks = useMemo(
    () => weeklyStats(data?.activities ?? [], data?.plan ?? null, today(), range),
    [data, range],
  );
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.runKm, w.plannedKm)));
  const total = weeks.reduce((t, w) => t + w.runKm, 0);
  const runs = weeks.reduce((t, w) => t + w.runs, 0);
  const allRuns = (data?.activities ?? []).filter((a) => a.kind === 'run');
  const lifetimeKm = allRuns.reduce((t, a) => t + (a.distanceKm ?? 0), 0);

  return (
    <Screen refreshing={refreshing} onRefresh={mode === 'cloud' ? refresh : undefined}>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow">Progress</T>
        <T variant="title">Every kilometre counts.</T>
      </View>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="eyebrow">Weekly running</T>
          <Row>
            {RANGES.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="button"
                onPress={() => setRange(r)}
                style={{
                  paddingHorizontal: space.sm,
                  paddingVertical: 2,
                  borderRadius: radius.sm,
                  backgroundColor: r === range ? colors.hero : 'transparent',
                }}>
                <T variant="small" style={{ color: r === range ? colors.accent : colors.muted }}>
                  {r}W
                </T>
              </Pressable>
            ))}
          </Row>
        </Row>
        <View
          accessibilityLabel={`Weekly running distance for the last ${range} weeks`}
          style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 3, marginTop: space.sm }}>
          {weeks.map((w) => (
            <View key={w.weekStart} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              {w.plannedKm > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${(w.plannedKm / max) * 100}%`,
                    borderWidth: 1,
                    borderColor: colors.alt,
                    borderRadius: 4,
                  }}
                />
              ) : null}
              <View
                style={{
                  height: `${(w.runKm / max) * 100}%`,
                  backgroundColor: colors.accent,
                  borderRadius: 4,
                  minHeight: w.runKm > 0 ? 2 : 0,
                }}
              />
            </View>
          ))}
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="small">{formatShort(weeks[0].weekStart)}</T>
          <T variant="small">This week</T>
        </Row>
        <Row style={{ gap: space.lg }}>
          <Row style={{ gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent }} />
            <T variant="small">Completed</T>
          </Row>
          <Row style={{ gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderColor: colors.alt }} />
            <T variant="small">Planned</T>
          </Row>
        </Row>
      </Card>

      <Card>
        <T variant="eyebrow">Last {range} weeks</T>
        <Row style={{ alignItems: 'flex-start' }}>
          <Stat value={total.toFixed(0)} unit="km" label="Running" />
          <Stat value={String(runs)} label="Runs" />
          <Stat value={(total / range).toFixed(1)} unit="km" label="Weekly avg" />
        </Row>
      </Card>

      <Card>
        <T variant="eyebrow">All time</T>
        <Row style={{ alignItems: 'flex-start' }}>
          <Stat value={lifetimeKm.toFixed(0)} unit="km" label="Running" />
          <Stat value={String(allRuns.length)} label="Runs" />
          <Stat
            value={allRuns.length ? Math.max(...allRuns.map((a) => a.distanceKm ?? 0)).toFixed(1) : '—'}
            unit={allRuns.length ? 'km' : undefined}
            label="Longest"
          />
        </Row>
      </Card>
    </Screen>
  );
}
