'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login, register, userToken, loading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && userToken) {
            router.replace('/');
        }
    }, [userToken, authLoading, router]);

    const [isRegistering, setIsRegistering] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const validate = () => {
        if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) return 'Enter a valid email.';
        if (!password || password.length < 6) return 'Password must be at least 6 characters.';
        if (isRegistering && !name.trim()) return 'Full name is required.';
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationError = validate();
        if (validationError) { setError(validationError); return; }
        setError('');
        setLoading(true);
        try {
            if (isRegistering) {
                await register(name, email, password);
                setIsRegistering(false);
                setName('');
                setPassword('');
            } else {
                await login(email, password);
            }
        } catch (err) {
            setError(isRegistering
                ? 'Registration failed. This email may already be in use.'
                : 'Invalid email or password. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.root}>
            {/* Background glow */}
            <div style={s.glow} />

            <div style={s.container} className="animate-in">
                {/* Logo */}
                <div style={s.logoArea}>
                    <div style={s.logoCircle}>
                        <span style={{ fontSize: 28 }}>✦</span>
                    </div>
                    <h1 style={s.appName}>Smart Notes+</h1>
                    <p style={s.tagline}>Your connected knowledge base</p>
                </div>

                {/* Card */}
                <div className="card" style={s.card}>
                    <h2 style={s.cardTitle}>
                        {isRegistering ? 'Create account' : 'Welcome back'}
                    </h2>

                    <form onSubmit={handleSubmit} style={s.form}>
                        {isRegistering && (
                            <div style={s.field}>
                                <label style={s.label} htmlFor="name">Full Name</label>
                                <input
                                    id="name"
                                    className="input"
                                    placeholder="Jane Smith"
                                    value={name}
                                    onChange={e => { setName(e.target.value); setError(''); }}
                                    autoComplete="name"
                                />
                            </div>
                        )}

                        <div style={s.field}>
                            <label style={s.label} htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                className="input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e => { setEmail(e.target.value); setError(''); }}
                                autoComplete="email"
                            />
                        </div>

                        <div style={s.field}>
                            <label style={s.label} htmlFor="password">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    style={s.eyeBtn}
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div style={s.errorBanner}>
                                ⚠ {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ width: '100%', height: 44, fontSize: 15 }}
                        >
                            {loading ? (
                                <span className="spinner" />
                            ) : isRegistering ? 'Create Account' : 'Sign In'}
                        </button>
                    </form>
                </div>

                {/* Toggle */}
                <p style={s.toggle}>
                    {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
                    <button
                        type="button"
                        style={s.toggleLink}
                        onClick={() => { setIsRegistering(v => !v); setError(''); }}
                    >
                        {isRegistering ? 'Sign In' : 'Register'}
                    </button>
                </p>
            </div>
        </div>
    );
}

const s = {
    root: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
    },
    glow: {
        position: 'absolute',
        top: -200,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
    },
    container: {
        width: '100%',
        maxWidth: 400,
        position: 'relative',
        zIndex: 1,
    },
    logoArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 28,
    },
    logoCircle: {
        width: 64,
        height: 64,
        borderRadius: 18,
        background: 'linear-gradient(135deg, #8B5CF6, #6d28d9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        marginBottom: 16,
        boxShadow: '0 8px 24px rgba(139,92,246,0.35)',
    },
    appName: {
        fontSize: 26,
        fontWeight: 800,
        color: 'var(--text)',
        marginBottom: 6,
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 13,
        color: 'var(--text-tertiary)',
    },
    card: {
        padding: 28,
        marginBottom: 20,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: 'var(--text)',
        marginBottom: 24,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-secondary)',
    },
    eyeBtn: {
        position: 'absolute',
        right: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 16,
        padding: 4,
        lineHeight: 1,
    },
    errorBanner: {
        padding: '10px 14px',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#f87171',
        fontSize: 13,
        fontWeight: 500,
    },
    toggle: {
        textAlign: 'center',
        fontSize: 14,
        color: 'var(--text-tertiary)',
    },
    toggleLink: {
        background: 'none',
        border: 'none',
        color: 'var(--primary)',
        fontWeight: 700,
        cursor: 'pointer',
        fontSize: 14,
        fontFamily: 'inherit',
    },
};
