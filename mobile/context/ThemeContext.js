// @refresh reset
// mobile/context/ThemeContext.js
// Provides an in-app theme override that persists via SecureStore.
// Falls back to the OS colour scheme if no override has been set.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../theme/theme';

const THEME_KEY = 'userThemeOverride'; // 'light' | 'dark' | null

const ThemeContext = createContext({
    theme: colors.dark,
    isDark: true,
    themeMode: 'system', // 'light' | 'dark' | 'system'
    setThemeMode: () => { },
});

export const ThemeProvider = ({ children }) => {
    const osScheme = useColorScheme();         // 'light' | 'dark' | null
    const [override, setOverride] = useState(null); // null = follow OS

    // Load persisted override once on mount
    useEffect(() => {
        SecureStore.getItemAsync(THEME_KEY).then(val => {
            if (val === 'light' || val === 'dark') setOverride(val);
        });
    }, []);

    // Persist whenever override changes
    const setThemeMode = useCallback(async (mode) => {
        // mode: 'light' | 'dark' | 'system'
        if (mode === 'system') {
            await SecureStore.deleteItemAsync(THEME_KEY);
            setOverride(null);
        } else {
            await SecureStore.setItemAsync(THEME_KEY, mode);
            setOverride(mode);
        }
    }, []);

    const resolvedScheme = override ?? osScheme ?? 'dark';
    const isDark = resolvedScheme === 'dark';
    const theme = isDark ? colors.dark : colors.light;
    const themeMode = override ?? 'system';

    return (
        <ThemeContext.Provider value={{ theme, isDark, themeMode, setThemeMode }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
