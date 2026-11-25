import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { sessionSummary } from '@/components/sessions';
import { Button, Card, Pill, Row, Screen, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { addDays, formatDay, formatShort, today, weekStart } from '@/domain/dates';
import { GOAL_LABELS } from '@/domain/plan';
import { colors, space } from '@/theme';

export default function Training() {
  const { data, mode, refresh, refreshing } = useStore();
  const plan = data?.plan ?? null;
  const now = today();
  const [week, setWeek] = useState(weekStart(now));
  const done = useMemo(() => new Set((data?.activities ?? []).map((a) => a.date)), [data?.activities]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekKm = days.reduce((t, d) => {
    const s = plan?.sessions[d];
    return t + (s && s.kind !== 'event' ? (s.distanceKm ?? 0) : 0);
  }, 0);

  return (
    <Screen refreshing={refreshing} onRefresh={mode === 'cloud' ? refresh : undefined}>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow">Training</T>
        <T variant="title">{plan ? plan.goal.name || GOAL_LABELS[plan.goal.type] : 'Your plan'}</T>
        {plan?.goal.targetDate ? <T variant="muted">Target {formatDay(plan.goal.targetDate)}</T> : null}
      </View>
      {plan ? (
        <Button label="Change goal / new plan" kind="secondary" onPress={() => router.push('/goal')} />
      ) : null}

      {!plan ? (
        <Card>
          <T variant="h2">No training plan yet</T>
          <T variant="muted">Tell Stride what you’re training for and it will build a plan you can edit.</T>
          <Button label="Set a goal" onPress={() => router.push('/goal')} />
        </Card>
      ) : (
        <>
          {plan.warnings.map((w) => (
            <Card key={w} style={{ borderColor: colors.warn }}>
              <T variant="small" style={{ color: colors.warn }}>
                {w}
              </T>
            </Card>
          ))}
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h2">
              {formatShort(week)} – {formatShort(addDays(week, 6))}
            </T>
            <Row>
              <T variant="small" onPress={() => setWeek(addDays(week, -7))} accessibilityRole="button">
                ‹ Prev
              </T>
              <T variant="small" onPress={() => setWeek(weekStart(now))} accessibilityRole="button">
                This week
              </T>
              <T variant="small" onPress={() => setWeek(addDays(week, 7))} accessibilityRole="button">
                Next ›
              </T>
            </Row>
          </Row>
          <T variant="muted">{weekKm.toFixed(1)} km planned</T>
          <Card style={{ gap: 0, paddingVertical: space.sm }}>
            {days.map((d) => {
              const s = plan.sessions[d];
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDay(d)}: ${s ? s.label : 'Rest'}. ${s ? 'Edit' : 'Add a session'}`}
                  onPress={() => router.push({ pathname: '/session', params: { date: d } })}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Row
                  style={{
                    paddingVertical: space.md,
                    borderBottomWidth: d === days[6] ? 0 : 1,
                    borderBottomColor: colors.line,
                    alignItems: 'flex-start',
                  }}>
                  <View style={{ width: 92 }}>
                    <T variant="small" style={{ color: d === now ? colors.accent : colors.muted, fontWeight: '700' }}>
                      {formatDay(d)}
                    </T>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontWeight: '700', color: s ? colors.text : colors.muted }}>{s ? s.label : 'Rest'}</T>
                    {s?.note ? <T variant="small">{s.note}</T> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {s ? <T style={{ fontWeight: '800' }}>{sessionSummary(s)}</T> : null}
                    {done.has(d) ? <Pill>Done</Pill> : null}
                  </View>
                </Row>
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
