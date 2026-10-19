'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Link from 'next/link';

// ── Layout helper ────────────────────────────────────────────────────────────
// ── Layout helper ────────────────────────────────────────────────────────────
function layoutGraph(nodes, radius = 340) {
  if (!nodes || nodes.length === 0) return [];
  const centerX = 560;
  const centerY = 380;
  
  const concepts = nodes.filter(n => n.data.type === 'concept');
  const others = nodes.filter(n => n.data.type !== 'concept');
  
  const positioned = [];
  
  // Concepts in inner ring
  concepts.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(concepts.length, 1) - Math.PI / 2;
    const r = radius * 0.85;
    positioned.push({
      ...node,
      position: {
        x: Math.round(centerX + r * Math.cos(angle)),
        y: Math.round(centerY + r * Math.sin(angle)),
      },
    });
  });
  
  // Documents and notes in outer ring
  others.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(others.length, 1) - Math.PI / 2;
    const r = radius * 1.5;
    positioned.push({
      ...node,
      position: {
        x: Math.round(centerX + r * Math.cos(angle)),
        y: Math.round(centerY + r * Math.sin(angle)),
      },
    });
  });
  
  return positioned;
}

// ── Custom Concept Node ──────────────────────────────────────────────────────
function ConceptNode({ data }) {
  const isKnown = data.is_known;
  const borderColor = isKnown ? '#10b981' : '#8b5cf6';
  const bgColor = isKnown ? 'rgba(16, 185, 129, 0.18)' : 'rgba(139, 92, 246, 0.18)';

  return (
    <div
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: 20,
        padding: '8px 16px',
        minWidth: 120,
        maxWidth: 220,
        cursor: 'pointer',
        boxShadow: isKnown ? '0 0 14px rgba(16, 185, 129, 0.3)' : '0 0 14px rgba(139, 92, 246, 0.3)',
        backdropFilter: 'blur(8px)',
        textAlign: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 8, height: 8 }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.label}
      </div>
      <div style={{ fontSize: 10, color: isKnown ? '#34d399' : '#c084fc', marginTop: 2, display: 'flex', justifyContent: 'center', gap: 6 }}>
        <span>{isKnown ? '✓ Mastered' : '○ To Learn'}</span>
        <span>• ⚡{data.mention_count || 1}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 8, height: 8 }} />
    </div>
  );
}

// ── Custom Document Node ─────────────────────────────────────────────────────
function DocumentNode({ data }) {
  return (
    <div
      style={{
        background: 'rgba(59, 130, 246, 0.18)',
        border: '2px solid #3b82f6',
        borderRadius: 10,
        padding: '8px 14px',
        maxWidth: 180,
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 12px rgba(59, 130, 246, 0.25)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 8, height: 8 }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' }}>
        📄 PDF Document
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 8, height: 8 }} />
    </div>
  );
}

// ── Custom Note Node ─────────────────────────────────────────────────────────
function NoteNode({ data }) {
  return (
    <div
      style={{
        background: 'rgba(245, 158, 11, 0.18)',
        border: '2px solid #f59e0b',
        borderRadius: 10,
        padding: '8px 14px',
        maxWidth: 180,
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 12px rgba(245, 158, 11, 0.25)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 8, height: 8 }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
        📝 Text Note
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 8, height: 8 }} />
    </div>
  );
}

