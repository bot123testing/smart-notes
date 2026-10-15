import React from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { colors, typography, spacing, layout, shadows } from '../theme/theme';
import { Zap, Link2, Eye } from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const decayColor = (decay) => {
    if (decay >= 0.6) return colors.light.danger;
    if (decay >= 0.3) return colors.light.warning;
    return colors.light.success;
};

const RecommendationCard = ({ rec, onPress }) => {
    const isDark = useColorScheme() === 'dark';
    const theme = isDark ? colors.dark : colors.light;

    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const pct = Math.round(rec.memory_decay * 100);
    const statusColor = decayColor(rec.memory_decay);

    const rStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
        };
    });

    const handlePressIn = () => {
        scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
        opacity.value = withTiming(0.9, { duration: 150 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
        opacity.value = withTiming(1, { duration: 150 });
    };

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
                styles.recCard,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    ...(!isDark && shadows.md),
                    shadowColor: statusColor, // Glow effect based on decay
                },
                rStyle
            ]}
        >
            <View style={[styles.recDecayBar, { backgroundColor: statusColor, height: `${pct}%` }]} />

            <View style={styles.recBody}>
                <Text style={[styles.recTitle, { color: theme.text }]} numberOfLines={2}>
                    {rec.title}
                </Text>

                <View style={[styles.decayPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '50' }]}>
                    <Text style={[styles.decayPillText, { color: statusColor }]}>
                        {pct}% forgotten
                    </Text>
                </View>

                <View style={styles.recStatsRow}>
                    <View style={styles.statChip}>
                        <Zap size={10} color={theme.warning} />
                        <Text style={[styles.recStat, { color: theme.textSecondary }]}>
                            {rec.importance_score.toFixed(0)}
                        </Text>
                    </View>

                    <View style={styles.statChip}>
                        <Link2 size={10} color={theme.textTertiary} />
                        <Text style={[styles.recStat, { color: theme.textSecondary }]}>
                            {rec.linked_note_count}
                        </Text>
                    </View>

                    <View style={styles.statChip}>
                        <Eye size={10} color={theme.textTertiary} />
                        <Text style={[styles.recStat, { color: theme.textSecondary }]}>
                            {rec.last_accessed
                                ? `${Math.round((Date.now() - new Date(rec.last_accessed).getTime()) / 86400000)}d`
                                : 'New'}
                        </Text>
                    </View>
                </View>
            </View>
        </AnimatedPressable>
    );
};

const styles = StyleSheet.create({
    recCard: {
        width: 170,
        height: 140,
        borderRadius: layout.radius,
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'row',
        marginRight: spacing.md,
        marginVertical: spacing.sm,
    },
    recDecayBar: {
        width: 4,
        alignSelf: 'flex-end',
        borderTopRightRadius: layout.radiusSmall,
    },
    recBody: {
        flex: 1,
        padding: spacing.md,
        justifyContent: 'space-between',
    },
    recTitle: {
        ...typography.bodySmall,
        fontWeight: '700',
        lineHeight: 18,
    },
    decayPill: {
        alignSelf: 'flex-start',
        borderRadius: layout.radiusSmall,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginVertical: spacing.xs,
    },
    decayPillText: {
        fontSize: 10,
        fontWeight: '800',
    },
    recStatsRow: {
        flexDirection: 'row',
        gap: spacing.xs,
        alignItems: 'center',
    },
    statChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    recStat: {
        fontSize: 10,
        fontWeight: '600',
    },
});

export default React.memo(RecommendationCard);
