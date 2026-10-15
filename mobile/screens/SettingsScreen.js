import React, { useContext } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Switch, Alert
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    Moon, Sun, Smartphone, LogOut, Info,
    ChevronRight, RefreshCw, Palette, User, Bell
} from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import { AuthContext } from '../context/AuthContext';
import { typography, spacing, layout, shadows } from '../theme/theme';

/* ── Small reusable components ─────────────────────────────────────── */
const SectionHeader = ({ title, theme }) => (
    <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>{title}</Text>
);

const Row = ({ icon: Icon, label, right, onPress, danger, theme, last }) => (
    <TouchableOpacity
        activeOpacity={onPress ? 0.7 : 1}
        onPress={onPress}
        style={[
            styles.row,
            { borderBottomColor: last ? 'transparent' : theme.border },
        ]}
    >
        <View style={[styles.iconWrap, { backgroundColor: danger ? 'rgba(239,68,68,0.12)' : theme.surfaceHighlight }]}>
            <Icon size={17} color={danger ? theme.danger : theme.primary} />
        </View>
        <Text style={[styles.rowLabel, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        <View style={styles.rowRight}>
            {right}
            {onPress && !right && <ChevronRight size={16} color={theme.textTertiary} />}
        </View>
    </TouchableOpacity>
);

/* ── Theme picker modal inline ─────────────────────────────────────── */
const ThemeOption = ({ mode, label, Icon, current, onSelect, theme }) => {
    const active = current === mode;
    return (
        <TouchableOpacity
            onPress={() => onSelect(mode)}
            style={[
                styles.themeOption,
                {
                    backgroundColor: active ? theme.primaryLight : theme.surfaceHighlight,
                    borderColor: active ? theme.primary : 'transparent',
                }
            ]}
            activeOpacity={0.75}
        >
            <Icon size={20} color={active ? theme.primary : theme.textSecondary} />
            <Text style={[styles.themeOptionLabel, { color: active ? theme.primary : theme.textSecondary }]}>
                {label}
            </Text>
            {active && (
                <View style={[styles.activeDot, { backgroundColor: theme.primary }]} />
            )}
        </TouchableOpacity>
    );
};

/* ── Main screen ───────────────────────────────────────────────────── */
const SettingsScreen = ({ navigation }) => {
    const { theme, themeMode, setThemeMode } = useTheme();
    const { signOut } = useContext(AuthContext);

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: signOut },
            ]
        );
    };

    return (
        <ScrollView
            style={[styles.root, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* Appearance */}
            <Animated.View entering={FadeInDown.delay(0).springify()}>
                <SectionHeader title="APPEARANCE" theme={theme} />
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.themeLabel, { color: theme.textSecondary }]}>Theme</Text>
                    <View style={styles.themeRow}>
                        <ThemeOption mode="light" label="Light" Icon={Sun} current={themeMode} onSelect={setThemeMode} theme={theme} />
                        <ThemeOption mode="system" label="System" Icon={Smartphone} current={themeMode} onSelect={setThemeMode} theme={theme} />
                        <ThemeOption mode="dark" label="Dark" Icon={Moon} current={themeMode} onSelect={setThemeMode} theme={theme} />
                    </View>
                </View>
            </Animated.View>

            {/* Notes */}
            <Animated.View entering={FadeInDown.delay(80).springify()}>
                <SectionHeader title="NOTES" theme={theme} />
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Row
                        icon={RefreshCw}
                        label="Recompute All AI Suggestions"
                        theme={theme}
                        onPress={() => Alert.alert('Recompute', 'This will recompute NLP suggestions for all your notes the next time you open them.')}
                    />
                    <Row
                        icon={Bell}
                        label="Notifications"
                        theme={theme}
                        last
                        right={<Switch
                            value={false}
                            disabled
                            thumbColor={theme.primary}
                            trackColor={{ false: theme.border, true: theme.primaryLight }}
                        />}
                    />
                </View>
            </Animated.View>

            {/* Account */}
            <Animated.View entering={FadeInDown.delay(160).springify()}>
                <SectionHeader title="ACCOUNT" theme={theme} />
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Row
                        icon={Info}
                        label="About Smart Notes+"
                        theme={theme}
                        onPress={() =>
                            Alert.alert(
                                'Smart Notes+',
                                'Version 1.0.0\n\nA connected knowledge base powered by MongoDB, Neo4j, Redis, Elasticsearch, and AI-driven NLP suggestions.',
                                [{ text: 'OK' }]
                            )
                        }
                    />
                    <Row
                        icon={LogOut}
                        label="Sign Out"
                        theme={theme}
                        danger
                        last
                        onPress={handleSignOut}
                    />
                </View>
            </Animated.View>

            <Text style={[styles.version, { color: theme.textTertiary }]}>Smart Notes+ v1.0.0</Text>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: 48 },

    sectionHeader: {
        ...typography.label,
        fontSize: 11,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: 4,
    },

    card: {
        borderRadius: layout.radius,
        borderWidth: 1,
        overflow: 'hidden',
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: spacing.md,
    },
    iconWrap: {
        width: 34, height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: {
        flex: 1,
        ...typography.bodySmall,
        fontWeight: '500',
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },

    // Theme picker
    themeLabel: {
        ...typography.label,
        fontSize: 11,
        padding: spacing.md,
        paddingBottom: spacing.sm,
    },
    themeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        padding: spacing.md,
        paddingTop: 0,
    },
    themeOption: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
        borderRadius: layout.radiusSmall,
        borderWidth: 1.5,
        gap: 6,
        position: 'relative',
    },
    themeOptionLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    activeDot: {
        position: 'absolute',
        top: 6, right: 6,
        width: 7, height: 7,
        borderRadius: 999,
    },

    version: {
        textAlign: 'center',
        fontSize: 12,
        marginTop: spacing.xl,
        fontWeight: '500',
    },
});

export default SettingsScreen;
