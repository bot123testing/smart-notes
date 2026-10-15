import React, { useState, useRef, useContext } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Mail, Lock, User } from 'lucide-react-native';

import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { typography, spacing, layout, shadows } from '../theme/theme';
import TextInputField from '../components/TextInputField';
import PrimaryButton from '../components/PrimaryButton';

const RegisterScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const { signUp } = useContext(AuthContext);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    const validate = () => {
        const newErrors = {};
        if (!name.trim()) newErrors.name = 'Name is required';
        if (!email.trim()) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
        if (!password) newErrors.password = 'Password is required';
        else if (password.length < 6) newErrors.password = 'At least 6 characters';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleRegister = async () => {
        if (!validate()) return;
        setLoading(true);
        try {
            await signUp(name, email, password);
        } catch (e) {
            Alert.alert('Registration Failed', e.message || 'Could not create account. Try again.');
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
                <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.logoArea}>
                    <View style={[styles.logoCircle, { backgroundColor: theme.primary }]}>
                        <Text style={styles.logoEmoji}>✦</Text>
                    </View>
                    <Text style={[styles.appName, { color: theme.text }]}>Smart Notes+</Text>
                    <Text style={[styles.tagline, { color: theme.textTertiary }]}>
                        Build your knowledge base
                    </Text>
                </Animated.View>

                <Animated.View
                    entering={FadeInDown.delay(120).springify()}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}
                >
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Create account</Text>

                    <TextInputField
                        label="Full Name"
                        placeholder="Jane Smith"
                        value={name}
                        onChangeText={(t) => { setName(t); setErrors(e => ({ ...e, name: null })); }}
                        autoCapitalize="words"
                        icon={User}
                        error={errors.name}
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                    />

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
                        innerRef={emailRef}
                        onSubmitEditing={() => passwordRef.current?.focus()}
                    />

                    <TextInputField
                        label="Password"
                        placeholder="••••••••"
                        value={password}
                        onChangeText={(t) => { setPassword(t); setErrors(e => ({ ...e, password: null })); }}
                        secureTextEntry
                        icon={Lock}
                        error={errors.password}
                        returnKeyType="done"
                        innerRef={passwordRef}
                        onSubmitEditing={handleRegister}
                    />

                    <PrimaryButton
                        title="Create Account"
                        onPress={handleRegister}
                        loading={loading}
                        style={{ marginTop: spacing.sm }}
                    />
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.footer}>
                    <Text style={[styles.footerText, { color: theme.textTertiary }]}>
                        Already have an account?{' '}
                    </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                        <Text style={[styles.footerLink, { color: theme.primary }]}>Sign In</Text>
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

export default RegisterScreen;
