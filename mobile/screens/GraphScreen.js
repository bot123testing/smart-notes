/**
 * GraphScreen.js — Premium knowledge graph with:
 * • Reanimated3 pinch-to-zoom + pan (GestureDetector)
 * • Force-directed spring layout (tick-based simulation)
 * • react-native-svg neon edges with stroke-dash draw-in
 * • Tap node → select + highlight neighbourhood
 * • Long press → BlurView preview modal
 * • Staggered node fade-in
 */
import React, {
    useState, useCallback, useRef, useEffect, useMemo
} from 'react';
import {
    View, Text, StyleSheet, Dimensions,
    TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle, useAnimatedProps,
    withSpring, withTiming, withDelay, runOnUI, runOnJS,
    cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
    G, Circle, Line, Text as SvgText,
    Defs, RadialGradient, Stop, Filter,
    FeGaussianBlur, FeMerge, FeMergeNode,
} from 'react-native-svg';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { X, Link, Clock } from 'lucide-react-native';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';

const { width: W, height: H } = Dimensions.get('window');
const CANVAS_SIZE = 3000; // logical canvas — we pan inside
const CENTER = CANVAS_SIZE / 2;

// ── Force layout constants ────────────────────────────────────────────────
const REPULSION = 6000;
const ATTRACTION = 0.06;
const LINK_DIST = 160;
const DAMPING = 0.82;
const TICK_LIMIT = 120;

// ── Helpers ───────────────────────────────────────────────────────────────
function decayTint(decay) {
    if (decay >= 0.65) return '#ef4444';
    if (decay >= 0.30) return '#f59e0b';
    return '#8b5cf6';
}

function initPositions(nodes) {
    return nodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
        const r = 220 + Math.random() * 120;
        return {
            ...n,
            x: CENTER + r * Math.cos(angle),
            y: CENTER + r * Math.sin(angle),
            vx: 0,
            vy: 0,
        };
    });
}

function runTick(nodes, adj) {
    const next = nodes.map(n => ({ ...n }));
    for (let i = 0; i < next.length; i++) {
        let fx = 0, fy = 0;
        for (let j = 0; j < next.length; j++) {
            if (i === j) continue;
            const dx = next[i].x - next[j].x;
            const dy = next[i].y - next[j].y;
            const dist2 = dx * dx + dy * dy + 1;
            const force = REPULSION / dist2;
            fx += dx * force;
            fy += dy * force;
        }
        // attraction along links
        const neighbours = adj[next[i].id] || [];
        for (const nid of neighbours) {
            const nb = next.find(n => n.id === nid);
            if (!nb) continue;
            const dx = nb.x - next[i].x;
            const dy = nb.y - next[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 1;
            const stretch = dist - LINK_DIST;
            fx += dx / dist * stretch * ATTRACTION;
            fy += dy / dist * stretch * ATTRACTION;
        }
        next[i].vx = (next[i].vx + fx * 0.016) * DAMPING;
        next[i].vy = (next[i].vy + fy * 0.016) * DAMPING;
    }
    for (const n of next) {
        n.x = Math.max(80, Math.min(CANVAS_SIZE - 80, n.x + n.vx));
        n.y = Math.max(80, Math.min(CANVAS_SIZE - 80, n.y + n.vy));
    }
    return next;
}

// ── Edge (neon line) ──────────────────────────────────────────────────────
function GraphEdge({ x1, y1, x2, y2, active, color = '#8b5cf6', opacity = 0.35 }) {
    const strokeW = active ? 2.5 : 1;
    const strokeOpacity = active ? 0.85 : opacity;
    return (
        <Line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color}
            strokeWidth={strokeW}
            strokeOpacity={strokeOpacity}
            strokeLinecap="round"
        />
    );
}

