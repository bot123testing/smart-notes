import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { typography, layout, spacing } from '../theme/theme';

const TextInputField = ({
    label,
    placeholder,
    value,
    onChangeText,
    secureTextEntry = false,
    autoCapitalize = 'none',
    keyboardType = 'default',
    error,
    icon: Icon,
    returnKeyType,
    onSubmitEditing,
    autoFocus = false,
    innerRef,
}) => {
    const { theme } = useTheme();
    const [focused, setFocused] = useState(false);

    const borderProgress = useSharedValue(0);

    const rContainerStyle = useAnimatedStyle(() => ({
        borderColor: withTiming(
            focused ? theme.primary : error ? theme.danger : theme.border,
            { duration: 200 }
        ),
        shadowOpacity: withTiming(focused ? 0.12 : 0, { duration: 200 }),
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
    }));

    return (
        <View style={styles.wrapper}>
            {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
            <Animated.View style={[
                styles.container,
                { backgroundColor: theme.surface, borderColor: theme.border },
                rContainerStyle,
            ]}>
                {Icon && <Icon size={18} color={focused ? theme.primary : theme.textTertiary} style={styles.icon} />}
                <TextInput
                    ref={innerRef}
                    style={[styles.input, { color: theme.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={theme.textTertiary}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={secureTextEntry}
                    autoCapitalize={autoCapitalize}
                    keyboardType={keyboardType}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    autoFocus={autoFocus}
                />
            </Animated.View>
            {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        marginBottom: spacing.md,
    },
    label: {
        ...typography.label,
        marginBottom: spacing.xs,
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: layout.radius,
        borderWidth: 1.5,
        paddingHorizontal: spacing.md,
        height: 52,
    },
    icon: {
        marginRight: spacing.sm,
    },
    input: {
        flex: 1,
        ...typography.body,
        padding: 0,
    },
    error: {
        fontSize: 12,
        marginTop: 4,
        fontWeight: '500',
    },
});

export default TextInputField;
