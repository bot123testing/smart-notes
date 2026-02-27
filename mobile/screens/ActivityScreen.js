/**
 * ActivityScreen.js — Premium Analytics Dashboard
 *
 * Features:
 * • Knowledge Growth Line Chart (SVG polyline)
 * • Memory Decay Circular Meter (SVG arc + animated fill)
 * • Focus Heatmap (GitHub-style grid)
 * • Most Active Notes animated ranking list
 * • Animated counters on mount
 * • Skeleton loaders while fetching
 * • Scroll-reveal animations (FadeInDown stagger)
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import Animated, {
    FadeInDown, FadeInUp,
    useSharedValue, useAnimatedStyle, useAnimatedProps,
    withTiming, withSpring, withDelay,
    useDerivedValue, interpolate,
} from 'react-native-reanimated';
import Svg, { Circle, Polyline, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import {
    TrendingUp, Eye, Edit2, FileText,
    Zap, AlertCircle, Activity, Calendar,
} from 'lucide-react-native';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { useAnimatedCounter, usePulseGlow } from '../hooks/useMotion';
import { NoteSkeleton, StatSkeleton, HeatmapSkeleton } from '../components/SkeletonLoader';
import { typography, spacing, layout } from '../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ── Animated number display ─────────────────────────────────────────────── */
function AnimCounter({ target, suffix = '', style }) {
    const val = useAnimatedCounter(target, 1200);
    const textStyle = useAnimatedStyle(() => ({}));
    // We use a derived value to pull the integer out
    const display = useDerivedValue(() => Math.round(val.value) + suffix);
    // Reanimated can't directly render text – use a regular Text but drive via state
    const [shown, setShown] = useState(0);
    React.useEffect(() => {
        const interval = setInterval(() => {
            setShown(prev => {
                const next = prev + Math.ceil((target - prev) / 8);
                if (next >= target) { clearInterval(interval); return target; }
                return next;
            });
        }, 50);
        return () => clearInterval(interval);
    }, [target]);
    return <Text style={style}>{shown}{suffix}</Text>;
}

/* ── Circular Memory Decay Meter ─────────────────────────────────────────── */
function DecayMeter({ avgDecay, theme }) {
    const SIZE = 130;
    const STROKE = 10;
    const R = (SIZE - STROKE * 2) / 2;
    const CIRC = 2 * Math.PI * R;
    const pct = Math.min(1, Math.max(0, avgDecay));
    const dashoffset = useSharedValue(CIRC);

    React.useEffect(() => {
        dashoffset.value = withTiming(CIRC * (1 - pct), { duration: 1200 });
    }, [pct]);

    const animProps = useAnimatedProps(() => ({
        strokeDashoffset: dashoffset.value,
    }));

    const color = pct >= 0.65 ? '#ef4444' : pct >= 0.3 ? '#f59e0b' : '#8b5cf6';
    const label = pct >= 0.65 ? 'Critical' : pct >= 0.3 ? 'Fading' : 'Healthy';

    return (
        <View style={styles.decayMeterWrap}>
            <Svg width={SIZE} height={SIZE}>
                <Circle
                    cx={SIZE / 2} cy={SIZE / 2} r={R}
                    stroke={theme.surfaceHighlight || '#27272A'}
                    strokeWidth={STROKE}
                    fill="none"
                />
                <AnimatedCircle
                    cx={SIZE / 2} cy={SIZE / 2} r={R}
                    stroke={color}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeDasharray={CIRC}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    animatedProps={animProps}
                />
            </Svg>
            <View style={styles.decayMeterCenter}>
                <Text style={[styles.decayMeterPct, { color }]}>{Math.round(pct * 100)}%</Text>
                <Text style={[styles.decayMeterLabel, { color: theme.textTertiary }]}>{label}</Text>
            </View>
        </View>
    );
}