// ── Node bubble ───────────────────────────────────────────────────────────
// NOTE: No onPress/onLongPress here — SVG touch events conflict with
// GestureDetector. All interaction is handled via coordinate hit-testing.
function GraphNode({ node, isSelected, isHighlighted, dimmed }) {
    const { theme } = useTheme();
    const nodeColor = decayTint(node.memory_decay || 0);
    const r = isSelected ? 36 : 28;
    const opacity = dimmed ? 0.2 : 1;

    return (
        <G opacity={opacity}>
            {isSelected && (
                <Circle cx={node.x} cy={node.y} r={r + 14} fill={nodeColor} fillOpacity={0.12} />
            )}
            <Circle cx={node.x + 2} cy={node.y + 3} r={r} fill="#000" fillOpacity={0.3} />
            <Circle
                cx={node.x} cy={node.y} r={r}
                fill={isSelected ? nodeColor : '#1e1b2e'}
                stroke={nodeColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <SvgText
                x={node.x} y={node.y + 4}
                textAnchor="middle"
                fill={isSelected ? '#fff' : '#e2e8f0'}
                fontSize={isSelected ? 11 : 9}
                fontWeight={isSelected ? '700' : '500'}
            >
                {(node.title || 'Note').slice(0, 10)}{(node.title || '').length > 10 ? '…' : ''}
            </SvgText>
            {node.link_count > 0 && (
                <>
                    <Circle cx={node.x + r - 4} cy={node.y - r + 4} r={9} fill={nodeColor} />
                    <SvgText
                        x={node.x + r - 4} y={node.y - r + 8}
                        textAnchor="middle"
                        fill="#fff" fontSize={8} fontWeight="800"
                    >
                        {node.link_count}
                    </SvgText>
                </>
            )}
        </G>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function GraphScreen({ navigation }) {
    const { theme, isDark } = useTheme();

    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [adj, setAdj] = useState({});
    const [selected, setSelected] = useState(null);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [simDone, setSimDone] = useState(false);
    const [error, setError] = useState(null);

    // ── Transform state ──────────────────────────────────────────────────
    // With the compensated transform below, tx/ty semantically mean:
    //   "screen position of the canvas (0,0) corner" (top-left anchor).
    // This makes screen↔canvas math simple: canvas_x = (screen_x - tx) / s
    const INIT_SCALE = 0.45;
    const translateX = useSharedValue(W / 2 - CENTER * INIT_SCALE);
    const translateY = useSharedValue(H / 2 - CENTER * INIT_SCALE);
    const scale = useSharedValue(INIT_SCALE);

    const savedX = useSharedValue(0);
    const savedY = useSharedValue(0);
    const pinchStartScale = useSharedValue(INIT_SCALE);
    const pinchStartX = useSharedValue(0);
    const pinchStartY = useSharedValue(0);

    // ── Fetch data ──────────────────────────────────────────────────────────
    const buildAdj = useCallback((edgeList, nodeList) => {
        const a = {};
        nodeList.forEach(n => { a[n.id] = []; });
        edgeList.forEach(e => {
            a[e.source]?.push(e.target);
            a[e.target]?.push(e.source);
        });
        return a;
    }, []);

    const fetchGraph = useCallback(async () => {
        setLoading(true);
        setSimDone(false);
        setSelected(null);
        setError(null);
        try {
            const res = await api.get('/notes/graph');
            const { nodes: rawNodes, edges: rawEdges } = res.data;
            const positioned = initPositions(rawNodes);
            const adjacency = buildAdj(rawEdges, positioned);
            setEdges(rawEdges);
            setAdj(adjacency);

            let current = positioned;
            for (let t = 0; t < TICK_LIMIT; t++) {
                current = runTick(current, adjacency);
            }
            setNodes(current);
            setSimDone(true);
        } catch (e) {
            console.error('Graph error:', e);
            setError(e?.response?.status === 401 ? 'Please log in to view the graph.' : 'Failed to load graph.');
        } finally {
            setLoading(false);
        }
    }, [buildAdj]);

    useFocusEffect(useCallback(() => { fetchGraph(); }, [fetchGraph]));

    // ── Gesture helpers (run on JS thread) ──────────────────────────────────
    // Convert container-space (sx, sy) → canvas space using current transform.
    // With compensated transform: canvas_x = (sx - tx) / s
    const findNodeAtPoint = useCallback((sx, sy) => {
        const s = scale.value;
        const tx = translateX.value;
        const ty = translateY.value;
        const cx = (sx - tx) / s;
        const cy = (sy - ty) / s;
        const HIT = 40; // hit radius in canvas pixels
        return nodes.find(n => {
            const dx = n.x - cx, dy = n.y - cy;
            return dx * dx + dy * dy < HIT * HIT;
        }) || null;
    }, [nodes, scale, translateX, translateY]);

    const onTapJS = useCallback((sx, sy) => {
        const node = findNodeAtPoint(sx, sy);
        if (node) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelected(prev => prev?.id === node.id ? null : node);
            setPreview(null);
        } else {
            setSelected(null);
        }
    }, [findNodeAtPoint]);

    const onLongPressJS = useCallback((sx, sy) => {
        const node = findNodeAtPoint(sx, sy);
        if (node) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setPreview(node);
        }
    }, [findNodeAtPoint]);

    // ── Gestures ────────────────────────────────────────────────────────────
    const panGesture = Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
            savedX.value = translateX.value;
            savedY.value = translateY.value;
        })
        .onUpdate((e) => {
            translateX.value = savedX.value + e.translationX;
            translateY.value = savedY.value + e.translationY;
        })
        .onEnd(() => {
            const s = scale.value;
            const scaledW = CANVAS_SIZE * s;
            const scaledH = CANVAS_SIZE * s;
            const minX = W - scaledW;
            const minY = H - scaledH;
            if (translateX.value > 0) translateX.value = withSpring(0, { damping: 20 });
            else if (translateX.value < minX) translateX.value = withSpring(minX, { damping: 20 });
            if (translateY.value > 0) translateY.value = withSpring(0, { damping: 20 });
            else if (translateY.value < minY) translateY.value = withSpring(minY, { damping: 20 });
        });

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            pinchStartScale.value = scale.value;
            pinchStartX.value = translateX.value;
            pinchStartY.value = translateY.value;
        })
        .onUpdate((e) => {
            const newScale = Math.max(0.15, Math.min(3, pinchStartScale.value * e.scale));
            const ratio = newScale / pinchStartScale.value;
            scale.value = newScale;
            // Focal point stays fixed: screen_x = tx + cx*s, so newTx = fx - (fx-startTx)*ratio
            translateX.value = e.focalX - (e.focalX - pinchStartX.value) * ratio;
            translateY.value = e.focalY - (e.focalY - pinchStartY.value) * ratio;
        })
        .onEnd(() => {
            const s = scale.value;
            const minX = W - CANVAS_SIZE * s;
            const minY = H - CANVAS_SIZE * s;
            if (translateX.value > 0) translateX.value = withSpring(0, { damping: 20 });
            else if (translateX.value < minX) translateX.value = withSpring(minX, { damping: 20 });
            if (translateY.value > 0) translateY.value = withSpring(0, { damping: 20 });
            else if (translateY.value < minY) translateY.value = withSpring(minY, { damping: 20 });
        });

    const tapGesture = Gesture.Tap()
        .maxDuration(250)
        .onEnd((e, success) => { if (success) runOnJS(onTapJS)(e.x, e.y); });

    const longPressGesture = Gesture.LongPress()
        .minDuration(500)
        .onStart((e) => { runOnJS(onLongPressJS)(e.x, e.y); });

    const composed = Gesture.Simultaneous(
        panGesture,
        pinchGesture,
        Gesture.Exclusive(longPressGesture, tapGesture)
    );

    // Compensated transform: moves scale anchor from view center → top-left corner.
    // With this: screen_pos = tx + canvas_pos * s  (simple, predictable)
    const canvasStyle = useAnimatedStyle(() => {
        const s = scale.value;
        const C = CANVAS_SIZE / 2;
        return {
            transform: [
                { translateX: translateX.value - C * (1 - s) },
                { translateY: translateY.value - C * (1 - s) },
                { scale: s },
            ],
        };
    });

    // ── Node interaction ────────────────────────────────────────────────────
    const handleNodeTap = useCallback((node) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelected(prev => prev?.id === node.id ? null : node);
        setPreview(null);
    }, []);

    const handleNodeLongPress = useCallback((node) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPreview(node);
    }, []);

    // (handleNodeTap/LongPress kept for use by info panel buttons)

    const neighbours = useMemo(() => {
        if (!selected) return new Set();
        return new Set(adj[selected.id] || []);
    }, [selected, adj]);

    const stats = useMemo(() => ({
        total: nodes.length,
        links: edges.length,
        critical: nodes.filter(n => (n.memory_decay || 0) >= 0.65).length,
    }), [nodes, edges]);

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={[styles.root, { backgroundColor: isDark ? '#080810' : '#f0f0f5' }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: isDark ? 'rgba(14,14,17,0.96)' : 'rgba(240,240,245,0.96)', borderBottomColor: theme.border }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Knowledge Graph</Text>
                    {!loading && !error && (
                        <Text style={[styles.headerSub, { color: theme.textTertiary }]}>
                            {stats.total} notes · {stats.links} connections{stats.critical > 0 ? ` · ${stats.critical} critical` : ''}
                        </Text>
                    )}
                </View>
                <TouchableOpacity
                    onPress={fetchGraph}
                    style={[styles.refreshBtn, { backgroundColor: theme.surfaceHighlight || '#27272A', borderColor: theme.border }]}
                >
                    <Text style={{ fontSize: 16 }}>↺</Text>
                </TouchableOpacity>
            </View>

            {/* Legend chips */}
            {!loading && !error && nodes.length > 0 && (
                <View style={[styles.legend, { backgroundColor: isDark ? 'rgba(14,14,17,0.9)' : 'rgba(240,240,245,0.9)' }]}>
                    {[
                        { label: 'Fresh', color: '#8b5cf6' },
                        { label: 'Fading', color: '#f59e0b' },
                        { label: 'Critical', color: '#ef4444' },
                    ].map(({ label, color }) => (
                        <View key={label} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: color }]} />
                            <Text style={[styles.legendLabel, { color: theme.textTertiary }]}>{label}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Canvas area — flex:1 fills space below header/legend */}
            <View style={styles.canvasContainer}>
                {loading ? (
                    <View style={styles.centered}>
                        <View style={[styles.loadingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <Text style={{ fontSize: 36, marginBottom: 16 }}>🧠</Text>
                            <Text style={[styles.loadingText, { color: theme.text }]}>Building your graph…</Text>
                            <Text style={[styles.loadingSub, { color: theme.textTertiary }]}>Running force simulation</Text>
                        </View>
                    </View>
                ) : error ? (
                    <View style={styles.centered}>
                        <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{error}</Text>
                        <TouchableOpacity
                            onPress={fetchGraph}
                            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : nodes.length === 0 ? (
                    <View style={styles.centered}>
                        <Text style={{ fontSize: 40, marginBottom: 12 }}>🕸️</Text>
                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No notes to visualise yet.</Text>
                        <Text style={[styles.emptySub, { color: theme.textTertiary }]}>Add some notes and link them to see the graph.</Text>
                    </View>
                ) : (
                    <GestureDetector gesture={composed}>
                        <Animated.View style={[styles.canvasInner, canvasStyle]}>
                            <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
                                <Defs>
                                    <Filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                        <FeGaussianBlur stdDeviation="4" result="blur" />
                                        <FeMerge>
                                            <FeMergeNode in="blur" />
                                            <FeMergeNode in="SourceGraphic" />
                                        </FeMerge>
                                    </Filter>
                                </Defs>

                                {/* Edges */}
                                {edges.map((edge, i) => {
                                    const src = nodes.find(n => n.id === edge.source);
                                    const tgt = nodes.find(n => n.id === edge.target);
                                    if (!src || !tgt) return null;
                                    const isActive = selected
                                        ? (selected.id === edge.source || selected.id === edge.target)
                                        : false;
                                    return (
                                        <GraphEdge
                                            key={`e_${i}`}
                                            x1={src.x} y1={src.y}
                                            x2={tgt.x} y2={tgt.y}
                                            active={isActive}
                                            color={isActive ? '#a78bfa' : '#4c1d95'}
                                            opacity={selected && !isActive ? 0.08 : 0.32}
                                        />
                                    );
                                })}

                                {/* Nodes */}
                                {nodes.map((node, index) => {
                                    const isSelected = selected?.id === node.id;
                                    const isHighlighted = neighbours.has(node.id);
                                    const dimmed = selected && !isSelected && !isHighlighted;
                                    return (
                                        <GraphNode
                                            key={node.id}
                                            node={node}
                                            index={index}
                                            isSelected={isSelected}
                                            isHighlighted={isHighlighted}
                                            dimmed={dimmed}
                                            onTap={() => handleNodeTap(node)}
                                            onLongPress={() => handleNodeLongPress(node)}
                                            visible={simDone}
                                        />
                                    );
                                })}
                            </Svg>
                        </Animated.View>
                    </GestureDetector>
                )}

                {/* Selected node info panel — overlays the canvas */}
                {selected && (
                    <View style={[styles.infoPanel, { backgroundColor: isDark ? 'rgba(20,18,32,0.97)' : 'rgba(255,255,255,0.97)', borderColor: theme.border }]}>
                        <View style={styles.infoPanelHeader}>
                            <View style={[styles.decayDot, { backgroundColor: decayTint(selected.memory_decay || 0) }]} />
                            <Text style={[styles.infoPanelTitle, { color: theme.text }]} numberOfLines={2}>
                                {selected.title}
                            </Text>
                            <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                                <X size={16} color={theme.textTertiary} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.infoPanelRow}>
                            <View style={styles.infoPanelStat}>
                                <Link size={12} color={theme.textTertiary} />
                                <Text style={[styles.infoPanelStatVal, { color: theme.textSecondary }]}>
                                    {selected.link_count || 0} links
                                </Text>
                            </View>
                            <View style={styles.infoPanelStat}>
                                <Clock size={12} color={theme.textTertiary} />
                                <Text style={[styles.infoPanelStatVal, { color: theme.textSecondary }]}>
                                    Decay: {Math.round((selected.memory_decay || 0) * 100)}%
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.openNoteBtn, { backgroundColor: decayTint(selected.memory_decay || 0) + '22', borderColor: decayTint(selected.memory_decay || 0) }]}
                                onPress={() => {
                                    setSelected(null);
                                    navigation.navigate('EditNote', { note: selected });
                                }}
                            >
                                <Text style={[styles.openNoteBtnLabel, { color: decayTint(selected.memory_decay || 0) }]}>Open Note →</Text>
                            </TouchableOpacity>
                        </View>
                        {neighbours.size > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                                {[...neighbours].map(nid => {
                                    const nb = nodes.find(n => n.id === nid);
                                    if (!nb) return null;
                                    return (
                                        <TouchableOpacity
                                            key={nid}
                                            onPress={() => handleNodeTap(nb)}
                                            style={[styles.neighbourChip, { backgroundColor: theme.surfaceHighlight || '#27272A', borderColor: theme.border }]}
                                        >
                                            <Text style={[styles.neighbourChipText, { color: theme.textSecondary }]}>{nb.title?.slice(0, 18) || 'Note'}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                )}

                {/* Long-press preview modal */}
                {preview && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
                            <TouchableOpacity
                                style={styles.previewBackdrop}
                                activeOpacity={1}
                                onPress={() => setPreview(null)}
                            >
                                <View style={[styles.previewCard, { backgroundColor: isDark ? '#1a1826' : '#fff', borderColor: theme.border }]}>
                                    <View style={[styles.previewAccent, { backgroundColor: decayTint(preview.memory_decay || 0) }]} />
                                    <Text style={[styles.previewTitle, { color: theme.text }]}>{preview.title}</Text>
                                    {preview.content ? (
                                        <Text style={[styles.previewContent, { color: theme.textSecondary }]} numberOfLines={5}>
                                            {preview.content}
                                        </Text>
                                    ) : (
                                        <Text style={[styles.previewContent, { color: theme.textTertiary }]}>No content.</Text>
                                    )}
                                    <View style={styles.previewFooter}>
                                        <View style={styles.previewStat}>
                                            <Link size={13} color={theme.textTertiary} />
                                            <Text style={[styles.previewStatText, { color: theme.textTertiary }]}>{preview.link_count || 0} connections</Text>
                                        </View>
                                        <View style={[styles.decayBadge, { backgroundColor: decayTint(preview.memory_decay || 0) + '22', borderColor: decayTint(preview.memory_decay || 0) + '55' }]}>
                                            <Text style={[styles.decayBadgeText, { color: decayTint(preview.memory_decay || 0) }]}>
                                                {Math.round((preview.memory_decay || 0) * 100)}% decay
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                                        <TouchableOpacity
                                            style={[styles.previewBtn, { backgroundColor: theme.surfaceHighlight || '#27272A', flex: 1 }]}
                                            onPress={() => setPreview(null)}
                                        >
                                            <Text style={[styles.previewBtnText, { color: theme.textSecondary }]}>Dismiss</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.previewBtn, { backgroundColor: decayTint(preview.memory_decay || 0), flex: 1 }]}
                                            onPress={() => {
                                                setPreview(null);
                                                navigation.navigate('EditNote', { note: preview });
                                            }}
                                        >
                                            <Text style={[styles.previewBtnText, { color: '#fff' }]}>Open Note</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                )}
            </View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 0 : 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        zIndex: 10,
    },
    headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
    headerSub: { fontSize: 12, marginTop: 2 },
    refreshBtn: {
        width: 36, height: 36, borderRadius: 10,
        borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },

    legend: {
        flexDirection: 'row',
        gap: 14,
        paddingHorizontal: 20,
        paddingVertical: 8,
        zIndex: 10,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { fontSize: 11, fontWeight: '600' },

    // Canvas container: fills remaining screen space, clips the 3000x3000 SVG
    canvasContainer: { flex: 1 },
    canvasInner: { width: CANVAS_SIZE, height: CANVAS_SIZE },

    loadingCard: {
        padding: 32,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        gap: 4,
    },
    loadingText: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
    loadingSub: { fontSize: 13, marginTop: 4 },
    emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
    emptySub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
    retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },

    // Selected node info panel
    infoPanel: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderTopWidth: 1,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 36 : 20,
        zIndex: 20,
    },
    infoPanelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
    decayDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
    infoPanelTitle: { flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 22 },
    closeBtn: { padding: 4 },
    infoPanelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    infoPanelStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    infoPanelStatVal: { fontSize: 13, fontWeight: '500' },
    openNoteBtn: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 20, borderWidth: 1, marginLeft: 'auto',
    },
    openNoteBtnLabel: { fontSize: 13, fontWeight: '700' },
    neighbourChip: {
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, borderWidth: 1, marginRight: 8,
    },
    neighbourChipText: { fontSize: 12, fontWeight: '600' },

    // Preview modal
    previewBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    previewCard: {
        width: '100%',
        borderRadius: 20, borderWidth: 1,
        padding: 24,
        overflow: 'hidden',
    },
    previewAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    previewTitle: { fontSize: 20, fontWeight: '800', marginTop: 8, marginBottom: 12, letterSpacing: -0.3 },
    previewContent: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
    previewFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    previewStatText: { fontSize: 13, fontWeight: '600' },
    decayBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    decayBadgeText: { fontSize: 12, fontWeight: '700' },
    previewBtn: { padding: 12, borderRadius: 14, alignItems: 'center' },
    previewBtnText: { fontSize: 14, fontWeight: '700' },
});
