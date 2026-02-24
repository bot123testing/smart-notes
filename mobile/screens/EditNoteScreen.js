import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, StyleSheet, Alert, ScrollView,
    TouchableOpacity, Modal, FlatList, ActivityIndicator,
    SafeAreaView, StatusBar,
} from 'react-native';
import api from '../services/api';

// ─── Link Note Modal ──────────────────────────────────────────────────────────

const LinkNoteModal = ({ visible, currentNoteId, alreadyLinkedIds, onClose, onLink }) => {
    const [allNotes, setAllNotes] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState(false);

    useEffect(() => {
        if (visible) {
            setSelected(new Set());
            fetchAllNotes();
        }
    }, [visible]);

    const fetchAllNotes = async () => {
        setLoading(true);
        try {
            const res = await api.get('/notes/');
            // Exclude the current note from the list
            setAllNotes(res.data.filter(n => n.id !== currentNoteId));
        } catch (e) {
            Alert.alert('Error', 'Could not load notes');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (noteId) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(noteId) ? next.delete(noteId) : next.add(noteId);
            return next;
        });
    };

    const handleConfirm = async () => {
        if (selected.size === 0) { onClose(); return; }
        setLinking(true);
        try {
            // Link each selected note one by one
            for (const targetId of selected) {
                await api.post(`/notes/${currentNoteId}/link`, { target_note_id: targetId });
            }
            onLink(); // tell parent to refresh
            onClose();
        } catch (e) {
            Alert.alert('Error', 'Could not link notes');
        } finally {
            setLinking(false);
        }
    };

    const renderNote = ({ item }) => {
        const isLinked = alreadyLinkedIds.includes(item.id);
        const isSelected = selected.has(item.id);

        return (
            <TouchableOpacity
                style={[
                    styles.modalRow,
                    isSelected && styles.modalRowSelected,
                    isLinked && styles.modalRowLinked,
                ]}
                onPress={() => !isLinked && toggleSelect(item.id)}
                disabled={isLinked}
                activeOpacity={isLinked ? 1 : 0.7}
            >
                <View style={styles.modalRowLeft}>
                    <Text style={[styles.modalRowTitle, isLinked && styles.modalRowTitleLinked]}>
                        {item.title}
                    </Text>
                    {item.content ? (
                        <Text numberOfLines={1} style={styles.modalRowPreview}>{item.content}</Text>
                    ) : null}
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected, isLinked && styles.checkboxLinked]}>
                    {isLinked
                        ? <Text style={styles.checkMark}>✓</Text>
                        : isSelected
                            ? <Text style={styles.checkMark}>✓</Text>
                            : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.modalContainer}>
                <StatusBar barStyle="dark-content" />

                {/* Header */}
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Link Notes</Text>
                    <TouchableOpacity
                        onPress={handleConfirm}
                        style={[styles.modalDoneBtn, (linking || selected.size === 0) && styles.modalDoneBtnDisabled]}
                        disabled={linking}
                    >
                        {linking
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.modalDoneText}>
                                Link{selected.size > 0 ? ` (${selected.size})` : ''}
                            </Text>
                        }
                    </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                    Select notes to link. Already linked notes are shown greyed out.
                </Text>

                {loading ? (
                    <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 40 }} />
                ) : allNotes.length === 0 ? (
                    <Text style={styles.modalEmpty}>No other notes to link.</Text>
                ) : (
                    <FlatList
                        data={allNotes}
                        keyExtractor={item => item.id}
                        renderItem={renderNote}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                        ItemSeparatorComponent={() => <View style={styles.separator} />}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

// ─── Linked Note Chip ─────────────────────────────────────────────────────────

const LinkedChip = ({ linkedNote, onPress, onUnlink }) => (
    <TouchableOpacity style={styles.chip} onPress={onPress} onLongPress={onUnlink} activeOpacity={0.75}>
        <Text style={styles.chipIcon}>🔗</Text>
        <Text style={styles.chipText} numberOfLines={1}>{linkedNote.title}</Text>
        <TouchableOpacity onPress={onUnlink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.chipClose}>×</Text>
        </TouchableOpacity>
    </TouchableOpacity>
);

// ─── EditNoteScreen ───────────────────────────────────────────────────────────

const EditNoteScreen = ({ route, navigation }) => {
    const { note: initialNote } = route.params;

    const [title, setTitle] = useState(initialNote.title);
    const [content, setContent] = useState(initialNote.content);
    const [linkedNotes, setLinkedNotes] = useState(initialNote.linked_notes || []);
    const [linkedNoteIds, setLinkedNoteIds] = useState(initialNote.linked_note_ids || []);
    const [suggestedLinks, setSuggestedLinks] = useState(initialNote.suggested_links || []);
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [linkingId, setLinkingId] = useState(null); // tracks which suggestion is being confirmed

    // Update header title
    useEffect(() => {
        navigation.setOptions({ title: title || 'Edit Note' });
    }, [title]);

    const refreshNote = useCallback(async () => {
        try {
            const res = await api.get(`/notes/${initialNote.id}`);
            const fresh = res.data;
            setLinkedNotes(fresh.linked_notes || []);
            setLinkedNoteIds(fresh.linked_note_ids || []);
            // Filter out suggestions already manually linked
            const currentLinkedIds = fresh.linked_note_ids || [];
            setSuggestedLinks(
                (fresh.suggested_links || []).filter(s => !currentLinkedIds.includes(s.note_id))
            );
        } catch (e) {
            console.error('Could not refresh note links', e);
        }
    }, [initialNote.id]);

    // On mount: fetch full note silently.
    // This serves two purposes:
    //   1. Logs a 'view' event on the backend (GET /notes/{id} triggers log_activity)
    //   2. Hydrates linked_notes in case the note was opened via HomeScreen
    //      (which passes data via route.params without an API call)
    useEffect(() => {
        refreshNote();
    }, []);

    const handleSave = async () => {
        if (!title.trim() || !content.trim()) {
            Alert.alert('Error', 'Please fill in both title and content');
            return;
        }
        setSaving(true);
        try {
            await api.put(`/notes/${initialNote.id}`, {
                title,
                content,
                tags: initialNote.tags || [],
                linked_note_ids: linkedNoteIds,
            });
            navigation.goBack();
        } catch (error) {
            Alert.alert('Error', 'Could not save note');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleUnlink = (targetNoteId, targetTitle) => {
        Alert.alert('Remove Link', `Unlink "${targetTitle}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/notes/${initialNote.id}/unlink`, {
                            data: { target_note_id: targetNoteId },
                        });
                        await refreshNote();
                    } catch (e) {
                        Alert.alert('Error', 'Could not remove link');
                    }
                },
            },
        ]);
    };

    const handleConfirmLink = async (suggestion) => {
        setLinkingId(suggestion.note_id);
        try {
            await api.post(`/notes/${initialNote.id}/link`, { target_note_id: suggestion.note_id });
            // Remove from suggestions immediately (optimistic) then refresh for truth
            setSuggestedLinks(prev => prev.filter(s => s.note_id !== suggestion.note_id));
            await refreshNote();
        } catch (e) {
            Alert.alert('Error', 'Could not link note');
        } finally {
            setLinkingId(null);
        }
    };

    const handleDismissSuggestion = (noteId) => {
        setSuggestedLinks(prev => prev.filter(s => s.note_id !== noteId));
    };

    const handleOpenLinkedNote = async (linkedNote) => {
        try {
            const res = await api.get(`/notes/${linkedNote.id}`);
            navigation.push('EditNote', { note: res.data });
        } catch (e) {
            // Fallback with partial data if fetch fails
            navigation.push('EditNote', {
                note: {
                    id: linkedNote.id,
                    title: linkedNote.title,
                    content: '',
                    tags: [],
                    linked_notes: [],
                    linked_note_ids: [],
                },
            });
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Title */}
                <TextInput
                    style={styles.inputTitle}
                    placeholder="Title"
                    value={title}
                    onChangeText={setTitle}
                />

                {/* Content */}
                <TextInput
                    style={styles.inputContent}
                    placeholder="Write your note..."
                    value={content}
                    onChangeText={setContent}
                    multiline
                    textAlignVertical="top"
                />

                {/* Suggested Links */}
                {suggestedLinks.length > 0 && (
                    <View style={styles.suggestedSection}>
                        <View style={styles.suggestedHeader}>
                            <Text style={styles.suggestedLabel}>✨ Suggested Links</Text>
                            <Text style={styles.suggestedSub}>Based on similar content</Text>
                        </View>
                        {suggestedLinks.map(s => (
                            <View key={s.note_id} style={styles.suggestionRow}>
                                <View style={styles.suggestionLeft}>
                                    <Text style={styles.suggestionTitle} numberOfLines={1}>{s.title}</Text>
                                    {/* Similarity bar */}
                                    <View style={styles.scoreBarBg}>
                                        <View style={[styles.scoreBarFill, { width: `${Math.round(s.score * 100)}%` }]} />
                                    </View>
                                    <Text style={styles.scoreText}>{Math.round(s.score * 100)}% similar</Text>
                                </View>
                                <View style={styles.suggestionActions}>
                                    <TouchableOpacity
                                        style={[styles.linkConfirmBtn, linkingId === s.note_id && styles.linkConfirmBtnDisabled]}
                                        onPress={() => handleConfirmLink(s)}
                                        disabled={linkingId === s.note_id}
                                    >
                                        {linkingId === s.note_id
                                            ? <ActivityIndicator size="small" color="#fff" />
                                            : <Text style={styles.linkConfirmText}>Link</Text>
                                        }
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.dismissBtn}
                                        onPress={() => handleDismissSuggestion(s.note_id)}
                                    >
                                        <Text style={styles.dismissText}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Linked Notes */}
                {linkedNotes.length > 0 && (
                    <View style={styles.linkedSection}>
                        <Text style={styles.linkedLabel}>Linked Notes</Text>
                        <View style={styles.chipsRow}>
                            {linkedNotes.map(ln => (
                                <LinkedChip
                                    key={ln.id}
                                    linkedNote={ln}
                                    onPress={() => handleOpenLinkedNote(ln)}
                                    onUnlink={() => handleUnlink(ln.id, ln.title)}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {/* Link Note Button */}
                <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => setModalVisible(true)}
                >
                    <Text style={styles.linkBtnIcon}>🔗</Text>
                    <Text style={styles.linkBtnText}>Link Note</Text>
                </TouchableOpacity>

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveBtnText}>Save Changes</Text>
                    }
                </TouchableOpacity>
            </ScrollView>

            {/* Modal */}
            <LinkNoteModal
                visible={modalVisible}
                currentNoteId={initialNote.id}
                alreadyLinkedIds={linkedNoteIds}
                onClose={() => setModalVisible(false)}
                onLink={refreshNote}
            />
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollContent: { padding: 20, paddingBottom: 40 },

    inputTitle: {
        fontSize: 22, fontWeight: '700', marginBottom: 16,
        borderBottomWidth: 1.5, borderBottomColor: '#e0e0e0',
        paddingBottom: 8, color: '#111',
    },
    inputContent: {
        fontSize: 16, lineHeight: 24, color: '#333',
        minHeight: 160, marginBottom: 24,
    },

    // Suggested links section
    suggestedSection: {
        marginBottom: 20,
        backgroundColor: '#fefce8',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fde68a',
        padding: 12,
    },
    suggestedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
    suggestedLabel: { fontSize: 13, fontWeight: '800', color: '#92400e' },
    suggestedSub: { fontSize: 11, color: '#b45309' },
    suggestionRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#fde68a',
    },
    suggestionLeft: { flex: 1, marginRight: 10 },
    suggestionTitle: { fontSize: 13, fontWeight: '600', color: '#1c1917', marginBottom: 4 },
    scoreBarBg: { height: 4, backgroundColor: '#fde68a', borderRadius: 2, marginBottom: 2 },
    scoreBarFill: { height: 4, backgroundColor: '#f59e0b', borderRadius: 2 },
    scoreText: { fontSize: 10, color: '#92400e' },
    suggestionActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    linkConfirmBtn: {
        backgroundColor: '#6366f1', borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 6, minWidth: 46, alignItems: 'center',
    },
    linkConfirmBtnDisabled: { backgroundColor: '#a5b4fc' },
    linkConfirmText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    dismissBtn: { padding: 4 },
    dismissText: { fontSize: 16, color: '#b45309' },

    // Linked notes section
    linkedSection: { marginBottom: 20 },
    linkedLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#eef2ff', borderRadius: 20,
        paddingVertical: 6, paddingHorizontal: 12,
        borderWidth: 1, borderColor: '#c7d2fe', maxWidth: 220,
    },
    chipIcon: { fontSize: 13 },
    chipText: { fontSize: 13, color: '#4338ca', fontWeight: '600', flexShrink: 1 },
    chipClose: { fontSize: 18, color: '#818cf8', lineHeight: 20, marginLeft: 2 },

    // Link button
    linkBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 12, borderRadius: 10,
        borderWidth: 1.5, borderColor: '#c7d2fe', borderStyle: 'dashed',
        backgroundColor: '#f8f9ff', marginBottom: 16,
    },
    linkBtnIcon: { fontSize: 16 },
    linkBtnText: { fontSize: 15, color: '#4338ca', fontWeight: '600' },

    // Save button
    saveBtn: {
        backgroundColor: '#007bff', borderRadius: 10,
        paddingVertical: 14, alignItems: 'center',
    },
    saveBtnDisabled: { backgroundColor: '#93c5fd' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#fff' },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
    modalCancelBtn: { minWidth: 60 },
    modalCancelText: { fontSize: 16, color: '#666' },
    modalDoneBtn: {
        backgroundColor: '#007bff', borderRadius: 8,
        paddingHorizontal: 14, paddingVertical: 7, minWidth: 60, alignItems: 'center',
    },
    modalDoneBtnDisabled: { backgroundColor: '#93c5fd' },
    modalDoneText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    modalSubtitle: { fontSize: 13, color: '#999', paddingHorizontal: 16, paddingVertical: 10 },
    modalEmpty: { textAlign: 'center', marginTop: 50, color: '#aaa', fontSize: 15 },

    modalRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 4,
        borderRadius: 8,
    },
    modalRowSelected: { backgroundColor: '#eef2ff' },
    modalRowLinked: { opacity: 0.5 },
    modalRowLeft: { flex: 1, marginRight: 12 },
    modalRowTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
    modalRowTitleLinked: { color: '#888' },
    modalRowPreview: { fontSize: 13, color: '#999' },

    checkbox: {
        width: 24, height: 24, borderRadius: 6,
        borderWidth: 2, borderColor: '#d1d5db',
        justifyContent: 'center', alignItems: 'center',
    },
    checkboxSelected: { backgroundColor: '#007bff', borderColor: '#007bff' },
    checkboxLinked: { backgroundColor: '#10b981', borderColor: '#10b981' },
    checkMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
    separator: { height: 1, backgroundColor: '#f3f4f6' },
});

export default EditNoteScreen;
