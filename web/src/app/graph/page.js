'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { useRouter } from 'next/navigation';

// ── Layout: simple force-directed seed using a circle layout ─────────────────
// React Flow needs absolute x/y positions. We arrange N nodes on a circle
// so the graph isn't a pile-up on first load. Users can drag freely after.
function circleLayout(nodes, radius = 350) {
    const n = nodes.length;
    return nodes.map((node, i) => {
        const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
        return {
            ...node,
            position: {
                x: Math.round(radius * Math.cos(angle) + radius + 80),
                y: Math.round(radius * Math.sin(angle) + radius + 80),
            },
        };
    });
}

// ── Decay → node colour ───────────────────────────────────────────────────────
function decayColor(decay) {
    if (decay >= 0.6) return { bg: '#fef2f2', border: '#ef4444', label: '#991b1b' };
    if (decay >= 0.3) return { bg: '#fffbeb', border: '#f59e0b', label: '#92400e' };
    return { bg: '#f0fdf4', border: '#22c55e', label: '#166534' };
}

// ── Custom node ───────────────────────────────────────────────────────────────
function NoteNode({ data }) {
    const { bg, border, label } = decayColor(data.memory_decay);
    const pct = Math.round(data.memory_decay * 100);

    return (
        <div
            style={{
                background: bg,
                border: `2px solid ${border}`,
                borderRadius: 12,
                padding: '10px 14px',
                minWidth: 140,
                maxWidth: 200,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', marginBottom: 4, lineHeight: '1.3' }}>
                {data.title}
            </div>

            {/* Decay bar */}
            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 4, marginBottom: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: border, borderRadius: 4 }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: label }}>
                <span>{pct}% decay</span>
                <span>⚡{data.importance_score.toFixed(0)} · 🔗{data.link_count}</span>
            </div>
        </div>
    );
}

