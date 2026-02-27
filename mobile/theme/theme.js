// mobile/theme/theme.js

// Linear / Notion inspired premium colour palette
export const colors = {
    light: {
        background: '#FFFFFF',
        surface: '#F7F7F9',        // Cards, inputs
        surfaceHighlight: '#F1F1F4',
        border: '#E8E8ED',

        text: '#111827',
        textSecondary: '#6B7280',
        textTertiary: '#9CA3AF',

        primary: '#6d28d9',        // Purple accent
        primaryLight: '#ede9fe',

        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',

        shadow: '#000000',
    },
    dark: {
        background: '#0E0E11',     // Deep OLED-friendly black
        surface: '#1A1A1E',
        surfaceHighlight: '#27272A',
        border: '#2D2D35',

        text: '#F9FAFB',
        textSecondary: '#9CA3AF',
        textTertiary: '#6B7280',

        primary: '#8B5CF6',
        primaryLight: '#4C1D95',

        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',

        shadow: '#000000',
    }
};

export const typography = {
    h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    h2: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
    h3: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const layout = {
    radius: 16,
    radiusSmall: 8,
    radiusPill: 999,
};

export const shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 8,
    }
};
