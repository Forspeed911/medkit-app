import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { store, useGameState, POLYCLINIC_BED_INDEX } from '../game/store';
import { TESTS, TEST_PANELS, testById } from '../data/tests';
import { getTestReport } from '../data/defaultTestResults';
import { getImagingExamples } from '../data/radiologyImages';
import { POLYCLINIC_DIAGNOSIS_LABELS, getCaseSpecialty } from '../data/polyclinicPatients';
import { MEDICATIONS, CATEGORY_LABELS, SPECIALTY_MEDICATION_CATEGORIES, medicationById, type Medication, type MedicationCategory } from '../data/medications';
import { getExistingConversation } from '../voice/conversationStore';
import type { ChatMessage } from '../voice/claude';

type Tab = 'history' | 'chat' | 'tests' | 'results' | 'diagnose' | 'rx';

interface Props {
  onClose: () => void;
  onDispatch: () => void;
}

const diagLabel = (id: string): string =>
  POLYCLINIC_DIAGNOSIS_LABELS[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export function ExamineOverlay({ onClose, onDispatch }: Props) {
  const { t } = useTranslation();
  const state = useGameState();
  const patient = state.polyclinic.patient;
  const [tab, setTab] = useState<Tab>('history');

  // Esc closes the overlay (matches keyboard convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!patient) return null;
  const c = patient.case;
  const asked = new Set(patient.askedQuestionIds);
  const ordered = new Set(patient.orderedTestIds);
  const completed = new Set(patient.completedTestIds);
  const submitted = patient.submittedDiagnosisId;

  const newResultsCount = patient.orderedTestIds.filter((id) => completed.has(id)).length;
  const rxCount = patient.prescriptions?.length ?? 0;
  const rxUnlocked = submitted !== null;

  const tabs: Array<{ id: Tab; label: string; badge?: number | string; disabled?: boolean }> = [
    { id: 'history', label: t('examine.tabs.history'), badge: `${asked.size}/${c.anamnesis.length}` },
    { id: 'chat', label: t('examine.tabs.chat') },
    { id: 'tests', label: t('examine.tabs.tests') },
    { id: 'results', label: t('examine.tabs.results'), badge: newResultsCount > 0 ? newResultsCount : undefined },
    { id: 'diagnose', label: t('examine.tabs.diagnose') },
    { id: 'rx', label: t('examine.tabs.rx'), badge: rxCount > 0 ? rxCount : undefined, disabled: !rxUnlocked },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(43,30,22,0.40)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '36px 36px 24px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="plush-lg popin"
        style={{
          width: 'min(960px, 100%)',
          background: 'var(--paper)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 60px)',
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 22px',
            background: 'var(--cream-2)',
            borderBottom: '3px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="chip butter" style={{ fontSize: 11 }}>
              {t('examine.examineChip')}
            </span>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>{c.name}</h2>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink-2)' }}>
              {c.age} · {c.gender === 'F' ? t('examine.female') : t('examine.male')}
            </span>
            <span
              className={`chip ${c.severity === 'critical' ? 'rose' : c.severity === 'urgent' ? 'peach' : 'mint'}`}
              style={{ fontSize: 11 }}
            >
              {t(`brief.severity.${c.severity}`, c.severity)}
            </span>
          </div>
          <button
            type="button"
            className="btn-plush ghost"
            onClick={onClose}
            style={{ fontSize: 13, padding: '8px 16px' }}
            title={t('examine.pressEsc')}
          >
            {t('examine.close')}
          </button>
        </div>

        {/* Vitals strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            padding: '12px 22px',
            background: 'var(--cream)',
            borderBottom: '3px solid var(--line)',
          }}
        >
          <Vital icon="❤" label="HR" value={String(c.vitals.hr)} unit="bpm" tone="var(--rose)" />
          <Vital icon="⌥" label="BP" value={c.vitals.bp} unit="mmHg" tone="var(--peach)" />
          <Vital icon="○" label="SpO₂" value={`${c.vitals.spo2}`} unit="%" tone="var(--mint)" />
          <Vital icon="☼" label="Temp" value={c.vitals.temp.toFixed(1)} unit="°C" tone="var(--butter)" />
          <Vital icon="~" label="RR" value={String(c.vitals.rr)} unit="/min" tone="var(--sky)" />
        </div>

        {/* Tab strip */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 22px 0',
            borderBottom: '3px solid var(--line)',
            background: 'white',
          }}
        >
          {tabs.map((tabItem) => {
            const active = tab === tabItem.id;
            const disabled = !!tabItem.disabled;
            return (
              <button
                key={tabItem.id}
                type="button"
                className="tap"
                onClick={() => !disabled && setTab(tabItem.id)}
                disabled={disabled}
                title={disabled ? t('examine.submitDiagnosisFirst') : undefined}
                style={{
                  background: active ? 'var(--butter)' : 'white',
                  border: '3px solid var(--line)',
                  borderBottom: active ? '3px solid var(--butter)' : '3px solid var(--line)',
                  borderRadius: '14px 14px 0 0',
                  padding: '10px 16px',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  marginBottom: -3,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                {tabItem.label}
                {tabItem.badge !== undefined && (
                  <span
                    className="chip"
                    style={{ fontSize: 10, padding: '1px 7px', background: 'white' }}
                  >
                    {tabItem.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--cream-2)',
              border: '3px solid var(--line)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--plush-tiny)',
              marginBottom: 18,
              fontSize: 14,
              fontWeight: 700,
              fontStyle: 'italic',
            }}
          >
            "{c.chiefComplaint}"
          </div>

          {tab === 'history' && <HistoryTab patient={patient} />}
          {tab === 'chat' && <ChatTab patientName={c.name} />}
          {tab === 'tests' && <TestsTab patient={patient} />}
          {tab === 'results' && <ResultsTab patient={patient} />}
          {tab === 'diagnose' && (
            <DiagnoseTab
              patient={patient}
              onDispatch={onDispatch}
              onGoToRx={() => setTab('rx')}
              submitted={submitted}
            />
          )}
          {tab === 'rx' && (
            <RxTab patient={patient} onDispatch={onDispatch} unlocked={rxUnlocked} />
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '10px 22px',
            borderTop: '3px solid var(--line)',
            background: 'var(--cream-2)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--ink-2)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('examine.pressEsc')} · {t('examine.testsOrdered', { count: ordered.size })}</span>
          <span>{submitted ? t('examine.diagnosisLabel', { label: diagLabel(submitted) }) : t('examine.diagnosisPending')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Vital chip ────────────────────────────────────────────────────

function Vital({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  tone: string;
}) {
  return (
    <div
      style={{
        background: tone,
        border: '3px solid var(--line)',
        borderRadius: 12,
        padding: '6px 4px',
        textAlign: 'center',
        boxShadow: 'var(--plush-tiny)',
      }}
    >
      <div style={{ fontSize: 14 }}>{icon}</div>
      <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700 }}>
        {label} <span style={{ opacity: 0.6 }}>{unit}</span>
      </div>
    </div>
  );
}

// ── History tab ──────────────────────────────────────────────────

function HistoryTab({ patient }: { patient: NonNullable<ReturnType<typeof useGameState>['polyclinic']['patient']> }) {
  const { t } = useTranslation();
  const c = patient.case;
  const asked = new Set(patient.askedQuestionIds);
  const answered = c.anamnesis.filter((q) => asked.has(q.id));
  const unanswered = c.anamnesis.filter((q) => !asked.has(q.id));

  if (c.anamnesis.length === 0) {
    return <div style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{t('examine.noAnamnesis')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {answered.map((q) => (
        <div
          key={q.id}
          className="plush"
          style={{
            padding: 12,
            background: q.relevant ? 'var(--mint)' : 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink-2)' }}>{t('examine.youAsked')}</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{q.question}</div>
          <div style={{ marginTop: 4, fontSize: 14, fontStyle: 'italic' }}>
            <strong>{c.name.split(' ')[0]}:</strong> "{q.answer}"
          </div>
        </div>
      ))}

      {unanswered.length === 0 ? (
        <div className="plush" style={{ padding: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
          {t('examine.allCovered')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--ink-2)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 8,
            }}
          >
            {t('examine.askHeader')}
          </div>
          {unanswered.map((q) => (
            <button
              key={q.id}
              type="button"
              className="tap btn-plush ghost"
              style={{
                fontSize: 14,
                padding: '10px 14px',
                textAlign: 'left',
                fontWeight: 700,
              }}
              onClick={() => store.askPolyclinicQuestion(q.id)}
            >
              {q.question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Order Tests tab ───────────────────────────────────────────────

function TestsTab({ patient }: { patient: NonNullable<ReturnType<typeof useGameState>['polyclinic']['patient']> }) {
  const { t } = useTranslation();
  const state = useGameState();
  const currentClinic = state.polyclinic.clinic;
  const ordered = new Set(patient.orderedTestIds);
  const groups = useMemo(() => {
    const out: Record<'bedside' | 'lab' | 'imaging', typeof TESTS> = { bedside: [], lab: [], imaging: [] };
    TESTS.forEach((test) => out[test.category].push(test));
    return out;
  }, []);

  // Specialty-aware panel filter: only panels tagged for the active clinic.
  // 'all-specialties' surfaces every polyclinic panel; ED-only panels (no
  // clinicIds) are always hidden from the polyclinic view.
  const visiblePanels = useMemo(() => {
    return TEST_PANELS.filter((panel) => {
      if (!panel.clinicIds || panel.clinicIds.length === 0) return false;
      if (currentClinic === 'all-specialties') return true;
      return panel.clinicIds.includes(currentClinic);
    });
  }, [currentClinic]);

  const orderPanel = (testIds: string[]) => {
    testIds.forEach((id) => store.orderPolyclinicTest(id));
  };

  const cardStyle: React.CSSProperties = {
    fontSize: 13,
    padding: '10px 12px',
    fontWeight: 700,
    textAlign: 'left' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}
        dangerouslySetInnerHTML={{ __html: t('examine.testsInstant') }}
      />

      {/* Panels — clinic-scoped, collapsible. */}
      {visiblePanels.length > 0 && (
        <CollapsibleSection
          icon="🧪"
          label={t('examine.panelsFor', { scope: currentClinic === 'all-specialties' ? t('examine.panelsForAll') : t('examine.panelsForClinic') })}
          count={visiblePanels.length}
          tone="var(--butter)"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 8,
            }}
          >
            {visiblePanels.map((panel) => {
              const allOrdered = panel.testIds.every((id) => ordered.has(id));
              return (
                <button
                  key={panel.id}
                  type="button"
                  className={`tap btn-plush ${allOrdered ? '' : 'ghost'}`}
                  disabled={allOrdered}
                  onClick={() => orderPanel(panel.testIds)}
                  style={{
                    ...cardStyle,
                    opacity: allOrdered ? 0.55 : 1,
                    cursor: allOrdered ? 'default' : 'pointer',
                  }}
                  title={panel.description}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{allOrdered ? '✓ ' : ''}{panel.label}</strong>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        background: 'var(--cream)',
                        border: '2px solid var(--line)',
                        borderRadius: 'var(--r-pill)',
                        padding: '1px 7px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('examine.tests', { count: panel.testIds.length })}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700, marginTop: 4 }}>
                    {panel.description}
                  </div>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Per-category lists, also collapsible. */}
      {(['bedside', 'lab', 'imaging'] as const).map((cat) => {
        const list = groups[cat];
        const available = list.filter((test) => !ordered.has(test.id));
        const label = cat === 'bedside' ? t('examine.bedside') : cat === 'lab' ? t('examine.laboratory') : t('examine.imaging');
        const icon = cat === 'bedside' ? '🩺' : cat === 'lab' ? '🧬' : '📷';
        const tone = cat === 'bedside' ? 'var(--mint)' : cat === 'lab' ? 'var(--sky)' : 'var(--peach)';
        return (
          <CollapsibleSection
            key={cat}
            icon={icon}
            label={label}
            count={list.length}
            tone={tone}
            extra={t('examine.available', { count: available.length })}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}
            >
              {list.map((test) => {
                const isOrdered = ordered.has(test.id);
                return (
                  <button
                    key={test.id}
                    type="button"
                    className={`tap btn-plush ${isOrdered ? '' : 'ghost'}`}
                    disabled={isOrdered}
                    onClick={() => store.orderPolyclinicTest(test.id)}
                    style={{
                      ...cardStyle,
                      opacity: isOrdered ? 0.55 : 1,
                      cursor: isOrdered ? 'default' : 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span>
                        {isOrdered ? '✓ ' : ''}
                        {test.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: isOrdered ? 'var(--mint-deep)' : 'var(--ink-2)',
                          background: 'var(--cream)',
                          border: '2px solid var(--line)',
                          borderRadius: 'var(--r-pill)',
                          padding: '1px 7px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isOrdered ? t('examine.ordered') : t('examine.instant')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

// ── Reusable collapsible section ─────────────────────────────────

function CollapsibleSection({
  icon,
  label,
  count,
  tone,
  extra,
  children,
  defaultOpen = false,
}: {
  icon: string;
  label: string;
  count: number;
  tone: string;
  extra?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="plush"
      open={defaultOpen}
      style={{
        padding: 0,
        background: 'white',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: tone,
            border: '3px solid var(--line)',
            borderRadius: 'var(--r-pill)',
            padding: '3px 12px',
            fontWeight: 800,
            fontSize: 12,
            boxShadow: 'var(--plush-tiny)',
          }}
        >
          {icon} {label}
        </span>
        <span
          className="chip"
          style={{ fontSize: 11, padding: '2px 8px' }}
        >
          {count}
        </span>
        {extra && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>
            {extra}
          </span>
        )}
        <span
          aria-hidden
          style={{
            marginLeft: 'auto',
            fontSize: 14,
            color: 'var(--ink-2)',
            fontWeight: 900,
          }}
        >
          ▾
        </span>
      </summary>
      <div
        style={{
          padding: '0 14px 14px',
          borderTop: '2px dashed rgba(43,30,22,0.18)',
          marginTop: 6,
          paddingTop: 14,
        }}
      >
        {children}
      </div>
    </details>
  );
}

// ── Results tab ──────────────────────────────────────────────────

function ResultsTab({ patient }: { patient: NonNullable<ReturnType<typeof useGameState>['polyclinic']['patient']> }) {
  const { t } = useTranslation();
  const c = patient.case;
  const completed = new Set(patient.completedTestIds);
  const [zoomed, setZoomed] = useState<{ url: string; caption: string; credit: string } | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (patient.orderedTestIds.length === 0) {
    return (
      <div className="plush" style={{ padding: 14, fontWeight: 700, color: 'var(--ink-2)' }}
        dangerouslySetInnerHTML={{ __html: t('examine.noTestsYet') }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {patient.orderedTestIds.map((tid) => {
        const test = testById(tid);
        if (!test) return null;
        const done = completed.has(tid);
        const caseResult = c.testResults.find((r) => r.testId === tid);
        const report = done ? getTestReport(tid, caseResult?.result, !!caseResult?.abnormal) : null;
        const tone = report?.abnormal ? 'var(--rose)' : 'var(--mint)';
        const isImaging = test.category === 'imaging' || tid === 'ecg';
        const images = done && isImaging
          ? getImagingExamples(tid, !!caseResult?.abnormal, c.correctDiagnosisId)
          : [];
        return (
          <details
            key={tid}
            className="plush"
            style={{ padding: 12, background: 'white' }}
          >
            <summary
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                listStyle: 'none',
                fontWeight: 800,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: tone,
                  border: '2px solid var(--line)',
                }}
              />
              <span>{test.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-2)' }}>
                {report?.abnormal ? t('examine.abnormal') : t('examine.normal')}
              </span>
            </summary>

            {images.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {images.map((img, i) => (
                  <figure
                    key={i}
                    style={{
                      margin: 0,
                      background: '#0b0b0d',
                      borderRadius: 12,
                      border: '2px solid var(--line)',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={img.url}
                      alt={img.caption}
                      loading="lazy"
                      onClick={() => setZoomed({ url: img.url, caption: img.caption, credit: img.credit })}
                      title="Click to zoom"
                      style={{
                        display: 'block',
                        width: '100%',
                        maxHeight: 420,
                        objectFit: 'contain',
                        background: '#0b0b0d',
                        cursor: 'zoom-in',
                      }}
                    />
                    <figcaption
                      style={{
                        padding: '6px 10px',
                        fontSize: 11,
                        color: '#d8d8dc',
                        fontWeight: 600,
                        background: '#0b0b0d',
                      }}
                    >
                      {img.caption}
                      <span style={{ display: 'block', opacity: 0.6, marginTop: 2 }}>
                        {img.credit}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            <details style={{ marginTop: 10 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  listStyle: 'none',
                }}
              >
                {images.length > 0 ? t('examine.showWrittenReport') : t('examine.showDetails')}
              </summary>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'ui-monospace, monospace',
                  background: 'var(--cream)',
                  padding: 10,
                  borderRadius: 10,
                  border: '2px solid var(--line)',
                }}
              >
                {report?.text ?? t('examine.pending')}
              </div>
            </details>
          </details>
        );
      })}

      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          role="dialog"
          aria-label="Imaging viewer"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            cursor: 'zoom-out',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(null);
            }}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.12)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.25)',
              borderRadius: 12,
              padding: '8px 14px',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title="Close (Esc)"
          >
            ✕ Close
          </button>
          <img
            src={zoomed.url}
            alt={zoomed.caption}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '95vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
          <div
            style={{
              marginTop: 14,
              color: '#e8e8ec',
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              maxWidth: '90vw',
            }}
          >
            {zoomed.caption}
            <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>{zoomed.credit}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Diagnose tab ─────────────────────────────────────────────────

// Mulberry32 PRNG seeded from a case id — stable across remounts so the
// shuffled diagnosis tiles don't reshuffle if the overlay is reopened.
function shuffleSeeded<T>(input: readonly T[], seedKey: string): T[] {
  let seed = 2166136261 >>> 0;
  for (let i = 0; i < seedKey.length; i++) {
    seed ^= seedKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function DiagnoseTab({
  patient,
  onDispatch,
  onGoToRx,
  submitted,
}: {
  patient: NonNullable<ReturnType<typeof useGameState>['polyclinic']['patient']>;
  onDispatch: () => void;
  onGoToRx: () => void;
  submitted: string | null;
}) {
  const { t } = useTranslation();
  const c = patient.case;
  // Source data lists the correct answer first; shuffle deterministically per
  // case so the player can't game it by always tapping the top tile, while
  // the order stays stable if the overlay is closed and reopened.
  const shuffledOptions = useMemo(
    () => shuffleSeeded(c.diagnosisOptions, c.id),
    [c.id, c.diagnosisOptions],
  );
  if (c.diagnosisOptions.length === 0) {
    return (
      <div className="plush" style={{ padding: 14, fontWeight: 700, color: 'var(--ink-2)' }}>
        {t('examine.noDiagnosisOptions')}
      </div>
    );
  }
  const isCorrect = submitted === c.correctDiagnosisId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
        {t('examine.diagnoseBody')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {shuffledOptions.map((dxId) => {
          const isPicked = submitted === dxId;
          const showCorrect = submitted !== null && dxId === c.correctDiagnosisId;
          const showWrong = isPicked && !isCorrect;
          const bg = showCorrect ? 'var(--mint)' : showWrong ? 'var(--rose)' : isPicked ? 'var(--butter)' : 'white';
          return (
            <button
              key={dxId}
              type="button"
              className="tap btn-plush ghost"
              disabled={submitted !== null}
              onClick={() => store.submitPolyclinicDiagnosis(dxId)}
              style={{
                fontSize: 13,
                padding: '12px 14px',
                background: bg,
                fontWeight: 800,
                cursor: submitted !== null ? 'default' : 'pointer',
              }}
            >
              {showCorrect ? '✓ ' : showWrong ? '✗ ' : ''}
              {diagLabel(dxId)}
            </button>
          );
        })}
      </div>

      {submitted && (
        <div
          className="plush"
          style={{
            padding: 14,
            background: isCorrect ? 'var(--mint)' : 'var(--rose)',
            fontWeight: 800,
          }}
        >
          {isCorrect
            ? t('examine.spotOn', { label: diagLabel(c.correctDiagnosisId) })
            : t('examine.notQuite', { label: diagLabel(c.correctDiagnosisId) })}
        </div>
      )}

      {submitted && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            className="btn-plush primary breathe"
            style={{ fontSize: 16, padding: '14px 0' }}
            onClick={onGoToRx}
          >
            {t('examine.writePrescription')}
          </button>
          <button
            type="button"
            className="btn-plush ghost"
            style={{ fontSize: 16, padding: '14px 0' }}
            onClick={onDispatch}
          >
            {t('examine.dispatchWithoutRx')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chat tab — live voice transcript ─────────────────────────────

function ChatTab({ patientName }: { patientName: string }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>(() => {
    const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
    return conv ? conv.getMessages() : [];
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to live message updates so the chat history updates while
  // the doctor talks. The conversation's `subscribeMessages` returns a
  // teardown so we clean up on unmount / patient change.
  useEffect(() => {
    const conv = getExistingConversation(POLYCLINIC_BED_INDEX);
    if (!conv) return;
    setMessages(conv.getMessages());
    return conv.subscribeMessages((msgs) => setMessages(msgs));
  }, []);

  // Auto-scroll to the latest message whenever new ones come in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Skip the system seed message (role: 'system') if any leak through.
  const visible = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  if (visible.length === 0) {
    return (
      <div className="plush" style={{ padding: 14, fontWeight: 700, color: 'var(--ink-2)' }}>
        {t('examine.noConversation', { name: patientName.split(' ')[0] })}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 380,
        overflowY: 'auto',
        paddingRight: 6,
      }}
    >
      {visible.map((m, i) => {
        const mine = m.role === 'user';
        return (
          <div
            key={i}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              background: mine ? 'var(--sky)' : 'white',
              border: '3px solid var(--line)',
              borderRadius:
                mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding: '10px 14px',
              boxShadow: 'var(--plush-tiny)',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: 'var(--ink-2)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              {mine ? t('examine.you') : patientName.split(' ')[0]}
            </div>
            {m.content}
          </div>
        );
      })}
    </div>
  );
}

// ── Rx tab — prescription pad ─────────────────────────────────────

function RxTab({
  patient,
  onDispatch,
  unlocked,
}: {
  patient: NonNullable<ReturnType<typeof useGameState>['polyclinic']['patient']>;
  onDispatch: () => void;
  unlocked: boolean;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Record<string, { dose: string; duration: string }>>({});
  const [filter, setFilter] = useState<MedicationCategory | 'all'>('all');

  if (!unlocked) {
    return (
      <div className="plush" style={{ padding: 14, fontWeight: 700, color: 'var(--ink-2)' }}
        dangerouslySetInnerHTML={{ __html: t('examine.rxUnlockHint') }}
      />
    );
  }

  const specialty = getCaseSpecialty(patient.case.id);
  const allowedCategories = useMemo<MedicationCategory[] | null>(
    () => (specialty ? SPECIALTY_MEDICATION_CATEGORIES[specialty] : null),
    [specialty],
  );

  const categories = useMemo(() => {
    const set = new Set<MedicationCategory>();
    MEDICATIONS.forEach((m) => {
      if (allowedCategories && !allowedCategories.includes(m.category)) return;
      set.add(m.category);
    });
    return Array.from(set);
  }, [allowedCategories]);

  const visibleMeds = useMemo(() => {
    return MEDICATIONS.filter((m) => {
      if (allowedCategories && !allowedCategories.includes(m.category)) return false;
      return filter === 'all' || m.category === filter;
    });
  }, [filter, allowedCategories]);

  const submitted = patient.prescriptions ?? [];
  const pickedIds = Object.keys(picked);
  const pickedList = pickedIds
    .map((id) => {
      const med = MEDICATIONS.find((m) => m.id === id);
      return med ? { med, ...picked[id] } : null;
    })
    .filter((x): x is { med: Medication; dose: string; duration: string } => x !== null);

  const togglePick = (m: Medication) => {
    setPicked((prev) => {
      if (prev[m.id]) {
        const { [m.id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [m.id]: { dose: m.defaultDose, duration: m.defaultDuration } };
    });
  };

  const updatePicked = (id: string, field: 'dose' | 'duration', value: string) => {
    setPicked((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const onSubmitAll = () => {
    if (pickedList.length === 0) return;
    for (const { med, dose, duration } of pickedList) {
      store.addPolyclinicPrescription({
        medicationId: med.id,
        dose: dose || med.defaultDose,
        duration: duration || med.defaultDuration,
      });
    }
    setPicked({});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Already-prescribed list */}
      {submitted.length > 0 && (
        <section>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--ink-2)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {t('examine.prescribedHeader', { count: submitted.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {submitted.map((rx, i) => {
              const med = medicationById(rx.medicationId);
              return (
                <div
                  key={i}
                  className="plush"
                  style={{ padding: 10, background: 'var(--mint)', fontWeight: 700, fontSize: 13 }}
                >
                  💊 <strong>{med?.name ?? rx.medicationId}</strong> — {rx.dose}, {rx.duration}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Specialty scope hint */}
      {specialty && specialty !== 'all-specialties' && (
        <div
          className="plush"
          style={{
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-2)',
            background: 'var(--cream)',
          }}
          dangerouslySetInnerHTML={{ __html: t('examine.specialtyScope', { clinic: t(`clinic.${specialty}`) }) }}
        />
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span
          className={`chip ${filter === 'all' ? 'butter' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setFilter('all')}
        >
          {t('examine.all')}
        </span>
        {categories.map((c) => (
          <span
            key={c}
            className={`chip ${filter === c ? 'butter' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setFilter(c)}
          >
            {CATEGORY_LABELS[c]}
          </span>
        ))}
      </div>

      {/* Medication picker */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
          maxHeight: 240,
          overflowY: 'auto',
          paddingRight: 6,
        }}
      >
        {visibleMeds.map((m) => {
          const isPicked = !!picked[m.id];
          return (
            <button
              key={m.id}
              type="button"
              className={`tap btn-plush ${isPicked ? '' : 'ghost'}`}
              onClick={() => togglePick(m)}
              style={{
                fontSize: 12,
                padding: '8px 10px',
                textAlign: 'left',
                fontWeight: 700,
                background: isPicked ? 'var(--butter)' : undefined,
              }}
            >
              <div>
                {isPicked ? '✓ ' : ''}
                {m.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-2)', fontWeight: 700 }}>
                {m.class} · {m.form}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dose + duration editor for all selected meds */}
      {pickedList.length > 0 && (
        <div
          className="plush"
          style={{
            padding: 14,
            background: 'var(--cream-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--ink-2)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {t('examine.selectedReview', { count: pickedList.length })}
          </div>
          {pickedList.map(({ med, dose, duration }) => (
            <div
              key={med.id}
              style={{
                background: 'white',
                border: '3px solid var(--line)',
                borderRadius: 12,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontWeight: 800, fontSize: 13 }}>
                  {med.name}{' '}
                  <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700 }}>
                    ({med.class})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => togglePick(med)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 800,
                    color: 'var(--ink-2)',
                    fontSize: 14,
                  }}
                  title={t('examine.remove')}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 140px', fontSize: 11, fontWeight: 800, color: 'var(--ink-2)' }}>
                  {t('examine.dose')}
                  <input
                    value={dose}
                    onChange={(e) => updatePicked(med.id, 'dose', e.target.value)}
                    placeholder={med.defaultDose}
                    style={inputStyle}
                  />
                </label>
                <label style={{ flex: '1 1 140px', fontSize: 11, fontWeight: 800, color: 'var(--ink-2)' }}>
                  {t('examine.duration')}
                  <input
                    value={duration}
                    onChange={(e) => updatePicked(med.id, 'duration', e.target.value)}
                    placeholder={med.defaultDuration}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-plush primary"
            onClick={onSubmitAll}
            style={{ fontSize: 14, padding: '10px 18px' }}
          >
            {t('examine.addToPrescription', { count: pickedList.length })}
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn-plush primary breathe"
        style={{ fontSize: 18, padding: '14px 0' }}
        onClick={onDispatch}
      >
        {submitted.length === 0 ? t('examine.dispatchWithout') : t('examine.dispatchWith')}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  border: '3px solid var(--line)',
  borderRadius: 12,
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 13,
  background: 'white',
  color: 'var(--ink)',
};
