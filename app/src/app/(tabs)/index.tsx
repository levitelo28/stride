import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ActivityRow, sessionSummary, WeekStrip } from '@/components/sessions';
import { Card, Pill, Row, Screen, Stat, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { addDays, daysBetween, formatDay, today, weekStart } from '@/domain/dates';
import { GOAL_LABELS } from '@/domain/plan';
import { colors } from '@/theme';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { data, mode, refresh, refreshing, error } = useStore();
  const now = today();
  const [selected, setSelected] = useState(now);
  const [week, setWeek] = useState(weekStart(now));

  const activities = useMemo(() => data?.activities ?? [], [data?.activities]);
  const plan = data?.plan ?? null;

  const { planned, done, last7, sleepAvg } = useMemo(() => {
    const planned = new Set(Object.keys(plan?.sessions ?? {}));
    const done = new Set(activities.map((a) => a.date));
    const from = addDays(now, -6);
    const recent = activities.filter((a) => a.date >= from && a.date <= now);
    const km = recent.reduce((t, a) => t + (a.kind === 'run' ? (a.distanceKm ?? 0) : 0), 0);
    const nights = (data?.sleep ?? []).filter((s) => s.date >= from);
    const sleepAvg = nights.length ? nights.reduce((t, s) => t + s.hours, 0) / nights.length : null;
    return { planned, done, last7: { km, count: recent.length }, sleepAvg };
  }, [activities, plan, data?.sleep, now]);

  const session = plan?.sessions[selected];
  const doneThatDay = activities.filter((a) => a.date === selected);
  const daysToGoal = plan?.goal.targetDate ? daysBetween(now, plan.goal.targetDate) : null;
  const goalName = plan ? plan.goal.name || GOAL_LABELS[plan.goal.type] : null;

  return (
    <Screen refreshing={refreshing} onRefresh={mode === 'cloud' ? refresh : undefined}>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow">
          {goalName && daysToGoal !== null && daysToGoal >= 0 ? `${daysToGoal} days to ${goalName}` : 'Stride'}
        </T>
        <T variant="title">{greeting()}.</T>
        <T variant="muted">{formatDay(now)}</T>
        {mode === 'demo' ? <Pill>Sample data</Pill> : null}
        {error ? <T style={{ color: colors.danger }}>Couldn’t refresh: {error}</T> : null}
      </View>

      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="h2">Week of {formatDay(week).split(', ')[1]}</T>
        <Row>
          <T variant="small" onPress={() => setWeek(addDays(week, -7))} accessibilityRole="button">
            ‹ Prev
          </T>
          <T
            variant="small"
            onPress={() => {
              setWeek(weekStart(now));
              setSelected(now);
            }}
            accessibilityRole="button">
            Today
          </T>
          <T variant="small" onPress={() => setWeek(addDays(week, 7))} accessibilityRole="button">
            Next ›
          </T>
        </Row>
      </Row>
      <WeekStrip start={week} selected={selected} onSelect={setSelected} planned={planned} done={done} />

      <Card hero>
        <T variant="eyebrow">{selected === now ? 'Today’s session' : formatDay(selected)}</T>
        {session ? (
          <>
            <T variant="h2" style={{ fontSize: 22 }}>
              {session.label}
            </T>
            {sessionSummary(session) ? <T variant="big">{sessionSummary(session)}</T> : null}
            {session.note ? <T variant="muted">{session.note}</T> : null}
          </>
        ) : (
          <>
            <T variant="h2" style={{ fontSize: 22 }}>
              {plan ? 'Rest or free day' : 'No plan yet'}
            </T>
            <T variant="muted">
              {plan
                ? 'Recover, stretch, or log anything extra you do.'
                : 'Set a goal and Stride will build a plan around it.'}
            </T>
          </>
        )}
        {doneThatDay.length ? (
          <View style={{ marginTop: 4 }}>
            <T variant="eyebrow">Completed</T>
            {doneThatDay.map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <T variant="eyebrow">Last 7 days</T>
        <Row style={{ alignItems: 'flex-start' }}>
          <Stat value={last7.km.toFixed(1)} unit="km" label="Running" />
          <Stat value={String(last7.count)} label="Activities" />
          <Stat value={sleepAvg ? sleepAvg.toFixed(1) : '—'} unit={sleepAvg ? 'h' : undefined} label="Avg sleep" />
        </Row>
      </Card>

      <Card>
        <T variant="eyebrow">Automatic sync</T>
        <T variant="h2">Apple Health is coming to the iPhone app</T>
        <T variant="muted">
          Runs, workouts, sleep, resting heart rate and HRV will arrive automatically from Apple Watch, Garmin, Strava
          and other apps that write to Apple Health.
        </T>
      </Card>

      {activities.length ? (
        <Card>
          <T variant="eyebrow">Recent activity</T>
          {activities.slice(0, 5).map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