/* ── SVG Line Chart ──────────────────────────────────────────────────────── */
function LineChart({ data, color = '#8b5cf6', height = 100, theme }) {
    const W = 280;
    if (!data || data.length < 2) {
        return (
            <View style={{ width: W, height, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>Not enough data</Text>
            </View>
        );
    }
    const values = data.map(d => d.count);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const pad = 8;

    const pts = data.map((d, i) => {
        const x = pad + (i / (data.length - 1)) * (W - pad * 2);
        const y = height - pad - ((d.count - min) / range) * (height - pad * 2);
        return `${x},${y}`;
    }).join(' ');

    const gradPts = `${pad},${height} ` + pts + ` ${W - pad},${height}`;

    return (
        <Svg width={W} height={height} style={{ overflow: 'visible' }}>
            {/* Area fill */}
            <Polyline
                points={gradPts}
                fill={color + '18'}
                stroke="none"
            />
            {/* Line */}
            <Polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Last point dot */}
            {data.length > 0 && (() => {
                const last = data[data.length - 1];
                const x = pad + (W - pad * 2);
                const y = height - pad - ((last.count - min) / range) * (height - pad * 2);
                return (
                    <>
                        <Circle cx={x} cy={y} r={5} fill={color} />
                        <Circle cx={x} cy={y} r={9} fill={color} fillOpacity={0.2} />
                    </>
                );
            })()}
        </Svg>
    );
}

/* ── Focus Heatmap ───────────────────────────────────────────────────────── */
function FocusHeatmap({ data, theme }) {
    // Build 7-day × N-week grid from activity data
    const CELL = 24, GAP = 3;
    const today = new Date();
    const days = 35; // 5 weeks
    const cells = [];

    const dateMap = {};
    (data || []).forEach(d => { dateMap[d.date] = d.count; });

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = dateMap[key] || 0;
        const intensity = count === 0 ? 0 : Math.min(1, count / 5);
        cells.push({ key, count, intensity, dayOfWeek: d.getDay() });
    }

    const cols = Math.ceil(days / 7);
    const totalW = cols * (CELL + GAP);
    const totalH = 7 * (CELL + GAP);

    return (
        <Svg width={totalW} height={totalH}>
            {cells.map((cell, i) => {
                const col = Math.floor(i / 7);
                const row = cell.dayOfWeek;
                const x = col * (CELL + GAP);
                const y = row * (CELL + GAP);
                const fill = cell.intensity === 0
                    ? theme.border || '#2D2D35'
                    : `rgba(139,92,246,${0.2 + cell.intensity * 0.8})`;
                return (
                    <Rect
                        key={cell.key}
                        x={x} y={y}
                        width={CELL} height={CELL}
                        rx={4} ry={4}
                        fill={fill}
                    />
                );
            })}
        </Svg>
    );
}

/* ── Section wrapper with scroll-reveal ─────────────────────────────────── */
function Section({ children, delay = 0 }) {
    return (
        <Animated.View entering={FadeInDown.delay(delay).springify()}>
            {children}
        </Animated.View>
    );
}

