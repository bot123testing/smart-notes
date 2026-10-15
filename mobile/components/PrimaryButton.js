import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { typography, layout, spacing } from '../theme/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PrimaryButton = ({
    onPress,
    title,
    loading = false,
    disabled = false,
    variant = 'primary', // 'primary' | 'danger' | 'ghost'
    style,
}) => {
    const { theme } = useTheme();
    const scale = useSharedValue(1);

    const rStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const bgColor = {
        primary: theme.primary,
        danger: theme.danger,
        ghost: 'transparent',
    }[variant];

    const textColor = variant === 'ghost' ? theme.primary : '#FFFFFF';
    const borderColor = variant === 'ghost' ? theme.primary : 'transparent';
    const isDisabled = disabled || loading;

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 300 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
            disabled={isDisabled}
            style={[
                styles.btn,
                { backgroundColor: bgColor, borderColor, opacity: isDisabled ? 0.55 : 1 },
                variant === 'ghost' && { borderWidth: 1.5 },
                style,
                rStyle,
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={textColor} />
            ) : (
                <Text style={[styles.label, { color: textColor }]}>{title}</Text>
            )}
        </AnimatedPressable>
    );
};

const styles = StyleSheet.create({
    btn: {
        height: 52,
        borderRadius: layout.radius,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
    },
    label: {
        ...typography.h3,
        fontSize: 16,
        letterSpacing: 0.2,
    },
});

export default PrimaryButton;
