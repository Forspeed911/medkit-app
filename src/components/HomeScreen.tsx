import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PatientFace, TopBar } from './primitives';
import { store, useTweaks } from '../game/store';
import {
  listEvalHistory,
  deleteEvalHistory,
  type EvalHistoryEntry,
} from '../data/evalHistory';

const VERDICT_COLOR: Record<EvalHistoryEntry['verdict'], string> = {
  excellent: 'var(--mint)',
  good: 'var(--mint)',
  satisfactory: 'var(--butter)',
  borderline: 'var(--peach)',
  'clear-fail': 'var(--rose)',
};

// VERDICT_LABEL is now handled via i18n in the component

function relativeDate(ms: number): string {
  const diffMs = Date.now() - ms;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface StatProps {
  big: string;
  sub: string;
  out?: string;
}

function Stat({ big, sub, out }: StatProps) {
  return (
    <div
      style={{
        background: 'white',
        border: '3px solid var(--line)',
        borderRadius: 14,
        padding: 12,
        boxShadow: 'var(--plush-tiny)',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 32, lineHeight: 1, color: 'var(--ink)' }}>
        {big}
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{out}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--ink-2)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginTop: 4,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

const VERDICT_SCORE: Record<EvalHistoryEntry['verdict'], number> = {
  'clear-fail': 1,
  borderline: 2,
  satisfactory: 3,
  good: 4,
  excellent: 5,
};

const DOMAIN_META = [
  { key: 'data_gathering' as const, labelKey: 'domain.data_gathering', color: 'var(--peach)', deep: 'var(--peach-deep)' },
  { key: 'clinical_management' as const, labelKey: 'domain.clinical_management', color: 'var(--mint)', deep: 'var(--mint-deep)' },
  { key: 'interpersonal' as const, labelKey: 'domain.interpersonal', color: 'var(--sky)', deep: 'var(--sky-deep)' },
];

interface TrainingStats {
  count: number;
  avgRating: number; // 0–5
  domains: { key: 'data_gathering' | 'clinical_management' | 'interpersonal'; labelKey: string; pct: number; color: string; deep: string }[];
  weakest: { labelKey: string; pct: number; deep: string } | null;
  streakDays: number;
}

function computeStats(history: EvalHistoryEntry[]): TrainingStats {
  const count = history.length;
  if (count === 0) {
    return {
      count: 0,
      avgRating: 0,
      domains: DOMAIN_META.map((d) => ({ ...d, pct: 0 })),
      weakest: null,
      streakDays: 0,
    };
  }

  const avgRating =
    history.reduce((sum, e) => sum + (VERDICT_SCORE[e.verdict] ?? 0), 0) / count;

  const domains = DOMAIN_META.map((d) => {
    const ratios = history
      .map((e) => {
        const ds = e.evaluation.domain_scores[d.key];
        return ds && ds.max > 0 ? ds.raw / ds.max : null;
      })
      .filter((r): r is number => r !== null);
    const pct = ratios.length > 0
      ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
      : 0;
    return { ...d, pct };
  });

  const weakestDomain = domains.reduce((min, d) => (d.pct < min.pct ? d : min), domains[0]);
  const weakest = { labelKey: weakestDomain.labelKey, pct: weakestDomain.pct, deep: weakestDomain.deep };

  // Streak: count consecutive days (today, yesterday, …) with at least one
  // saved review. Stops at the first gap.
  const days = new Set(
    history.map((e) => new Date(e.savedAt).toISOString().slice(0, 10)),
  );
  let streakDays = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { count, avgRating, domains, weakest, streakDays };
}

export function HomeScreen() {
  const { t } = useTranslation();
  const tweaks = useTweaks();
  const [history, setHistory] = useState<EvalHistoryEntry[]>([]);

  // Load on mount + whenever the screen is shown so it stays current.
  useEffect(() => {
    setHistory(listEvalHistory());
  }, []);

  const refresh = () => setHistory(listEvalHistory());
  const onDelete = (id: string) => {
    deleteEvalHistory(id);
    refresh();
  };

  const stats = computeStats(history);

  return (
    <div className="screen" style={{ background: 'var(--cream)' }}>
      <TopBar here={0} steps={['Profile']} />

      <div
        style={{
          padding: '28px 36px',
          minHeight: 'calc(100vh - 67px)',
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 24,
        }}
      >
        {/* LEFT — desk */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
              {stats.count === 0 ? t('home.dayOne') : t('home.welcomeBack')}
            </div>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, marginTop: 4 }}>
              {stats.count === 0 ? t('home.readyTitle') : t('home.welcomeTitle')}
            </h1>
            <div style={{ fontSize: 16, color: 'var(--ink-2)', fontWeight: 600, marginTop: 6 }}>
              {stats.count === 0 ? t('home.readyBody') : t('home.welcomeBody')}
            </div>
          </div>

          {stats.count === 0 ? (
            <div
              className="plush-lg"
              style={{
                background: 'var(--cream-2)',
                padding: 18,
                position: 'relative',
                transform: 'rotate(-0.6deg)',
              }}
            >
              <div style={{ position: 'absolute', top: -12, left: 22 }} className="chip butter">
                {t('home.firstCaseChip')}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: 18,
                  border: '3px dashed rgba(43,30,22,0.25)',
                  padding: 16,
                }}
              >
                <div className="floaty" style={{ opacity: 0.6 }}>
                  <PatientFace style={tweaks.avatarStyle} skin="#E8B68F" hair="#3B2A1F" size={120} mood="neutral" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{t('home.noCasePicked')}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', marginTop: 2 }}>
                    {t('home.noCaseBody')}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-plush primary"
                  style={{ fontSize: 15, padding: '14px 18px' }}
                  onClick={() => store.setScreen('mode')}
                >
                  {t('home.startBtn')}
                </button>
              </div>
            </div>
          ) : (
            <div className="plush-lg" style={{ background: 'var(--peach)', padding: 18, position: 'relative', transform: 'rotate(-0.6deg)' }}>
              <div style={{ position: 'absolute', top: -12, left: 22 }} className="chip butter">
                {t('home.pickUpChip')}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: 18,
                  border: '3px solid var(--line)',
                  padding: 16,
                }}
              >
                <div className="floaty">
                  <PatientFace
                    style={tweaks.avatarStyle}
                    skin={history[0].caseGender === 'F' ? '#F0C4A8' : '#E8B68F'}
                    hair="#3B2A1F"
                    size={120}
                    mood="neutral"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>
                    {history[0].caseName}, {history[0].caseAge}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', marginTop: 2 }}>
                    {history[0].diagnosisLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <span className="chip" style={{ background: VERDICT_COLOR[history[0].verdict] }}>
                      {t(`verdict.${history[0].verdict}`)}
                    </span>
                    <span className="chip">{t('home.lastReview')} · {relativeDate(history[0].savedAt)}</span>
                    {stats.weakest && (
                      <span className="chip butter">{t('home.focus')} · {t(stats.weakest.labelKey).toLowerCase()}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-plush primary"
                  style={{ fontSize: 15, padding: '14px 18px' }}
                  onClick={() => store.viewEvalHistory(history[0].id)}
                >
                  {t('home.reviewBtn')}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn-plush mint"
            style={{ fontSize: 22, padding: '18px 0', alignSelf: 'stretch' }}
            onClick={() => store.setScreen('mode')}
          >
            {t('home.startSession')}
          </button>

          <button
            type="button"
            className="btn-plush ghost"
            style={{
              fontSize: 14,
              padding: '12px 16px',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/agentic-rounds');
              }
              store.setScreen('agenticRounds');
            }}
            title="See how the simulator grades you — agents, citations, hard rules"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip butter" style={{ fontSize: 10 }}>{t('home.newChip')}</span>
              <span style={{ fontWeight: 800 }}>{t('home.agenticRounds')}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{t('home.agenticRoundsSub')}</span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--ink-2)' }}>→</span>
          </button>

          <button
            type="button"
            className="btn-plush ghost"
            style={{
              fontSize: 14,
              padding: '12px 16px',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/agent-topology');
              }
              store.setScreen('agentTopology');
            }}
            title="Live map of Opus 4.7 and the sub-rules + sessions it controls"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip peach" style={{ fontSize: 10 }}>{t('home.liveChip')}</span>
              <span style={{ fontWeight: 800 }}>{t('home.agentTopology')}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{t('home.agentTopologySub')}</span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--ink-2)' }}>→</span>
          </button>

          <div className="plush" style={{ padding: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                {t('home.recentCases')}
              </div>
              <span
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}
                onClick={() => store.setScreen('history')}
              >
                {t('home.seeAll')}
              </span>
            </div>
            {history.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  background: 'var(--cream)',
                  border: '2.5px dashed rgba(43,30,22,0.2)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  textAlign: 'center',
                }}
              >
                {t('home.noReviews')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 6).map((r) => {
                  const color = VERDICT_COLOR[r.verdict];
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 110px 80px 28px',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--cream)',
                        border: '2.5px solid var(--line)',
                        borderRadius: 12,
                        boxShadow: '0 2px 0 var(--line)',
                      }}
                    >
                      <div
                        className="tap"
                        onClick={() => store.viewEvalHistory(r.id)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: color,
                          border: '2.5px solid var(--line)',
                          boxShadow: '0 2px 0 var(--line)',
                          cursor: 'pointer',
                        }}
                      />
                      <div className="tap" onClick={() => store.viewEvalHistory(r.id)} style={{ cursor: 'pointer' }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>
                          {r.caseName} <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>· {r.caseAge}{r.caseGender}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700 }}>
                          {r.diagnosisLabel}
                        </div>
                      </div>
                      <span
                        className="tap chip"
                        onClick={() => store.viewEvalHistory(r.id)}
                        style={{ background: color, fontSize: 11, cursor: 'pointer' }}
                      >
                        {t(`verdict.${r.verdict}`)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 700 }}>
                        {relativeDate(r.savedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(t('home.deleteConfirm', { name: r.caseName }))) onDelete(r.id);
                        }}
                        title={t('home.deleteTitle')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: 16,
                          fontWeight: 800,
                          color: 'var(--ink-2)',
                          cursor: 'pointer',
                          padding: 4,
                          fontFamily: 'inherit',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="plush" style={{ padding: 16, background: 'var(--butter)' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 11,
                color: 'var(--ink-2)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {t('home.yourTraining')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Stat big={stats.count > 0 ? String(stats.count) : '—'} sub={t('home.casesDone')} />
              <Stat
                big={stats.count > 0 ? stats.avgRating.toFixed(1) : '—'}
                sub={t('home.avgRating')}
                out={stats.count > 0 ? ' / 5' : ''}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                background: 'white',
                border: '3px solid var(--line)',
                borderRadius: 14,
                padding: 12,
                boxShadow: 'var(--plush-tiny)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--ink-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {t('home.weakestDomain')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                {stats.weakest ? t(stats.weakest.labelKey) : '—'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 12,
                  background: 'var(--cream)',
                  borderRadius: 8,
                  border: '2px solid var(--line)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${stats.weakest?.pct ?? 0}%`,
                    background: stats.weakest?.deep ?? 'var(--peach-deep)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink-2)',
                }}
              >
                <span>
                  {stats.weakest ? `${t(stats.weakest.labelKey)} · ${stats.weakest.pct}%` : t('home.noReviewsYet')}
                </span>
                <span>{t('home.focusArea')}</span>
              </div>
            </div>
          </div>

          <div className="plush" style={{ padding: 16 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 11,
                color: 'var(--ink-2)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {t('home.domainProgress')}
            </div>
            {stats.count === 0 ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                {t('home.domainUnlocks')}
              </div>
            ) : (
              stats.domains.map((d) => (
                <div key={d.labelKey} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    <span>{t(d.labelKey)}</span>
                    <span>{d.pct}%</span>
                  </div>
                  <div
                    style={{
                      height: 14,
                      background: 'var(--cream)',
                      borderRadius: 8,
                      border: '2.5px solid var(--line)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${d.pct}%`,
                        background: d.color,
                        borderRight: '2.5px solid var(--line)',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className="plush"
            style={{ padding: 14, background: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ fontSize: 36 }} className="floaty">
              📚
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>
                {stats.streakDays === 0
                  ? t('home.streak0')
                  : t('home.streakDays_many', { count: stats.streakDays })}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                {stats.streakDays === 0 ? t('home.streakStart') : t('home.streakKeepAlive')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