export default function ConceptGraphPage() {
  const { userToken } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'concepts' | 'docs' | 'notes'
  const [stats, setStats] = useState(null);

  const nodeTypes = useMemo(
    () => ({
      concept: ConceptNode,
      document: DocumentNode,
      note: NoteNode,
    }),
    []
  );

  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/study-paths/graph');
      const data = res.data;
      setStats(data.stats);

      // Transform nodes
      const rawNodes = data.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: {
          label: n.label,
          type: n.type,
          is_known: n.is_known,
          mention_count: n.mention_count,
          description: n.description,
        },
      }));

      // Transform edges
      const rawEdges = data.edges.map((e, idx) => {
        const isPrereq = e.type === 'PREREQUISITE_OF';
        return {
          id: `e-${idx}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          type: 'default',
          animated: isPrereq,
          style: {
            stroke: isPrereq ? '#8b5cf6' : '#64748b',
            strokeWidth: isPrereq ? 2.5 : 1.5,
            strokeDasharray: isPrereq ? undefined : '5,5',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isPrereq ? '#8b5cf6' : '#64748b',
          },
        };
      });

      const positioned = layoutGraph(rawNodes);
      setNodes(positioned);
      setEdges(rawEdges);
    } catch (err) {
      console.error('Failed to load concept graph:', err);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!userToken) return;
    fetchGraphData();
  }, [userToken, fetchGraphData]);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    if (filterType === 'all') return nodes;
    return nodes.filter((n) => {
      if (filterType === 'concepts') return n.type === 'concept';
      if (filterType === 'docs') return n.type === 'concept' || n.type === 'document';
      if (filterType === 'notes') return n.type === 'concept' || n.type === 'note';
      return true;
    });
  }, [nodes, filterType]);

  const onNodeClick = (_, node) => {
    setSelectedNode(node);
  };

  const handleToggleKnownInGraph = async (conceptId, markKnown) => {
    try {
      if (markKnown) {
        await api.post(`/study-paths/known-concepts/${encodeURIComponent(conceptId)}`);
      } else {
        await api.delete(`/study-paths/known-concepts/${encodeURIComponent(conceptId)}`);
      }
      // Refresh graph
      await api.get('/study-paths/graph?refresh=true');
      fetchGraphData();
      if (selectedNode) {
        setSelectedNode((prev) => ({
          ...prev,
          data: { ...prev.data, is_known: markKnown },
        }));
      }
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (!userToken) return null;

  return (
    <div style={styles.page}>
      <Navigation />

      <main style={styles.main}>
        {/* Top Control Bar */}
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.graphHeading}>Interactive Concept Graph</h1>
            <p style={styles.graphSub}>
              Visualizing prerequisite chains (🟣 solid) and document/note mentions (dashed). Drag nodes freely to explore.
            </p>
          </div>

          <div style={styles.filtersRow}>
            <div style={styles.filterBtns}>
              <button
                onClick={() => setFilterType('all')}
                style={{ ...styles.filterBtn, ...(filterType === 'all' ? styles.filterBtnActive : {}) }}
              >
                All Entities
              </button>
              <button
                onClick={() => setFilterType('concepts')}
                style={{ ...styles.filterBtn, ...(filterType === 'concepts' ? styles.filterBtnActive : {}) }}
              >
                Concepts Only
              </button>
              <button
                onClick={() => setFilterType('docs')}
                style={{ ...styles.filterBtn, ...(filterType === 'docs' ? styles.filterBtnActive : {}) }}
              >
                + Documents
              </button>
              <button
                onClick={() => setFilterType('notes')}
                style={{ ...styles.filterBtn, ...(filterType === 'notes' ? styles.filterBtnActive : {}) }}
              >
                + Notes
              </button>
            </div>

            <button onClick={fetchGraphData} style={styles.refreshBtn}>
              🔄 Re-center
            </button>
          </div>
        </div>

        {/* Graph Canvas Container */}
        <div style={styles.canvasContainer}>
          {loading ? (
            <div style={styles.centered}><div className="spinner" /></div>
          ) : nodes.length === 0 ? (
            <div style={styles.centered}>
              <p style={{ color: 'var(--text-tertiary)' }}>No concepts or documents in knowledge base yet. Upload a PDF or create a note!</p>
            </div>
          ) : (
            <ReactFlow
              nodes={filteredNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
              minZoom={0.2}
              maxZoom={2.5}
              style={{ width: '100%', height: '100%' }}
            >
              <Background color="#27272a" gap={20} />
              <Controls style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <MiniMap
                nodeColor={(n) => {
                  if (n.type === 'concept') return n.data.is_known ? '#10b981' : '#8b5cf6';
                  if (n.type === 'document') return '#3b82f6';
                  return '#f59e0b';
                }}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              />
            </ReactFlow>
          )}

          {/* Node Inspect Sidebar Drawer */}
          {selectedNode && (
            <div style={styles.sidebarDrawer}>
              <div style={styles.drawerHeader}>
                <span style={styles.drawerTypeBadge}>
                  {selectedNode.data.type.toUpperCase()}
                </span>
                <button onClick={() => setSelectedNode(null)} style={styles.closeDrawerBtn}>✕</button>
              </div>

              <h3 style={styles.drawerTitle}>{selectedNode.data.label}</h3>

              {selectedNode.data.description && (
                <p style={styles.drawerDesc}>{selectedNode.data.description}</p>
              )}

              {selectedNode.data.type === 'concept' && (
                <div style={styles.drawerActions}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Mastery Status:</span>
                    <button
                      onClick={() => {
                        const rawId = selectedNode.id.replace('concept_', '');
                        handleToggleKnownInGraph(rawId, !selectedNode.data.is_known);
                      }}
                      style={{
                        ...styles.statusToggleBtn,
                        ...(selectedNode.data.is_known ? styles.statusToggleBtnKnown : {}),
                      }}
                    >
                      {selectedNode.data.is_known ? '✓ Mastered' : 'Mark Known'}
                    </button>
                  </div>

                  <Link
                    href={`/study-path?concept=${encodeURIComponent(selectedNode.id.replace('concept_', ''))}`}
                    style={styles.drawerStudyPathLink}
                  >
                    🗺️ Generate Study Path Roadmap
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Legend Panel */}
          <div style={styles.legendPanel}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#8b5cf6' }} />
              <span>Concept (To Learn)</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#10b981' }} />
              <span>Concept (Mastered)</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#3b82f6' }} />
              <span>PDF Document</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#f59e0b' }} />
              <span>Text Note</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 24px',
    maxWidth: 1400,
    margin: '0 auto',
    width: '100%',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 16,
  },
  graphHeading: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.5px',
    marginBottom: 4,
  },
  graphSub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  filterBtns: {
    display: 'flex',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 3,
  },
  filterBtn: {
    background: 'none',
    border: 'none',
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  filterBtnActive: {
    background: 'var(--surface-hi)',
    color: 'var(--text)',
    fontWeight: 600,
  },
  refreshBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  canvasContainer: {
    width: '100%',
    height: 'calc(100vh - 180px)',
    minHeight: '640px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebarDrawer: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 300,
    background: 'rgba(26, 26, 30, 0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 18,
    boxShadow: 'var(--shadow-md)',
    zIndex: 10,
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  drawerTypeBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.5px',
    color: 'var(--primary)',
  },
  closeDrawerBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    fontSize: 14,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  },
  drawerDesc: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  drawerActions: {
    borderTop: '1px solid var(--border)',
    paddingTop: 8,
    marginTop: 12,
  },
  statusToggleBtn: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  statusToggleBtnKnown: {
    background: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#34d399',
    color: '#34d399',
    fontWeight: 600,
  },
  drawerStudyPathLink: {
    display: 'block',
    textAlign: 'center',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    marginTop: 10,
  },
  legendPanel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    background: 'rgba(26, 26, 30, 0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    gap: 16,
    fontSize: 11,
    color: 'var(--text-secondary)',
    zIndex: 5,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  centered: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
