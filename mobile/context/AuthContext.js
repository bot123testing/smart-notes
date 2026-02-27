import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { setAuthLogoutHandler } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Check for stored token
        const bootstrapAsync = async () => {
            let token;
            try {
                token = await SecureStore.getItemAsync('userToken');
            } catch (e) {
                console.log('Restoring token failed');
            }
            setUserToken(token);
        };
        bootstrapAsync();
    }, []);

    // Register signOut as the global 401 handler so the api interceptor
    // can trigger a real logout when any request returns 401 (token expired).
    useEffect(() => {
        setAuthLogoutHandler(async () => {
            await SecureStore.deleteItemAsync('userToken');
            setUserToken(null);
        });
    }, []);

    const authContext = React.useMemo(
        () => ({
            signIn: async (email, password) => {
                setIsLoading(true);
                try {
                    // Note: Use form data for OAuth2PasswordRequestForm compatibility if needed, 
                    // but our backend expects standard form-data for /login endpoint if using OAuth2PasswordRequestForm
                    // However, axios usually sends JSON by default. Let's send x-www-form-urlencoded as per OAuth2 spec usually used by FastAPI
                    // React Native Axios doesn't serialize URLSearchParams properly
                    const body = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;

                    const response = await api.post('/auth/login', body, {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });

                    const token = response.data.access_token;
                    await SecureStore.setItemAsync('userToken', token);
                    setUserToken(token);
                } catch (error) {
                    console.error('Sign In Error:', error);
                    const msg = error.response?.data?.detail || error.message || 'Login failed';
                    throw new Error(msg);
                } finally {
                    setIsLoading(false);
                }
            },
            signOut: async () => {
                await SecureStore.deleteItemAsync('userToken');
                setUserToken(null);
            },
            signUp: async (name, email, password) => {
                setIsLoading(true);
                try {
                    await api.post('/auth/register', { name, email, password });
                    // Automatically sign in after register? Or just return success.
                    // Let's just return and let user sign in.
                } catch (error) {
                    console.error('Sign Up Error:', error);
                    const msg = error.response?.data?.detail || error.message || 'Registration failed';
                    throw new Error(msg);
                } finally {
                    setIsLoading(false);
                }
            },
            userToken,
            isLoading
        }),
        [userToken, isLoading]
    );

    return (
        <AuthContext.Provider value={authContext}>
            {children}
        </AuthContext.Provider>
    );
};
