'use client';

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from '../page.module.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, register } = useAuth();
    const [isRegistering, setIsRegistering] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isRegistering) {
                await register(email, password);
                alert('Registered! Now login.');
                setIsRegistering(false);
            } else {
                await login(email, password);
            }
        } catch (err) {
            alert('Action failed');
        }
    };

    return (
        <main className={styles.main}>
            <h1>{isRegistering ? 'Register' : 'Login'}</h1>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '0.5rem' }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '0.5rem' }}
                />
                <button type="submit" style={{ padding: '0.5rem' }}>{isRegistering ? 'Sign Up' : 'Sign In'}</button>
            </form>
            <button
                onClick={() => setIsRegistering(!isRegistering)}
                style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'blue', cursor: 'pointer' }}
            >
                {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
        </main>
    );
}