/* ── Main Screen ─────────────────────────────────────────────────────────── */
const ActivityScreen = ({ navigation }) => {
    const { theme, isDark } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [error, setError] = useState(null);

    const { glowStyle: criticalGlow } = usePulseGlow(900);

    const fetchAll = async () => {
        setError(null);
        try {
            const [statsRes, timelineRes] = await Promise.all([
                api.get('/activity/stats'),
                api.get('/activity/timeline'),
            ]);
            setStats(statsRes.data);
            setTimeline(timelineRes.data.timeline || []);
        } catch (e) {
            console.error('Activity fetch error:', e);
            setError('Could not load activity data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { setLoading(true); fetchAll(); }, []));
    const onRefresh = () => { setRefreshing(true); fetchAll(); };

    // Derived stats
    const totalNotes = stats?.notes?.length ?? 0;
    const totalEvents = stats?.total_events ?? 0;
    const totalViews = stats?.notes?.reduce((s, n) => s + (n.view_count || 0), 0) ?? 0;
    const totalEdits = stats?.notes?.reduce((s, n) => s + (n.edit_count || 0), 0) ?? 0;
    const avgDecay = useMemo(() => {
        const notes = stats?.notes ?? [];
        if (!notes.length) return 0;
        return notes.reduce((s, n) => s + (n.memory_decay || 0), 0) / notes.length;
    }, [stats]);

    const topNotes = useMemo(() =>
        [...(stats?.notes ?? [])].sort((a, b) => b.total - a.total).slice(0, 6),
        [stats]);

    const criticalNotes = useMemo(() =>
        (stats?.notes ?? []).filter(n => (n.memory_decay || 0) >= 0.6).length,
        [stats]);

    const heatData = useMemo(() => timeline.map(t => ({
        date: t.date,
        count: t.count - (timeline.find((p, i) => timeline[i - 1]?.date === t.date)?.count || 0),
    })), [timeline]);

    return (
        <ScrollView
            style={[styles.root, { backgroundColor: theme.background }]}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
            }
        >
            {/* Gradient-like header banner */}
            <Animated.View
                entering={FadeInUp.delay(0).springify()}
                style={[styles.heroBanner, { backgroundColor: isDark ? '#120f1e' : '#f5f0ff' }]}
            >
                <View style={styles.heroContent}>
                    <Text style={[styles.heroTitle, { color: theme.text }]}>Analytics</Text>
                    <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
                        Your knowledge at a glance
                    </Text>
                </View>
                <Animated.View style={[styles.heroBadge, criticalNotes > 0 ? criticalGlow : {}]}>
                    <Activity size={24} color="#8b5cf6" />
                </Animated.View>
            </Animated.View>

            {error && (
                <View style={[styles.errorBanner, { borderColor: theme.danger, backgroundColor: theme.danger + '15' }]}>
                    <AlertCircle size={16} color={theme.danger} />
                    <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
                </View>
            )}

            {/* ── Stat cards ─────────────────────────────────────────────── */}
            <Section delay={60}>
                <Text style={[styles.sectionTitle, { color: theme.text, paddingHorizontal: spacing.xl }]}>Overview</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 10 }}>
                    {loading
                        ? [0, 1, 2, 3].map(i => <StatSkeleton key={i} />)
                        : [
                            { icon: FileText, label: 'Notes', val: totalNotes, color: '#8b5cf6' },
                            { icon: TrendingUp, label: 'Events', val: totalEvents, color: '#10b981' },
                            { icon: Eye, label: 'Views', val: totalViews, color: '#0ea5e9' },
                            { icon: Edit2, label: 'Edits', val: totalEdits, color: '#f59e0b' },
                        ].map(({ icon: Icon, label, val, color }) => (
                            <View key={label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
                                    <Icon size={18} color={color} />
                                </View>
                                <AnimCounter target={val} style={[styles.statValue, { color: theme.text }]} />
                                <Text style={[styles.statLabel, { color: theme.textTertiary }]}>{label}</Text>
                            </View>
                        ))
                    }
                </ScrollView>
            </Section>

            {/* ── Memory Decay + Knowledge Growth (side by side) ─────────── */}
            <Section delay={120}>
                <View style={styles.doubleRow}>
                    {/* Decay meter */}
                    <View style={[styles.halfCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Memory Decay</Text>
                        {loading
                            ? <StatSkeleton />
                            : <DecayMeter avgDecay={avgDecay} theme={theme} />
                        }
                        {!loading && criticalNotes > 0 && (
                            <Animated.View style={[styles.criticalBadge, { backgroundColor: '#ef444415', borderColor: '#ef4444' }, criticalGlow]}>
                                <Zap size={11} color="#ef4444" />
                                <Text style={styles.criticalBadgeText}>{criticalNotes} critical</Text>
                            </Animated.View>
                        )}
                    </View>

                    {/* Connections summary */}
                    <View style={[styles.halfCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Network</Text>
                        {loading ? <StatSkeleton /> : (
                            <View style={{ gap: 12, marginTop: 8 }}>
                                {[
                                    { label: 'Avg links', val: totalNotes > 0 ? ((stats?.notes || []).reduce((s, n) => s + (n.link_count || 0), 0) / totalNotes).toFixed(1) : '0', color: '#8b5cf6' },
                                    { label: 'Total events', val: totalEvents, color: '#10b981' },
                                    { label: 'Active notes', val: topNotes.length, color: '#0ea5e9' },
                                ].map(({ label, val, color }) => (
                                    <View key={label} style={styles.networkRow}>
                                        <View style={[styles.networkDot, { backgroundColor: color }]} />
                                        <Text style={[styles.networkLabel, { color: theme.textSecondary }]}>{label}</Text>
                                        <Text style={[styles.networkVal, { color: theme.text }]}>{val}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>
            </Section>

            {/* ── Knowledge growth line chart ─────────────────────────────── */}
            <Section delay={200}>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, styles.cardPad]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Knowledge Growth</Text>
                    <Text style={[styles.cardSub, { color: theme.textTertiary }]}>Cumulative notes created over time</Text>
                    <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
                        {loading
                            ? <HeatmapSkeleton />
                            : <LineChart data={timeline} color="#8b5cf6" height={90} theme={theme} />
                        }
                    </View>
                    {!loading && timeline.length > 0 && (
                        <View style={styles.chartLegendRow}>
                            <Text style={[styles.chartLegendLabel, { color: theme.textTertiary }]}>
                                {timeline[0]?.date ?? '—'}
                            </Text>
                            <Text style={[styles.chartLegendLabel, { color: theme.textTertiary }]}>
                                {timeline[timeline.length - 1]?.date ?? '—'}
                            </Text>
                        </View>
                    )}
                </View>
            </Section>

            {/* ── Focus Heatmap ───────────────────────────────────────────── */}
            <Section delay={280}>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, styles.cardPad]}>
                    <View style={styles.cardHeaderRow}>
                        <View>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>Focus Calendar</Text>
                            <Text style={[styles.cardSub, { color: theme.textTertiary }]}>Daily activity last 5 weeks</Text>
                        </View>
                        <Calendar size={18} color={theme.textTertiary} />
                    </View>
                    <View style={{ marginTop: 16 }}>
                        {loading
                            ? <HeatmapSkeleton />
                            : <FocusHeatmap data={heatData} theme={theme} />
                        }
                    </View>
                    <View style={styles.heatmapLegend}>
                        <Text style={[styles.heatmapLegendLabel, { color: theme.textTertiary }]}>Less</Text>
                        {[0.1, 0.35, 0.6, 0.85, 1].map(i => (
                            <View key={i} style={[styles.heatCell, { backgroundColor: `rgba(139,92,246,${i})` }]} />
                        ))}
                        <Text style={[styles.heatmapLegendLabel, { color: theme.textTertiary }]}>More</Text>
                    </View>
                </View>
            </Section>

            {/* ── Most active notes (ranking list) ───────────────────────── */}
            <Section delay={360}>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, styles.cardPad]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Most Active Notes</Text>
                    <Text style={[styles.cardSub, { color: theme.textTertiary }]}>Ranked by total interactions</Text>
                    <View style={{ marginTop: 16, gap: 8 }}>
                        {loading
                            ? [0, 1, 2].map(i => <NoteSkeleton key={i} />)
                            : topNotes.length === 0
                                ? <Text style={[styles.emptyHint, { color: theme.textTertiary }]}>No activity data yet.</Text>
                                : topNotes.map((note, index) => {
                                    const decay = note.memory_decay || 0;
                                    const color = decay >= 0.65 ? '#ef4444' : decay >= 0.3 ? '#f59e0b' : '#8b5cf6';
                                    const barW = Math.max(4, (note.total / (topNotes[0]?.total || 1)) * 100);

                                    return (
                                        <Animated.View
                                            key={note.note_id}
                                            entering={FadeInDown.delay(360 + index * 60).springify()}
                                        >
                                            <TouchableOpacity
                                                style={[styles.noteRankRow, { backgroundColor: theme.surfaceHighlight || '#27272A', borderColor: theme.border }]}
                                                activeOpacity={0.75}
                                                onPress={() => navigation.navigate('HomeTab')}
                                            >
                                                <View style={[styles.rankBadge, { backgroundColor: color + '22' }]}>
                                                    <Text style={[styles.rankText, { color }]}>#{index + 1}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.noteRankTitle, { color: theme.text }]} numberOfLines={1}>
                                                        {note.note_title}
                                                    </Text>
                                                    {/* Mini progress bar */}
                                                    <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
                                                        <View style={[styles.progressFill, { width: `${barW}%`, backgroundColor: color }]} />
                                                    </View>
                                                </View>
                                                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                                                    <Text style={[styles.rankTotalVal, { color: theme.text }]}>{note.total}</Text>
                                                    <Text style={[styles.rankTotalLabel, { color: theme.textTertiary }]}>events</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })
                        }
                    </View>
                </View>
            </Section>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },

    heroBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: spacing.lg,
    },
    heroContent: { flex: 1 },
    heroTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    heroSub: { fontSize: 14, marginTop: 4 },
    heroBadge: {
        width: 50, height: 50,
        borderRadius: 16,
        backgroundColor: 'rgba(139,92,246,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },

    errorBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        margin: spacing.xl, padding: 14,
        borderRadius: 12, borderWidth: 1,
    },
    errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, marginTop: spacing.xl },

    // Stat cards (horizontal scroll)
    statCard: {
        width: 110,
        padding: 16,
        borderRadius: layout.radius,
        borderWidth: 1,
        gap: 6,
        alignItems: 'flex-start',
    },
    statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    statLabel: { fontSize: 11, fontWeight: '600' },

    // Double row (decay + network)
    doubleRow: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: spacing.xl,
        marginTop: spacing.lg,
        marginBottom: 12,
    },
    halfCard: {
        flex: 1,
        borderRadius: layout.radius,
        borderWidth: 1,
        padding: 16,
        alignItems: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '800', alignSelf: 'flex-start' },
    cardSub: { fontSize: 12, marginTop: 3, alignSelf: 'flex-start' },

    // Decay meter
    decayMeterWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    decayMeterCenter: { position: 'absolute', alignItems: 'center' },
    decayMeterPct: { fontSize: 22, fontWeight: '900' },
    decayMeterLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    criticalBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        marginTop: 10,
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 10, borderWidth: 1,
    },
    criticalBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },

    // Network card
    networkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    networkDot: { width: 7, height: 7, borderRadius: 4 },
    networkLabel: { flex: 1, fontSize: 12, fontWeight: '500' },
    networkVal: { fontSize: 14, fontWeight: '800' },

    // Shared card
    card: {
        marginHorizontal: spacing.xl,
        marginBottom: 16,
        borderRadius: layout.radius,
        borderWidth: 1,
    },
    cardPad: { padding: 20 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },

    // Chart legend
    chartLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    chartLegendLabel: { fontSize: 11 },

    // Heatmap
    heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
    heatCell: { width: 14, height: 14, borderRadius: 3 },
    heatmapLegendLabel: { fontSize: 10, fontWeight: '600' },

    // Note ranking
    noteRankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    rankBadge: {
        width: 38, height: 38,
        borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    rankText: { fontSize: 13, fontWeight: '900' },
    noteRankTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    progressBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },
    rankTotalVal: { fontSize: 16, fontWeight: '900' },
    rankTotalLabel: { fontSize: 10, fontWeight: '600' },
    emptyHint: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});

export default ActivityScreen;
