import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ErrorText, Pill, Row, Screen, T } from '@/components/ui';
import * as repo from '@/data/repo';
import { useStore } from '@/data/store';
import { buildCoachInput, computeInsights, type Insight } from '@/domain/coach';
import { formatDay, today } from '@/domain/dates';
import { demoReview } from '@/domain/demo';
import { checkProposal, type Proposal } from '@/domain/proposals';
import { colors, space } from '@/theme';

const TONE_COLOR: Record<Insight['tone'], string> = { good: colors.accent, watch: colors.warn, info: colors.muted };
const TONE_LABEL: Record<Insight['tone'], string> = { good: 'Going well', watch: 'Watch', info: 'Note' };

type Decision = { state: 'accepted'; description: string } | { state: 'dismissed' } | { state: 'error'; message: string };

export default function Coach() {
  const { mode, session, data, saveSession, deleteSession } = useStore();
  const now = today();
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [latest, setLatest] = useState<repo.SavedReview | null>(null);
  const [loading, setLoading] = useState(mode === 'cloud');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  const userId = session?.user.id;
  useEffect(() => {
    if (mode !== 'cloud' || !userId) return;
    setLoading(true);
    repo
      .loadCoachState(userId)
      .then((s) => {
        setConsentAt(s.consentAt);
        setLatest(s.latest);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the coach'))
      .finally(() => setLoading(false));
  }, [mode, userId]);

  const insights = useMemo(() => (data ? computeInsights(data, now) : []), [data, now]);
  const demo = mode === 'demo';
  // Built once: accepting a suggestion changes the plan, and the review must not be regenerated from it.
  const [sample] = useState(() =>
    demo && data ? { review: demoReview(data, now), createdAt: new Date().toISOString() } : null,
  );
  const review = demo ? sample : latest;
  const consented = demo || !!consentAt;

  const consent = async (on: boolean) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      setConsentAt(await repo.setCoachConsent(userId, on));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const getReview = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      setLatest(await repo.requestReview(buildCoachInput(data, now)));
      setDecisions({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The coach is unavailable right now');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (i: number, p: Proposal) => {
    if (!data?.plan) return;
    const c = checkProposal(data.plan, data.activities, p, now);
    if (!c.ok) return setDecisions((d) => ({ ...d, [i]: { state: 'error', message: c.reason } }));
    try {
      if (c.removeDate) await deleteSession(c.removeDate);
      else if (c.session) await saveSession(c.from, c.session);
      setDecisions((d) => ({ ...d, [i]: { state: 'accepted', description: c.description } }));
    } catch (e) {
      setDecisions((d) => ({ ...d, [i]: { state: 'error', message: e instanceof Error ? e.message : 'Could not apply' } }));
    }
  };

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T variant="eyebrow">Coach</T>
        <T variant="title">How it’s going.</T>
      </View>

      <Card>
        <T variant="eyebrow">This week’s signals</T>
        {insights.length ? (
          insights.map((i) => (
            <View key={i.id} style={{ gap: 2, paddingVertical: space.xs }}>
              <Row>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TONE_COLOR[i.tone] }} />
                <T style={{ fontWeight: '700' }}>{i.title}</T>
                <T variant="small">· {TONE_LABEL[i.tone]}</T>
              </Row>
              <T variant="muted">{i.detail}</T>
            </View>
          ))
        ) : (
          <T variant="muted">Nothing stands out. Keep going.</T>
        )}
        <T variant="small">From Stride’s built-in rules, calculated on your device.</T>
      </Card>

      {loading ? (
        <Card>
          <T variant="muted">Loading your coach…</T>
        </Card>
      ) : !consented ? (
        <Card hero>
          <T variant="eyebrow">AI coach</T>
          <T variant="h2">Get a weekly review from Stride’s AI coach</T>
          <T variant="muted">
            The coach reads a summary of the last six weeks: your goal, planned vs completed sessions, workout distances,
            durations, heart rate, effort ratings and notes, average sleep, and resting heart rate and HRV against your
            own baseline. It tells you what’s going well, what to watch, and can suggest plan changes that you approve
            one by one.
          </T>
          <T variant="small">
            The summary is sent to Anthropic (the maker of Claude) to write your review. It isn’t used for advertising,
            and Anthropic doesn’t use it to train its models. You can turn the coach off at any time. It’s not medical
            advice.
          </T>
          <Button label="Turn on the AI coach" onPress={() => consent(true)} busy={busy} />
        </Card>
      ) : (
        <>
          {review ? (
            <Card hero>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="eyebrow">Weekly review</T>
                {demo ? <Pill>Sample</Pill> : <T variant="small">{formatDay(review.createdAt.slice(0, 10))}</T>}
              </Row>
              <T>{review.review.summary}</T>
              {review.review.going_well.length ? (
                <View style={{ gap: 4 }}>
                  <T variant="small" style={{ color: colors.accent, fontWeight: '700' }}>
                    Going well
                  </T>
                  {review.review.going_well.map((s) => (
                    <T key={s} variant="muted">
                      • {s}
                    </T>
                  ))}
                </View>
              ) : null}
              {review.review.needs_attention.length ? (
                <View style={{ gap: 4 }}>
                  <T variant="small" style={{ color: colors.warn, fontWeight: '700' }}>
                    Needs attention
                  </T>
                  {review.review.needs_attention.map((s) => (
                    <T key={s} variant="muted">
                      • {s}
                    </T>
                  ))}
                </View>
              ) : null}
              {review.review.today ? (
                <View style={{ gap: 4 }}>
                  <T variant="small" style={{ fontWeight: '700' }}>
                    Today
                  </T>
                  <T variant="muted">{review.review.today}</T>
                </View>
              ) : null}
            </Card>
          ) : (
            <Card>
              <T variant="muted">No review yet. Ask the coach for one below.</T>
            </Card>
          )}

          {review?.review.proposals.length && data?.plan ? (
            <Card>
              <T variant="eyebrow">Suggested changes</T>
              <T variant="small">Each change is checked against Stride’s safety rules and only applied if you accept it.</T>
              {review.review.proposals.map((p, i) => {
                const check = checkProposal(data.plan!, data.activities, p, now);
                const d = decisions[i];
                return (
                  <View
                    key={`${p.action}-${p.date}-${i}`}
                    style={{ gap: 6, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <T style={{ fontWeight: '700' }}>
                      {d?.state === 'accepted'
                        ? d.description
                        : check.ok
                          ? check.description
                          : `Suggested: ${p.action} the session on ${formatDay(p.date)}`}
                    </T>
                    <T variant="muted">{p.reason}</T>
                    {d?.state === 'accepted' ? (
                      <T variant="small" style={{ color: colors.accent }}>
                        Applied to your plan.
                      </T>
                    ) : d?.state === 'dismissed' ? (
                      <T variant="small">Dismissed.</T>
                    ) : !check.ok ? (
                      <T variant="small" style={{ color: colors.warn }}>
                        Not offered: {check.reason}.
                      </T>
                    ) : (
                      <>
                        {d?.state === 'error' ? <ErrorText>{d.message}</ErrorText> : null}
                        <Row>
                          <View style={{ flex: 1 }}>
                            <Button label="Accept" onPress={() => accept(i, p)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button
                              label="Dismiss"
                              kind="secondary"
                              onPress={() => setDecisions((x) => ({ ...x, [i]: { state: 'dismissed' } }))}
                            />
                          </View>
                        </Row>
                      </>
                    )}
                  </View>
                );
              })}
            </Card>
          ) : null}

          {!demo ? (
            <>
              <Button label={review ? 'Get a fresh review' : 'Get my weekly review'} onPress={getReview} busy={busy} />
              <T
                variant="small"
                style={{ textAlign: 'center' }}
                onPress={() => consent(false)}
                accessibilityRole="button">
                Turn off the AI coach
              </T>
            </>
          ) : (
            <T variant="small" style={{ textAlign: 'center' }}>
              Sign in to get a real review based on your own training.
            </T>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
