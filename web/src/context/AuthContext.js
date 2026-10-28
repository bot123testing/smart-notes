'use client';

import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('userToken') : null;
        if (!token) {
            Promise.resolve().then(() => {
                setUserToken(null);
                setCurrentUser(null);
                setLoading(false);
                if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                    router.replace('/login');
                }
            });
            return;
        }

        // Validate token with backend /auth/me
        api.get('/auth/me')
            .then((res) => {
                setUserToken(token);
                setCurrentUser(res.data);
            })
            .catch(() => {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('userToken');
                }
                setUserToken(null);
                setCurrentUser(null);
                if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                    router.replace('/login');
                }
            })
            .finally(() => {
                setLoading(false);
            });
    }, [router]);

    const login = async (email, password) => {
        try {
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const response = await api.post('/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const token = response.data.access_token;
            if (typeof window !== 'undefined') {
                localStorage.setItem('userToken', token);
            }
            setUserToken(token);
            try {
                const meRes = await api.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setCurrentUser(meRes.data);
            } catch (_) {}
            router.push('/');
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const logout = () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('userToken');
        }
        setUserToken(null);
        setCurrentUser(null);
        router.push('/login');
    };

    const register = async (name, email, password) => {
        try {
            await api.post('/auth/register', { name, email, password });
            router.push('/login');
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ userToken, currentUser, login, logout, register, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
