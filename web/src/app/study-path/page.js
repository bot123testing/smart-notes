'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { useSearchParams } from 'next/navigation';

function StudyPathContent() {
  const { userToken } = useAuth();
  const searchParams = useSearchParams();

  const [concepts, setConcepts] = useState([]);
  const [selectedConcept, setSelectedConcept] = useState('');
  const [studyPath, setStudyPath] = useState(null);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [loadingPath, setLoadingPath] = useState(false);
  const [loadingGap, setLoadingGap] = useState(false);
  const [activeTab, setActiveTab] = useState('path'); // 'path' | 'gap'
  const [errorMsg, setErrorMsg] = useState(null);
  const [responseTime, setResponseTime] = useState(null);

  // Fetch all user concepts for the selector
  useEffect(() => {
    if (!userToken) return;
    const fetchConcepts = async () => {
      try {
        const res = await api.get('/study-paths/concepts');
        setConcepts(res.data);

        // Auto-select concept from query param or first concept
        const queryConcept = searchParams.get('concept');
        if (queryConcept) {
          setSelectedConcept(queryConcept);
          loadStudyData(queryConcept);
        } else if (res.data.length > 0) {
          const first = res.data[0].normalized_name;
          setSelectedConcept(first);
          loadStudyData(first);
        }
      } catch (err) {
        console.error('Failed to load concepts:', err);
      }
    };
    fetchConcepts();
  }, [userToken, searchParams]);

  // Load study path and gap analysis for a concept
  const loadStudyData = async (conceptId) => {
    if (!conceptId) return;
    setErrorMsg(null);
    setLoadingPath(true);
    setLoadingGap(true);

    const startTime = performance.now();

    try {
      // 1. Fetch Study Path
      const pathRes = await api.get(`/study-paths/path/${encodeURIComponent(conceptId)}`);
      setStudyPath(pathRes.data);
      const elapsed = Math.round(performance.now() - startTime);
      setResponseTime(elapsed);
    } catch (err) {
      console.error('Failed to load study path:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to load study path.');
      setStudyPath(null);
    } finally {
      setLoadingPath(false);
    }

    try {
      // 2. Fetch Gap Analysis
      const gapRes = await api.get(`/study-paths/gap-analysis/${encodeURIComponent(conceptId)}`);
      setGapAnalysis(gapRes.data);
    } catch (err) {
      console.error('Failed to load gap analysis:', err);
      setGapAnalysis(null);
    } finally {
      setLoadingGap(false);
    }
  };

  // Handle selecting a new concept
  const handleSelectConcept = (cid) => {
    setSelectedConcept(cid);
    loadStudyData(cid);
  };

  // Toggle Known Concept
  const handleToggleKnown = async (conceptId, markKnown) => {
    try {
      if (markKnown) {
        await api.post(`/study-paths/known-concepts/${encodeURIComponent(conceptId)}`);
      } else {
        await api.delete(`/study-paths/known-concepts/${encodeURIComponent(conceptId)}`);
      }
      // Reload study data with refresh flag
      const pathRes = await api.get(`/study-paths/path/${encodeURIComponent(selectedConcept)}?refresh=true`);
      setStudyPath(pathRes.data);
      const gapRes = await api.get(`/study-paths/gap-analysis/${encodeURIComponent(selectedConcept)}?refresh=true`);
      setGapAnalysis(gapRes.data);
    } catch (err) {
      alert('Failed to update concept status: ' + (err.response?.data?.detail || err.message));
    }
  };

  const getDepthBadge = (depth) => {
    if (depth === 0) return <span style={{ ...styles.depthPill, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>Foundation</span>;
    if (depth === 1) return <span style={{ ...styles.depthPill, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>Intermediate</span>;
    return <span style={{ ...styles.depthPill, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>Advanced (L{depth})</span>;
  };

  if (!userToken) return null;

  return (
    <div style={styles.page}>
      <Navigation />

      <main style={styles.main}>
        {/* Header and Concept Selector */}
        <section style={styles.headerSection}>
          <div>
            <h1 style={styles.pageTitle}>Study Path Builder</h1>
            <p style={styles.pageSubtitle}>
              Target any concept to generate a cycle-safe, topologically ordered sequence of prerequisites, or run gap analysis to see what you need to learn next.
            </p>
          </div>

          {/* Concept Picker */}
          <div style={styles.pickerWrap}>
            <label style={styles.pickerLabel}>Target Concept:</label>
            <select
              value={selectedConcept}
              onChange={(e) => handleSelectConcept(e.target.value)}
              style={styles.selectInput}
            >
              {concepts.map((c) => (
                <option key={c.normalized_name} value={c.normalized_name}>
                  {c.name} ({c.mention_count || 1} mentions)
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Quick Pick Chips */}
        {concepts.length > 0 && (
          <div style={styles.quickChipsRow}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Suggested Targets:</span>
            {concepts.slice(0, 6).map((c) => (
              <button
                key={c.normalized_name}
                onClick={() => handleSelectConcept(c.normalized_name)}
                style={{
                  ...styles.chipBtn,
                  ...(selectedConcept === c.normalized_name ? styles.chipBtnActive : {}),
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Main Content Card */}
        <div style={styles.contentCard}>
          {/* Tabs and Meta Row */}
          <div style={styles.tabsRow}>
            <div style={styles.tabBtns}>
              <button
                onClick={() => setActiveTab('path')}
                style={{ ...styles.tabBtn, ...(activeTab === 'path' ? styles.tabBtnActive : {}) }}
              >
                🗺️ Ordered Roadmap
              </button>
              <button
                onClick={() => setActiveTab('gap')}
                style={{ ...styles.tabBtn, ...(activeTab === 'gap' ? styles.tabBtnActive : {}) }}
              >
                🎯 Gap Analysis (&ldquo;What Am I Missing?&rdquo;)
              </button>
            </div>

            {responseTime !== null && (
              <div style={styles.speedBadge} title="Cached via Redis key sp:user:...:study_path:...">
                ⚡ {responseTime} ms (Redis fast-path)
              </div>
            )}
          </div>

          {/* Cycle Warning Banner */}
          {studyPath?.has_cycle && (
            <div style={styles.cycleBanner}>
              <div style={styles.cycleIcon}>⚠️</div>
              <div>
                <strong>Cyclic Dependency Resolved</strong>
                <p style={{ fontSize: 12, marginTop: 2, color: '#fca5a5' }}>
                  {studyPath.cycle_warnings?.[0] || 'Prerequisite cycle was detected and broken safely via feedback-arc breaking to yield a deterministic topological order.'}
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={styles.errorBanner}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* TAB 1: ORDERED STUDY PATH */}
          {activeTab === 'path' && (
            <div style={styles.tabContent}>
              {loadingPath ? (
                <div style={styles.centered}><div className="spinner" /></div>
              ) : !studyPath || studyPath.steps.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No study path steps found. Select a concept with extracted prerequisites.</p>
                </div>
              ) : (
                <div style={styles.stepperContainer}>
                  <div style={styles.stepperHeader}>
                    <div>
                      <h3 style={styles.targetHeading}>
                        Mastering: <span style={{ color: 'var(--primary)' }}>{studyPath.target_concept_name}</span>
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {studyPath.total_steps} sequential steps required • {studyPath.readiness_percentage}% completed
                      </p>
                    </div>

                    <div style={styles.progressBarWrapper}>
                      <div style={{ ...styles.progressBarFill, width: `${studyPath.readiness_percentage}%` }} />
                    </div>
                  </div>

                  <div style={styles.stepList}>
                    {studyPath.steps.map((step) => (
                      <div
                        key={step.concept_id}
                        style={{
                          ...styles.stepCard,
                          ...(step.is_known ? styles.stepCardKnown : {}),
                        }}
                      >
                        <div style={styles.stepNumCol}>
                          <div style={{
                            ...styles.stepCircle,
                            ...(step.is_known ? styles.stepCircleKnown : {}),
                          }}>
                            {step.is_known ? '✓' : step.step_number}
                          </div>
                          <div style={styles.stepLine} />
                        </div>

                        <div style={styles.stepDetailsCol}>
                          <div style={styles.stepHeaderRow}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <h4 style={styles.stepTitle}>{step.name}</h4>
                              {getDepthBadge(step.depth)}
                              {step.is_known && (
                                <span style={styles.knownBadge}>Mastered</span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {step.related_sources?.length > 0 && (
                                <a
                                  href={`/?${step.related_sources[0].source_type === 'document' ? 'doc' : 'note'}=${step.related_sources[0].source_id}&concept=${encodeURIComponent(step.name)}&snippet=${encodeURIComponent(step.related_sources[0].snippet || '')}`}
                                  style={styles.studyInDocBtn}
                                  title={`Study "${step.name}" in source ${step.related_sources[0].source_type}`}
                                >
                                  📖 Study in {step.related_sources[0].source_type === 'document' ? 'PDF' : 'Note'} →
                                </a>
                              )}
                              <button
                                onClick={() => handleToggleKnown(step.concept_id, !step.is_known)}
                                style={{
                                  ...styles.toggleBtn,
                                  ...(step.is_known ? styles.toggleBtnKnown : {}),
                                }}
                              >
                                {step.is_known ? 'Unmark' : 'Mark Mastered ✓'}
                              </button>
                            </div>
                          </div>

                          <p style={styles.stepDesc}>
                            {step.description || 'Core concept in the knowledge domain.'}
                          </p>

                          {/* Prerequisites & Dependents */}
                          <div style={styles.relationsRow}>
                            {step.prerequisites?.length > 0 && (
                              <div style={styles.relationItem}>
                                <span style={styles.relLabel}>Requires:</span>
                                {step.prerequisites.map((p) => (
                                  <span key={p} style={styles.relPillReq}>{p}</span>
                                ))}
                              </div>
                            )}

                            {step.dependent_concepts?.length > 0 && (
                              <div style={styles.relationItem}>
                                <span style={styles.relLabel}>Unlocks:</span>
                                {step.dependent_concepts.map((d) => (
                                  <span key={d} style={styles.relPillDep}>{d}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Related Sources (Clickable Deep-Links to PDF Viewer with Highlighting) */}
                          {step.related_sources?.length > 0 && (
                            <div style={styles.sourcesBox}>
                              <span style={styles.sourcesTitle}>Study Materials (Click to read & highlight):</span>
                              <div style={styles.sourcesGrid}>
                                {step.related_sources.map((src, i) => (
                                  <a
                                    key={i}
                                    href={`/?${src.source_type === 'document' ? 'doc' : 'note'}=${src.source_id}&concept=${encodeURIComponent(step.name)}&chunk=${src.chunk_id || ''}&snippet=${encodeURIComponent(src.snippet || '')}`}
                                    style={styles.sourcePill}
                                    title={`Open ${src.title || (src.source_type === 'document' ? 'PDF' : 'Note')} and highlight "${step.name}"`}
                                  >
                                    <span>{src.source_type === 'document' ? '📄' : '📝'}</span>
                                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                                      {src.title ? (src.title.length > 25 ? `${src.title.slice(0, 25)}…` : src.title) : `${src.source_type.toUpperCase()} #${src.source_id.slice(-4)}`}:
                                    </span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {src.snippet ? `"${src.snippet.slice(0, 40)}…"` : 'View text'}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--primary)', marginLeft: 2 }}>↗</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GAP ANALYSIS ("WHAT AM I MISSING?") */}
          {activeTab === 'gap' && (
            <div style={styles.tabContent}>
              {loadingGap ? (
                <div style={styles.centered}><div className="spinner" /></div>
              ) : !gapAnalysis ? (
                <div style={styles.emptyState}><p>No gap analysis data available.</p></div>
              ) : (
                <div>
                  {/* Readiness Banner */}
                  <div style={styles.readinessHero}>
                    <div style={styles.readinessScoreBox}>
                      <span style={styles.readinessPercent}>{gapAnalysis.readiness_percentage}%</span>
                      <span style={styles.readinessLabel}>Readiness Score</span>
                    </div>

                    <div style={styles.readinessMeta}>
                      <h3 style={styles.readinessTitle}>
                        Knowledge Gap for {gapAnalysis.target_concept_name}
                      </h3>
                      <p style={styles.readinessSub}>
                        You have mastered {gapAnalysis.known_count} of {gapAnalysis.total_prerequisites} prerequisite concepts.
                        {gapAnalysis.missing_count === 0
                          ? ' 🎉 You have satisfied all prerequisites for this topic!'
                          : ` Complete the ${gapAnalysis.missing_count} remaining prerequisites below to achieve 100% mastery.`}
                      </p>
                    </div>
                  </div>

                  {/* Two Columns: Missing vs Mastered */}
                  <div style={styles.gapGrid}>
                    {/* Missing Concepts */}
                    <div style={styles.gapCol}>
                      <div style={styles.gapColHeader}>
                        <h4 style={{ color: '#f87171' }}>
                          ⚡ Missing Prerequisites ({gapAnalysis.missing_count})
                        </h4>
                        <span style={styles.colSubtext}>Recommended study sequence</span>
                      </div>

                      <div style={styles.gapList}>
                        {gapAnalysis.missing_prerequisites.length === 0 ? (
                          <div style={styles.colEmpty}>No missing prerequisites! You are fully prepared.</div>
                        ) : (
                          gapAnalysis.missing_prerequisites.map((m) => (
                            <div key={m.concept_id} style={styles.gapCardMissing}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h5 style={styles.gapCardTitle}>{m.name}</h5>
                                <button
                                  onClick={() => handleToggleKnown(m.concept_id, true)}
                                  style={styles.markKnownBtn}
                                >
                                  Mark Known ✓
                                </button>
                              </div>
                              <p style={styles.gapCardDesc}>{m.description || 'Prerequisite concept.'}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Mastered Concepts */}
                    <div style={styles.gapCol}>
                      <div style={styles.gapColHeader}>
                        <h4 style={{ color: '#34d399' }}>
                          ✓ Mastered Concepts ({gapAnalysis.known_count})
                        </h4>
                        <span style={styles.colSubtext}>Concepts you already know</span>
                      </div>

                      <div style={styles.gapList}>
                        {gapAnalysis.known_prerequisites.length === 0 ? (
                          <div style={styles.colEmpty}>No concepts marked as known yet.</div>
                        ) : (
                          gapAnalysis.known_prerequisites.map((k) => (
                            <div key={k.concept_id} style={styles.gapCardKnown}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h5 style={styles.gapCardTitle}>{k.name}</h5>
                                <button
                                  onClick={() => handleToggleKnown(k.concept_id, false)}
                                  style={styles.unmarkBtn}
                                >
                                  Unmark
                                </button>
                              </div>
                              <p style={styles.gapCardDesc}>{k.description || 'Mastered concept.'}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function StudyPathPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading Study Path Builder...</div>}>
      <StudyPathContent />
    </Suspense>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  main: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 24px',
  },
  headerSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 24,
    flexWrap: 'wrap',
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: '-0.8px',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    maxWidth: 620,
    lineHeight: 1.6,
  },
  pickerWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 260,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  selectInput: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
  },
  quickChipsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
    flexWrap: 'wrap',
  },
  chipBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chipBtnActive: {
    background: 'var(--primary-glow)',
    border: '1px solid var(--primary)',
    color: 'var(--primary)',
    fontWeight: 600,
  },
  contentCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  tabsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
    padding: '0 20px',
  },
  tabBtns: {
    display: 'flex',
    gap: 4,
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    padding: '14px 18px',
    fontSize: 14,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: 'all 0.15s ease',
  },
  tabBtnActive: {
    color: 'var(--primary)',
    borderBottomColor: 'var(--primary)',
    fontWeight: 600,
  },
  speedBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: '#34d399',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '4px 10px',
    borderRadius: 999,
  },
  cycleBanner: {
    margin: 20,
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#ef4444',
  },
  cycleIcon: {
    fontSize: 20,
  },
  errorBanner: {
    margin: 20,
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    color: '#f87171',
    fontSize: 13,
  },
  tabContent: {
    padding: 24,
  },
  stepperContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  stepperHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottom: '1px solid var(--border)',
  },
  targetHeading: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  progressBarWrapper: {
    width: 180,
    height: 8,
    background: 'var(--surface-hi)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--primary), #34d399)',
    transition: 'width 0.3s ease',
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
  },
  stepCard: {
    display: 'flex',
    gap: 20,
    position: 'relative',
  },
  stepCardKnown: {
    opacity: 0.85,
  },
  stepNumCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--surface-hi)',
    border: '2px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    zIndex: 2,
  },
  stepCircleKnown: {
    background: 'rgba(16, 185, 129, 0.2)',
    border: '2px solid #34d399',
    color: '#34d399',
  },
  stepLine: {
    width: 2,
    flex: 1,
    background: 'var(--border)',
    minHeight: 40,
    margin: '4px 0',
  },
  stepDetailsCol: {
    flex: 1,
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  stepHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text)',
  },
  depthPill: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
  },
  knownBadge: {
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    padding: '2px 8px',
    borderRadius: 4,
  },
  toggleBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--primary)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggleBtnKnown: {
    color: 'var(--text-tertiary)',
  },
  stepDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginBottom: 12,
  },
  relationsRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  relationItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
  },
  relLabel: {
    color: 'var(--text-tertiary)',
    fontWeight: 500,
  },
  relPillReq: {
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    padding: '2px 6px',
    borderRadius: 4,
  },
  relPillDep: {
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#60a5fa',
    padding: '2px 6px',
    borderRadius: 4,
  },
  sourcesBox: {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
  },
  sourcesTitle: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  sourcesGrid: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  sourcePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(28, 28, 35, 0.9)',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    maxWidth: 320,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  studyInDocBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 12px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  readinessHero: {
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(16, 185, 129, 0.05))',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 28,
    marginBottom: 28,
  },
  readinessScoreBox: {
    width: 90,
    height: 90,
    borderRadius: '50%',
    background: 'var(--surface)',
    border: '3px solid var(--primary)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px var(--primary-glow)',
  },
  readinessPercent: {
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--primary)',
  },
  readinessLabel: {
    fontSize: 9,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  readinessMeta: {
    flex: 1,
  },
  readinessTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 6,
  },
  readinessSub: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  gapGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  },
  gapCol: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 18,
  },
  gapColHeader: {
    marginBottom: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  colSubtext: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  gapList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  gapCardMissing: {
    background: 'var(--surface)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    padding: 12,
  },
  gapCardKnown: {
    background: 'var(--surface)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: 8,
    padding: 12,
  },
  gapCardTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  gapCardDesc: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginTop: 4,
  },
  markKnownBtn: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  unmarkBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-tertiary)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  colEmpty: {
    padding: '24px 12px',
    textAlign: 'center',
    color: 'var(--text-tertiary)',
    fontSize: 13,
  },
  centered: {
    textAlign: 'center',
    padding: 40,
  },
  emptyState: {
    textAlign: 'center',
    padding: 40,
    color: 'var(--text-tertiary)',
  },
};
