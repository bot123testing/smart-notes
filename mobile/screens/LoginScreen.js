import React, { useState, useRef, useContext } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';

import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { typography, spacing, layout, shadows } from '../theme/theme';
import TextInputField from '../components/TextInputField';
import PrimaryButton from '../components/PrimaryButton';

const LoginScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const { signIn } = useContext(AuthContext);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const passwordRef = useRef(null);

    const validate = () => {
        const newErrors = {};
        if (!email.trim()) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
        if (!password) newErrors.password = 'Password is required';
        else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleLogin = async () => {
        if (!validate()) return;
        setLoading(true);
        try {
            await signIn(email, password);
        } catch (e) {
            Alert.alert('Login Failed', e.message || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: theme.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Logo / Title */}
                <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.logoArea}>
                    <View style={[styles.logoCircle, { backgroundColor: theme.primary }]}>
                        <Text style={styles.logoEmoji}>✦</Text>
                    </View>
                    <Text style={[styles.appName, { color: theme.text }]}>Smart Notes+</Text>
                    <Text style={[styles.tagline, { color: theme.textTertiary }]}>
                        Your connected knowledge base
                    </Text>
                </Animated.View>

                {/* Form Card */}
                <Animated.View
                    entering={FadeInDown.delay(120).springify()}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}
                >
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Welcome back</Text>

                    <TextInputField
                        label="Email"
                        placeholder="you@example.com"
                        value={email}
                        onChangeText={(t) => { setEmail(t); setErrors(e => ({ ...e, email: null })); }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        icon={Mail}
                        error={errors.email}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                    />

                    <View>
                        <TextInputField
                            label="Password"
                            placeholder="••••••••"
                            value={password}
                            onChangeText={(t) => { setPassword(t); setErrors(e => ({ ...e, password: null })); }}
                            secureTextEntry={!showPassword}
                            icon={Lock}
                            error={errors.password}
                            returnKeyType="done"
                            onSubmitEditing={handleLogin}
                            innerRef={passwordRef}
                        />
                        <TouchableOpacity
                            onPress={() => setShowPassword(v => !v)}
                            style={styles.eyeToggle}
                        >
                            {showPassword
                                ? <EyeOff size={18} color={theme.textTertiary} />
                                : <Eye size={18} color={theme.textTertiary} />}
                        </TouchableOpacity>
                    </View>

                    <PrimaryButton
                        title="Sign In"
                        onPress={handleLogin}
                        loading={loading}
                        style={{ marginTop: spacing.sm }}
                    />
                </Animated.View>

                {/* Register link */}
                <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.footer}>
                    <Text style={[styles.footerText, { color: theme.textTertiary }]}>
                        Don't have an account?{' '}
                    </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                        <Text style={[styles.footerLink, { color: theme.primary }]}>Register</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xxl,
    },
    logoArea: {
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    logoCircle: {
        width: 64,
        height: 64,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    logoEmoji: {
        fontSize: 28,
        color: '#FFFFFF',
    },
    appName: {
        ...typography.h2,
        marginBottom: 4,
    },
    tagline: {
        ...typography.bodySmall,
    },
    card: {
        borderRadius: layout.radius,
        borderWidth: 1,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    cardTitle: {
        ...typography.h3,
        marginBottom: spacing.lg,
    },
    eyeToggle: {
        position: 'absolute',
        right: spacing.md,
        top: 34,
        padding: spacing.xs,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        ...typography.bodySmall,
    },
    footerLink: {
        ...typography.bodySmall,
        fontWeight: '700',
    },
});

export default LoginScreen;
