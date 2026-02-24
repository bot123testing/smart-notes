'use client';

import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('userToken');
        if (token) {
            // eslint-disable-next-line
            setUserToken(token);
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const response = await api.post('/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const token = response.data.access_token;
            localStorage.setItem('userToken', token);
            setUserToken(token);
            router.push('/');
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('userToken');
        setUserToken(null);
        router.push('/login');
    };

    const register = async (email, password) => {
        try {
            await api.post('/auth/register', { email, password });
            // Optionally auto-login
            router.push('/login');
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ userToken, login, logout, register, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
