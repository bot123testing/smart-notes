/**
 * SkeletonLoader.js — Shimmer skeleton placeholders.
 * Uses Reanimated shared values for 60fps shimmer.
 */
import React, { useEffect, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle,
    withRepeat, withTiming, interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';

/* ── Base skeleton element ─────────────────────────────────────────────── */
export function SkeletonBox({ width, height, radius = 8, style }) {
    const { theme } = useTheme();
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            progress.value,
            [0, 1],
            [theme.surfaceHighlight || '#27272A', theme.border || '#3d3d47'],
        ),
    }));

    return (
        <Animated.View
            style={[{ width, height, borderRadius: radius }, animStyle, style]}
        />
    );
}

/* ── Note card skeleton ────────────────────────────────────────────────── */
export function NoteSkeleton() {
    const { theme } = useTheme();
    return (
        <View style={[styles.noteCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SkeletonBox width="65%" height={16} radius={6} style={{ marginBottom: 10 }} />
            <SkeletonBox width="100%" height={11} radius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width="80%" height={11} radius={4} style={{ marginBottom: 14 }} />
            <View style={styles.noteFooterRow}>
                <SkeletonBox width={60} height={20} radius={10} />
                <SkeletonBox width={44} height={20} radius={10} />
            </View>
        </View>
    );
}

/* ── Stat card skeleton ────────────────────────────────────────────────── */
export function StatSkeleton() {
    const { theme } = useTheme();
    return (
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SkeletonBox width={32} height={32} radius={10} style={{ marginBottom: 10 }} />
            <SkeletonBox width="50%" height={20} radius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width="70%" height={12} radius={4} />
        </View>
    );
}

/* ── Heatmap skeleton ──────────────────────────────────────────────────── */
export function HeatmapSkeleton() {
    return (
        <View style={styles.heatmapGrid}>
            {Array.from({ length: 35 }).map((_, i) => (
                <SkeletonBox key={i} width={28} height={28} radius={5} style={{ margin: 2 }} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    noteCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
        marginBottom: 10,
    },
    noteFooterRow: {
        flexDirection: 'row',
        gap: 8,
    },
    statCard: {
        flex: 1,
        minWidth: '45%',
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
    },
    heatmapGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingTop: 4,
    },
});
