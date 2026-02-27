import React, { useState, useContext, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    RefreshControl, Alert, ActivityIndicator,
    Dimensions, StatusBar, Platform,
} from 'react-native';
import Animated, {
    FadeInDown, FadeInUp,
    useSharedValue, useAnimatedStyle,
    withSpring, withTiming, interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import {
    LogOut, Plus, X, BrainCircuit,
    NotebookPen, Search, FileText, Clock,
    Share2, BarChart2,
} from 'lucide-react-native';

import { colors, typography, spacing, layout, shadows } from '../theme/theme';
import { useTheme } from '../hooks/useTheme';
import NoteCard from '../components/NoteCard';
import SwipeableNoteCard from '../components/SwipeableNoteCard';
import RecommendationCard from '../components/RecommendationCard';
import { NoteSkeleton } from '../components/SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HEADER_MAX = 150;
const HEADER_MIN = Platform.OS === 'ios' ? 94 : 60;

const AnimatedPressable = Animated.createAnimatedComponent(TouchableOpacity);

const HomeScreen = ({ navigation }) => {
    const { theme, isDark } = useTheme();

    const [notes, setNotes] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [recentNotes, setRecentNotes] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingNotes, setLoadingNotes] = useState(true);
    const [recsLoading, setRecsLoading] = useState(false);
    const [fabOpen, setFabOpen] = useState(false);
    const { signOut } = useContext(AuthContext);

    // Scroll-driven header
    const scrollY = useSharedValue(0);

    // FAB animation
    const fabRotation = useSharedValue(0);
    const fabMenuOpacity = useSharedValue(0);
    const fabMenuScale = useSharedValue(0.8);

    const headerAnimatedStyle = useAnimatedStyle(() => {
        const height = interpolate(
            scrollY.value,
            [0, HEADER_MAX - HEADER_MIN],
            [HEADER_MAX, HEADER_MIN],
            Extrapolation.CLAMP
        );
        return { height };
    });

    const titleOpacity = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollY.value,
            [0, (HEADER_MAX - HEADER_MIN) * 0.6],
            [1, 0],
            Extrapolation.CLAMP
        );
        return { opacity };
    });

    const miniTitleOpacity = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollY.value,
            [(HEADER_MAX - HEADER_MIN) * 0.4, HEADER_MAX - HEADER_MIN],
            [0, 1],
            Extrapolation.CLAMP
        );
        return { opacity };
    });

    const fabIconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${fabRotation.value * 45}deg` }],
    }));

    const fabMenuStyle = useAnimatedStyle(() => ({
        opacity: fabMenuOpacity.value,
        transform: [{ scale: fabMenuScale.value }],
        pointerEvents: fabMenuOpacity.value > 0 ? 'auto' : 'none',
    }));

    const toggleFab = () => {
        const isOpen = !fabOpen;
        setFabOpen(isOpen);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        fabRotation.value = withSpring(isOpen ? 1 : 0, { damping: 12, stiffness: 200 });
        fabMenuOpacity.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
        fabMenuScale.value = withSpring(isOpen ? 1 : 0.8, { damping: 12, stiffness: 200 });
    };

    const closeFab = () => {
        setFabOpen(false);
        fabRotation.value = withSpring(0);
        fabMenuOpacity.value = withTiming(0, { duration: 150 });
        fabMenuScale.value = withSpring(0.8);
    };

    const fetchNotes = async () => {
        setLoadingNotes(true);
        try {
            const response = await api.get('/notes/');
            setNotes(response.data);
        } catch (error) {
            console.error('Fetch notes error:', error);
        } finally {
            setLoadingNotes(false);
        }
    };

    const fetchRecommendations = async () => {
        setRecsLoading(true);
        try {
            const res = await api.get('/notes/recommendations');
            const meaningful = res.data.notes.filter(r => r.memory_decay > 0.05);
            setRecommendations(meaningful);
        } catch (error) {
            console.error('Fetch recommendations error:', error);
        } finally {
            setRecsLoading(false);
        }
    };

    const fetchRecentNotes = async () => {
        try {
            const res = await api.get('/notes/recent');
            setRecentNotes(res.data || []);
        } catch (error) {
            console.error('Fetch recent notes error:', error);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchNotes();
            fetchRecommendations();
            fetchRecentNotes();
        }, [])
    );

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
        ]);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchNotes(), fetchRecommendations(), fetchRecentNotes()]);
        setRefreshing(false);
    }, []);

    const handleDelete = (noteId) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Delete Note', 'This note will be permanently deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/notes/${noteId}`);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setNotes(prev => prev.filter(n => n.id !== noteId));
                        setRecommendations(prev => prev.filter(r => r.note_id !== noteId));
                    } catch {
                        Alert.alert('Error', 'Could not delete note');
                    }
                },
            },
        ]);
    };

    const openNote = async (noteId) => {
        try {
            const res = await api.get(`/notes/${noteId}`);
            navigation.navigate('EditNote', { note: res.data });
        } catch {
            Alert.alert('Error', 'Could not open note');
        }
    };

    const renderNote = ({ item, index }) => {
        const isCritical = (item.memory_decay || 0) >= 0.6;
        return (
            <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
                {isCritical && (
                    <Animated.View
                        style={[
                            styles.decayGlowOverlay,
                            { borderColor: '#ef4444' },
                        ]}
                    />
                )}
                <SwipeableNoteCard
                    note={item}
                    onPress={() => navigation.navigate('EditNote', { note: item })}
                    onDelete={handleDelete}
                />
            </Animated.View>
        );
    };

    const renderListHeader = () => (
        <>
            {/* Recently Viewed Section */}
            {recentNotes.length > 0 && (
                <Animated.View entering={FadeInUp.delay(0).springify()} style={styles.recsSection}>
                    <View style={styles.recsSectionHeader}>
                        <View style={styles.recsTitleRow}>
                            <Clock size={16} color={theme.textSecondary} />
                            <Text style={[styles.recsSectionTitle, { color: theme.text }]}>Recently Viewed</Text>
                        </View>
                    </View>
                    <Animated.ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recsScroll}
                    >
                        {recentNotes.slice(0, 8).map(note => (
                            <TouchableOpacity
                                key={note.id}
                                style={[styles.recentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                onPress={() => navigation.navigate('EditNote', { note })}
                                activeOpacity={0.75}
                            >
                                <Text style={[styles.recentCardTitle, { color: theme.text }]} numberOfLines={2}>
                                    {note.title}
                                </Text>
                                {note.tags && note.tags.length > 0 && (
                                    <Text style={[styles.recentCardTag, { color: theme.primary }]} numberOfLines={1}>
                                        #{note.tags[0]}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </Animated.ScrollView>
                </Animated.View>
            )}

            {/* Smart Review / Recommendations */}
            {recommendations.length > 0 && (
                <Animated.View entering={FadeInUp.delay(60).springify()} style={styles.recsSection}>
                    <View style={[styles.recsSectionHeader]}>
                        <View style={styles.recsTitleRow}>
                            <BrainCircuit size={18} color={theme.primary} />
                            <Text style={[styles.recsSectionTitle, { color: theme.text }]}>Smart Review</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: theme.primaryLight }]}>
                            <Text style={[styles.badgeText, { color: theme.primary }]}>
                                {recommendations.length}
                            </Text>
                        </View>
                    </View>
                    {recsLoading ? (
                        <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: spacing.md }} />
                    ) : (
                        <Animated.ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.recsScroll}
                        >
                            {recommendations.map(rec => (
                                <RecommendationCard
                                    key={rec.note_id}
                                    rec={rec}
                                    onPress={() => openNote(rec.note_id)}
                                />
                            ))}
                        </Animated.ScrollView>
                    )}
                </Animated.View>
            )}

            {/* Section separator */}
            {notes.length > 0 && (
                <View style={[styles.notesHeader, { borderBottomColor: theme.border }]}>
                    <View style={styles.notesSectionRow}>
                        <Text style={[styles.notesHeaderText, { color: theme.textTertiary }]}>
                            {notes.length} note{notes.length !== 1 ? 's' : ''}
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('SearchTab')}
                            style={[styles.searchChip, { backgroundColor: theme.surfaceHighlight }]}
                        >
                            <Search size={12} color={theme.textTertiary} />
                            <Text style={[styles.searchChipText, { color: theme.textTertiary }]}>Search</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </>
    );

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                {/* Animated Collapsible Header */}
                <Animated.View style={[styles.headerWrapper, { backgroundColor: theme.surface, borderBottomColor: theme.border }, headerAnimatedStyle]}>
                    {/* Large title area */}
                    <Animated.View style={[styles.headerContent, titleOpacity]}>
                        <View style={styles.headerTop}>
                            <View>
                                <Text style={[styles.headerGreeting, { color: theme.textTertiary }]}>Good morning ✦</Text>
                                <Text style={[styles.headerTitle, { color: theme.text }]}>My Notes</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleSignOut}
                                style={[styles.avatarBtn, { backgroundColor: theme.surfaceHighlight }]}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <LogOut size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </Animated.View>

                    {/* Mini title (shown when collapsed) */}
                    <Animated.View style={[styles.miniHeader, miniTitleOpacity]}>
                        <Text style={[styles.miniTitle, { color: theme.text }]}>My Notes</Text>
                        <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <LogOut size={18} color={theme.textSecondary} />
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>

                {/* Notes List */}
                <Animated.FlatList
                    data={notes}
                    renderItem={renderNote}
                    keyExtractor={item => item.id}
                    contentContainerStyle={[styles.listContent, { paddingTop: HEADER_MAX }]}
                    onScroll={e => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.primary}
                            progressViewOffset={HEADER_MAX}
                        />
                    }
                    ListHeaderComponent={renderListHeader}
                    ListEmptyComponent={
                        loadingNotes ? (
                            <View style={{ padding: spacing.xl, gap: 10 }}>
                                {[0, 1, 2].map(i => <NoteSkeleton key={i} />)}
                            </View>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <View style={[styles.emptyIconCircle, { backgroundColor: theme.surfaceHighlight }]}>
                                    <FileText size={32} color={theme.textTertiary} />
                                </View>
                                <Text style={[styles.emptyTitle, { color: theme.text }]}>No notes yet</Text>
                                <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
                                    Tap the + button to create your first note
                                </Text>
                            </View>
                        )
                    }
                />

                {/* FAB Mini Menu — 3 morphing options */}
                <Animated.View style={[styles.fabMenu, fabMenuStyle]} pointerEvents={fabOpen ? 'auto' : 'none'}>
                    {fabOpen && (
                        <TouchableOpacity onPress={closeFab} style={styles.fabBackdrop} activeOpacity={1} />
                    )}
                    {/* Option 3: Insights */}
                    <Animated.View entering={fabOpen ? FadeInUp.delay(0).springify() : undefined}>
                        <TouchableOpacity
                            style={[styles.fabMenuItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            onPress={() => {
                                closeFab();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                navigation.navigate('ActivityTab');
                            }}
                        >
                            <BarChart2 size={17} color="#10b981" />
                            <Text style={[styles.fabMenuLabel, { color: theme.text }]}>View Insights</Text>
                        </TouchableOpacity>
                    </Animated.View>
                    {/* Option 2: Graph */}
                    <Animated.View entering={fabOpen ? FadeInUp.delay(60).springify() : undefined}>
                        <TouchableOpacity
                            style={[styles.fabMenuItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            onPress={() => {
                                closeFab();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                navigation.navigate('GraphTab');
                            }}
                        >
                            <Share2 size={17} color="#0ea5e9" />
                            <Text style={[styles.fabMenuLabel, { color: theme.text }]}>View Graph</Text>
                        </TouchableOpacity>
                    </Animated.View>
                    {/* Option 1: New Note */}
                    <Animated.View entering={fabOpen ? FadeInUp.delay(120).springify() : undefined}>
                        <TouchableOpacity
                            style={[styles.fabMenuItem, { backgroundColor: theme.primary, borderColor: 'transparent' }]}
                            onPress={() => {
                                closeFab();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                navigation.navigate('AddNote');
                            }}
                        >
                            <NotebookPen size={17} color="#fff" />
                            <Text style={[styles.fabMenuLabel, { color: '#fff' }]}>New Note</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>

                {/* FAB */}
                <AnimatedPressable
                    style={[styles.fab, { backgroundColor: theme.primary, ...shadows.lg }]}
                    onPress={toggleFab}
                    activeOpacity={0.85}
                >
                    <Animated.View style={fabIconStyle}>
                        {fabOpen ? <X size={26} color="#FFF" /> : <Plus size={26} color="#FFF" />}
                    </Animated.View>
                </AnimatedPressable>
            </View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    headerWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        overflow: 'hidden',
        borderBottomWidth: 1,
        paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 8 || 16,
    },
    headerContent: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.md,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    headerGreeting: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 2,
    },
    headerTitle: {
        ...typography.h1,
        fontSize: 28,
    },
    avatarBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    miniHeader: {
        position: 'absolute',
        bottom: 12,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },
    miniTitle: {
        ...typography.h3,
    },

    // List
    listContent: {
        paddingBottom: 120,
    },

    // Recommendations section
    recsSection: {
        marginBottom: spacing.sm,
        paddingTop: spacing.md,
    },
    recsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.md,
    },
    recsTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    recsSectionTitle: {
        ...typography.h3,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: layout.radiusPill,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    recsScroll: {
        paddingLeft: spacing.xl,
        paddingRight: spacing.md,
        paddingBottom: spacing.sm,
    },

    // Notes section header
    notesHeader: {
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        marginBottom: spacing.xs,
    },
    notesHeaderText: {
        ...typography.label,
    },
    notesSectionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    searchChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: layout.radiusPill,
    },
    searchChipText: {
        fontSize: 11,
        fontWeight: '600',
    },
    // Recently viewed cards
    recentCard: {
        width: 120,
        padding: spacing.sm,
        borderRadius: layout.radius,
        borderWidth: 1,
        marginRight: spacing.sm,
        minHeight: 70,
        justifyContent: 'space-between',
    },
    recentCardTitle: {
        ...typography.bodySmall,
        fontWeight: '600',
        lineHeight: 17,
    },
    recentCardTag: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 4,
    },


    // Empty state
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 80,
        paddingHorizontal: spacing.xl,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    emptyTitle: {
        ...typography.h3,
        marginBottom: spacing.sm,
    },
    emptySubtext: {
        ...typography.bodySmall,
        textAlign: 'center',
        lineHeight: 20,
    },

    // FAB
    fab: {
        position: 'absolute',
        right: spacing.lg,
        bottom: spacing.xl + 16,
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // FAB Menu
    fabMenu: {
        position: 'absolute',
        right: spacing.lg,
        bottom: spacing.xl + 16 + 70,
    },
    fabBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
    },
    fabMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: 13,
        paddingHorizontal: 18,
        borderRadius: 50,
        borderWidth: 1,
        marginBottom: 8,
        minWidth: 160,
    },

    fabMenuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
    },
    fabMenuLabel: {
        ...typography.bodySmall,
        fontWeight: '700',
    },
    decayGlowOverlay: {
        position: 'absolute',
        top: 0, left: spacing.xl, right: spacing.xl,
        bottom: 0,
        borderRadius: layout.radius,
        borderWidth: 1.5,
        zIndex: -1,
        opacity: 0.6,
    },
});

export default HomeScreen;
