import React from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { Link2 } from 'lucide-react-native';
import { colors, typography, spacing, layout, shadows } from '../theme/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const NoteCard = ({ note, onPress, onLongPress }) => {
    const isDark = useColorScheme() === 'dark';
    const theme = isDark ? colors.dark : colors.light;

    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);
    const elevation = useSharedValue(isDark ? 0 : 2); // Less elevation in dark mode

    const rStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
            elevation: elevation.value,
            shadowOpacity: withTiming(isDark ? 0.2 : 0.08),
        };
    });

    const handlePressIn = () => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
        opacity.value = withTiming(0.9, { duration: 150 });
        elevation.value = withTiming(isDark ? 0 : 8, { duration: 150 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
        opacity.value = withTiming(1, { duration: 150 });
        elevation.value = withTiming(isDark ? 0 : 2, { duration: 150 });
    };

    return (
        <AnimatedPressable
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            delayLongPress={300}
            style={[
                styles.card,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    ...(!isDark && shadows.sm)
                },
                rStyle
            ]}
        >
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                    {note.title || "Untitled Note"}
                </Text>
                {note.linked_notes?.length > 0 && (
                    <View style={styles.linkBadge}>
                        <Link2 size={12} color={theme.primary} />
                        <Text style={[styles.linkText, { color: theme.primary }]}>
                            {note.linked_notes.length}
                        </Text>
                    </View>
                )}
            </View>

            {note.content ? (
                <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={2}>
                    {note.content}
                </Text>
            ) : null}

            {note.tags && note.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                    {note.tags.map((tag, index) => (
                        <View
                            key={index}
                            style={[styles.tag, { backgroundColor: theme.primaryLight }]}
                        >
                            <Text style={[styles.tagText, { color: theme.primary }]}>
                                {tag}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.footer}>
                <Text style={[styles.hintText, { color: theme.textTertiary }]}>
                    {new Date(note.updated_at).toLocaleDateString()}
                </Text>
            </View>
        </AnimatedPressable>
    );
};

const styles = StyleSheet.create({
    card: {
        padding: spacing.md,
        borderRadius: layout.radius,
        borderWidth: 1,
        marginBottom: spacing.md,
        marginHorizontal: spacing.md,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    title: {
        flex: 1,
        ...typography.h3,
    },
    content: {
        ...typography.bodySmall,
        marginBottom: spacing.sm,
        lineHeight: 20,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginTop: spacing.xs,
    },
    tag: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: layout.radiusPill,
    },
    tagText: {
        ...typography.label,
        fontSize: 10,
        textTransform: 'none',
        fontWeight: '700',
    },
    linkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: 'rgba(109, 40, 217, 0.1)',
        marginLeft: spacing.sm,
    },
    linkText: {
        fontSize: 12,
        fontWeight: '700',
    },
    footer: {
        marginTop: spacing.md,
        paddingTop: spacing.xs,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(156, 163, 175, 0.2)',
    },
    hintText: {
        fontSize: 11,
        fontWeight: '500',
    },
});

export default React.memo(NoteCard);