const nodeTypes = { note: NoteNode };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GraphPage() {
    const { userToken } = useAuth();
    const router = useRouter();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedNote, setSelectedNote] = useState(null); // sidebar detail

    const loadGraph = useCallback(async () => {
        if (!userToken) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/notes/graph');
            const { nodes: rawNodes, edges: rawEdges } = res.data;

            // Build React Flow nodes
            const rfNodes = circleLayout(
                rawNodes.map((n) => ({
                    id: n.id,
                    type: 'note',
                    data: {
                        title: n.title,
                        importance_score: n.importance_score,
                        memory_decay: n.memory_decay,
                        link_count: n.link_count,
                    },
                    draggable: true,
                }))
            );

            // Build React Flow edges
            const rfEdges = rawEdges.map((e, i) => ({
                id: `e-${i}-${e.source}-${e.target}`,
                source: e.source,
                target: e.target,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#6366f1', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
            }));

            setNodes(rfNodes);
            setEdges(rfEdges);
        } catch (err) {
            console.error(err);
            setError('Failed to load graph data.');
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    useEffect(() => {
        if (!userToken) { router.push('/login'); return; }
        loadGraph();
    }, [userToken]);

    const onNodeClick = useCallback(async (_, node) => {
        // Show sidebar with note info; fetch full note for content preview
        try {
            const res = await api.get(`/notes/${node.id}`);
            setSelectedNote(res.data);
        } catch {
            setSelectedNote({ id: node.id, title: node.data.title, content: '...' });
        }
    }, []);

    if (!userToken) return null;

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif', background: '#0f0c29' }}>

            {/* Graph Canvas */}
            <div style={{ flex: 1, position: 'relative' }}>
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#a5b4fc', fontSize: 16, zIndex: 10,
                    }}>
                        ⬡ Loading graph…
                    </div>
                )}
                {error && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#f87171', fontSize: 16, zIndex: 10,
                    }}>
                        {error}
                    </div>
                )}

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    style={{ background: 'transparent' }}
                >
                    <Background color="#2d2a5e" gap={28} size={1} />
                    <Controls style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 8 }} />
                    <MiniMap
                        nodeColor={(n) => {
                            const { border } = decayColor(n.data?.memory_decay ?? 0);
                            return border;
                        }}
                        style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 8 }}
                    />
                    <Panel position="top-left">
                        <div style={{
                            background: 'rgba(30,27,75,0.92)', backdropFilter: 'blur(8px)',
                            border: '1px solid #4338ca', borderRadius: 12, padding: '12px 18px',
                            color: '#a5b4fc',
                        }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#e0e7ff', marginBottom: 4 }}>
                                🧠 Knowledge Graph
                            </div>
                            <div style={{ fontSize: 12, marginBottom: 8 }}>
                                {nodes.length} notes · {edges.length} links
                            </div>
                            <div style={{ fontSize: 11, display: 'flex', gap: 10 }}>
                                <span style={{ color: '#22c55e' }}>● Fresh</span>
                                <span style={{ color: '#f59e0b' }}>● Fading</span>
                                <span style={{ color: '#ef4444' }}>● Review</span>
                            </div>
                        </div>
                    </Panel>
                    <Panel position="top-right">
                        <button
                            onClick={() => router.push('/')}
                            style={{
                                background: 'rgba(30,27,75,0.92)', backdropFilter: 'blur(8px)',
                                border: '1px solid #4338ca', borderRadius: 8,
                                color: '#a5b4fc', padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                            }}
                        >
                            ← Back to Notes
                        </button>
                    </Panel>
                </ReactFlow>
            </div>

            {/* Sidebar — note detail panel */}
            {selectedNote && (
                <div style={{
                    width: 320, background: 'rgba(15,12,41,0.97)', borderLeft: '1px solid #4338ca',
                    padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
                    fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h2 style={{ color: '#e0e7ff', fontSize: 18, fontWeight: 800, margin: 0, lineHeight: '1.3' }}>
                            {selectedNote.title}
                        </h2>
                        <button
                            onClick={() => setSelectedNote(null)}
                            style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 20, cursor: 'pointer', padding: 0 }}
                        >
                            ✕
                        </button>
                    </div>

                    <p style={{ color: '#c7d2fe', fontSize: 14, lineHeight: '1.6', margin: 0, flex: 1 }}>
                        {selectedNote.content || '(no content)'}
                    </p>

                    {/* Linked notes */}
                    {selectedNote.linked_notes?.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                                🔗 Linked Notes
                            </div>
                            {selectedNote.linked_notes.map(ln => (
                                <div
                                    key={ln.id}
                                    style={{
                                        background: '#1e1b4b', borderRadius: 8, padding: '8px 12px',
                                        marginBottom: 6, color: '#a5b4fc', fontSize: 13, cursor: 'pointer',
                                        border: '1px solid #312e81',
                                    }}
                                    onClick={() => {
                                        const linked = nodes.find(n => n.id === ln.id);
                                        if (linked) setSelectedNote({ id: ln.id, title: ln.title, content: '…' });
                                    }}
                                >
                                    {ln.title}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Suggested links */}
                    {selectedNote.suggested_links?.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                                ✨ Suggested Links
                            </div>
                            {selectedNote.suggested_links.map(s => (
                                <div
                                    key={s.note_id}
                                    style={{
                                        background: '#1c1700', borderRadius: 8, padding: '8px 12px',
                                        marginBottom: 6, color: '#fcd34d', fontSize: 13,
                                        border: '1px solid #92400e', display: 'flex', justifyContent: 'space-between',
                                    }}
                                >
                                    <span>{s.title}</span>
                                    <span style={{ color: '#f59e0b', fontSize: 11 }}>{Math.round(s.score * 100)}%</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={() => router.push('/')}
                        style={{
                            background: '#6366f1', color: 'white', border: 'none',
                            borderRadius: 8, padding: '10px 0', cursor: 'pointer',
                            fontSize: 14, fontWeight: 600,
                        }}
                    >
                        Open in Notes →
                    </button>
                </div>
            )}
        </div>
    );
}
