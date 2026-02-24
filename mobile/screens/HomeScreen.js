import React, { useState, useContext, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
    RefreshControl, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

// ── Decay colour helper ───────────────────────────────────────────────────────
// decay 0.0→0.3 = green, 0.3→0.6 = amber, 0.6→1.0 = red
const decayColor = (decay) => {
    if (decay >= 0.6) return '#ef4444';   // red
    if (decay >= 0.3) return '#f59e0b';   // amber
    return '#22c55e';                      // green
};

// ── Recommendation Card ───────────────────────────────────────────────────────
const RecommendationCard = ({ rec, onPress }) => {
    const pct = Math.round(rec.memory_decay * 100);
    const color = decayColor(rec.memory_decay);

    return (
        <TouchableOpacity style={styles.recCard} onPress={onPress} activeOpacity={0.8}>
            {/* Decay bar fills left edge */}
            <View style={[styles.recDecayBar, { backgroundColor: color, height: `${pct}%` }]} />

            <View style={styles.recBody}>
                <Text style={styles.recTitle} numberOfLines={1}>{rec.title}</Text>

                {/* Decay pill */}
                <View style={[styles.decayPill, { backgroundColor: color + '22', borderColor: color }]}>
                    <Text style={[styles.decayPillText, { color }]}>{pct}% forgotten</Text>
                </View>

                {/* Mini stats row */}
                <View style={styles.recStatsRow}>
                    <Text style={styles.recStat}>⚡ {rec.importance_score.toFixed(0)} score</Text>
                    <Text style={styles.recStat}>🔗 {rec.linked_note_count} links</Text>
                    {rec.last_accessed
                        ? <Text style={styles.recStat}>
                            👁 {Math.round(
                                (Date.now() - new Date(rec.last_accessed).getTime()) / 86400000
                            )}d ago
                        </Text>
                        : <Text style={styles.recStat}>👁 never</Text>
                    }
                </View>
            </View>
        </TouchableOpacity>
    );
};

// ── HomeScreen ────────────────────────────────────────────────────────────────
const HomeScreen = ({ navigation }) => {
    const [notes, setNotes] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [recsLoading, setRecsLoading] = useState(false);
    const { signOut } = useContext(AuthContext);

    const fetchNotes = async () => {
        try {
            const response = await api.get('/notes/');
            setNotes(response.data);
        } catch (error) {
            console.error('Fetch notes error:', error);
        }
    };

    const fetchRecommendations = async () => {
        setRecsLoading(true);
        try {
            const res = await api.get('/notes/recommendations');
            // Only show notes with meaningful decay (>5%) — filter noise
            const meaningful = res.data.notes.filter(r => r.memory_decay > 0.05);
            setRecommendations(meaningful);
        } catch (error) {
            console.error('Fetch recommendations error:', error);
        } finally {
            setRecsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchNotes();
            fetchRecommendations();
        }, [])
    );

    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingRight: 8 }}>
                    <TouchableOpacity onPress={() => navigation.navigate('Graph')}>
                        <Text style={{ color: '#6366f1', fontWeight: 'bold' }}>🧠 Graph</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSignOut}>
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            ),
        });
    }, [navigation]);

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
        ]);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchNotes(), fetchRecommendations()]);
        setRefreshing(false);
    }, []);

    const handleDelete = (noteId) => {
        Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/notes/${noteId}`);
                        setNotes((prev) => prev.filter((n) => n.id !== noteId));
                        setRecommendations((prev) => prev.filter((r) => r.note_id !== noteId));
                    } catch (error) {
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

    const renderNote = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('EditNote', { note: item })}
            onLongPress={() => handleDelete(item.id)}
        >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.cardContent}>{item.content}</Text>
            {item.tags && item.tags.length > 0 && (
                <View style={styles.tagsRow}>
                    {item.tags.map((tag, i) => (
                        <View key={i} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                        </View>
                    ))}
                </View>
            )}
            {item.linked_notes && item.linked_notes.length > 0 && (
                <Text style={styles.linkBadge}>🔗 {item.linked_notes.length} linked</Text>
            )}
            <Text style={styles.hintText}>Tap to edit · Long press to delete</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={notes}
                renderItem={renderNote}
                keyExtractor={(item) => item.id}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007bff" />
                }
                ListHeaderComponent={
                    recommendations.length > 0 ? (
                        <View style={styles.recsSection}>
                            <View style={styles.recsSectionHeader}>
                                <Text style={styles.recsSectionTitle}>🧠 Recommended for Revision</Text>
                                <Text style={styles.recsSectionSub}>{recommendations.length} notes need review</Text>
                            </View>

                            {recsLoading ? (
                                <ActivityIndicator size="small" color="#7c3aed" style={{ marginVertical: 12 }} />
                            ) : (
                                <ScrollView
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
                                </ScrollView>
                            )}
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    <Text style={styles.emptyText}>No notes yet. Tap + to add one!</Text>
                }
            />
            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('AddNote')}
            >
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
        </View>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },

    // Note cards
    card: {
        backgroundColor: 'white', padding: 15, borderRadius: 10,
        marginHorizontal: 10, marginBottom: 10,
        elevation: 2, shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
    },
    cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
    cardContent: { color: '#666', marginBottom: 8 },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
    tag: { backgroundColor: '#e8f0fe', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
    tagText: { fontSize: 12, color: '#1a73e8' },
    linkBadge: { fontSize: 12, color: '#6366f1', marginBottom: 4 },
    hintText: { fontSize: 11, color: '#bbb', marginTop: 4 },

    // Recommendations section
    recsSection: {
        backgroundColor: '#faf5ff',
        marginBottom: 10,
        paddingTop: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#e9d5ff',
    },
    recsSectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', paddingHorizontal: 14, marginBottom: 10,
    },
    recsSectionTitle: { fontSize: 15, fontWeight: '800', color: '#6d28d9' },
    recsSectionSub: { fontSize: 12, color: '#a78bfa' },
    recsScroll: { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },

    // Individual recommendation card
    recCard: {
        width: 160, height: 130,
        backgroundColor: '#fff',
        borderRadius: 14, overflow: 'hidden',
        flexDirection: 'row',
        elevation: 3,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6,
        borderWidth: 1, borderColor: '#ede9fe',
    },
    recDecayBar: {
        width: 5,
        alignSelf: 'flex-end',   // grows from bottom like a fill meter
        borderTopRightRadius: 3,
    },
    recBody: { flex: 1, padding: 10, justifyContent: 'space-between' },
    recTitle: { fontSize: 13, fontWeight: '700', color: '#1e1b4b', lineHeight: 18 },

    decayPill: {
        alignSelf: 'flex-start',
        borderRadius: 8, borderWidth: 1,
        paddingHorizontal: 6, paddingVertical: 2, marginVertical: 4,
    },
    decayPillText: { fontSize: 11, fontWeight: '700' },

    recStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    recStat: { fontSize: 10, color: '#6b7280' },

    // FAB & header
    fab: {
        position: 'absolute', right: 20, bottom: 20,
        backgroundColor: '#007bff', width: 56, height: 56,
        borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 5,
    },
    fabText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#888' },
    signOutBtn: { marginRight: 10 },
    signOutText: { color: '#e53935', fontWeight: '600' },
});

export default HomeScreen;
