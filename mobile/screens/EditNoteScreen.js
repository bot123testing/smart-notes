import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TextInput, StyleSheet, Alert, ScrollView,
    TouchableOpacity, Modal, FlatList, ActivityIndicator,
    SafeAreaView, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Link2, Sparkles, Check, CheckCircle2, ChevronRight, X, Plus, Network, Tag, Calendar, Search } from 'lucide-react-native';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { colors, typography, spacing, layout, shadows } from '../theme/theme';

// ─── Link Note Modal ──────────────────────────────────────────────────────────
const LinkNoteModal = ({ visible, currentNoteId, alreadyLinkedIds, onClose, onLink }) => {
    const { theme } = useTheme();

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
            for (const targetId of selected) {
                await api.post(`/notes/${currentNoteId}/link`, { target_note_id: targetId });
            }
            onLink();
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
                    { borderBottomColor: theme.border },
                    isSelected && { backgroundColor: theme.primaryLight + '40' },
                    isLinked && { opacity: 0.5 },
                ]}
                onPress={() => !isLinked && toggleSelect(item.id)}
                disabled={isLinked}
                activeOpacity={0.7}
            >
                <View style={styles.modalRowLeft}>
                    <Text style={[styles.modalRowTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    {item.content ? (
                        <Text numberOfLines={1} style={[styles.modalRowPreview, { color: theme.textTertiary }]}>
                            {item.content}
                        </Text>
                    ) : null}
                </View>

                <View style={styles.modalCheckboxArea}>
                    {isLinked ? (
                        <CheckCircle2 size={20} color={theme.success} />
                    ) : isSelected ? (
                        <View style={[styles.checkbox, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                            <Check size={14} color="#FFF" />
                        </View>
                    ) : (
                        <View style={[styles.checkbox, { borderColor: theme.border }]} />
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
                {/* Header */}
                <View style={[styles.modalHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
                    <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
                        <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Link Notes</Text>
                    <TouchableOpacity
                        onPress={handleConfirm}
                        style={[
                            styles.modalDoneBtn,
                            { backgroundColor: theme.primary },
                            (linking || selected.size === 0) && { opacity: 0.5 }
                        ]}
                        disabled={linking || selected.size === 0}
                    >
                        {linking ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.modalDoneText}>
                                Link{selected.size > 0 ? ` (${selected.size})` : ''}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: spacing.xxl }} />
                ) : allNotes.length === 0 ? (
                    <Text style={[styles.modalEmpty, { color: theme.textTertiary }]}>No other notes to link.</Text>
                ) : (
                    <FlatList
                        data={allNotes}
                        keyExtractor={item => item.id}
                        renderItem={renderNote}
                        contentContainerStyle={{ paddingBottom: spacing.xxl }}
                    />
                )}
            </View>
        </Modal>
    );
};

// ─── Linked Note Chip ─────────────────────────────────────────────────────────
const LinkedChip = ({ linkedNote, onPress, onUnlink, theme }) => (
    <Animated.View layout={Layout.springify()}>
        <TouchableOpacity
            style={[styles.chip, { backgroundColor: theme.surfaceHighlight, borderColor: theme.border }]}
            onPress={onPress}
            onLongPress={onUnlink}
            activeOpacity={0.7}
        >
            <Link2 size={14} color={theme.primary} />
            <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                {linkedNote.title}
            </Text>
            <TouchableOpacity onPress={onUnlink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={14} color={theme.textTertiary} />
            </TouchableOpacity>
        </TouchableOpacity>
    </Animated.View>
);

// ─── EditNoteScreen ───────────────────────────────────────────────────────────
const EditNoteScreen = ({ route, navigation }) => {
    const { note: initialNote } = route.params;
    const { theme, isDark } = useTheme();

    const [title, setTitle] = useState(initialNote.title);
    const [content, setContent] = useState(initialNote.content);
    const [tags, setTags] = useState(initialNote.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [generatingTags, setGeneratingTags] = useState(false);
    const [linkedNotes, setLinkedNotes] = useState(initialNote.linked_notes || []);
    const [linkedNoteIds, setLinkedNoteIds] = useState(initialNote.linked_note_ids || []);
    const [suggestedLinks, setSuggestedLinks] = useState(initialNote.suggested_links || []);
    const [similarNotes, setSimilarNotes] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [linkingId, setLinkingId] = useState(null);

    const contentInputRef = useRef(null);
    const tagInputRef = useRef(null);

    // Custom Header
    useEffect(() => {
        navigation.setOptions({
            headerShown: true,
            headerTitle: '',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerLeft: () => (
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: spacing.sm, marginLeft: -spacing.sm }}>
                    <ArrowLeft size={24} color={theme.text} />
                </TouchableOpacity>
            ),
            headerRight: () => (
                <TouchableOpacity
                    style={[
                        styles.headerSaveBtn,
                        { backgroundColor: title.trim() ? theme.primary : theme.border }
                    ]}
                    onPress={handleSave}
                    disabled={saving || !title.trim()}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={[
                            styles.headerSaveText,
                            { color: title.trim() ? '#fff' : theme.textTertiary }
                        ]}>
                            Save
                        </Text>
                    )}
                </TouchableOpacity>
            ),
        });
    }, [navigation, title, content, tags, tagInput, linkedNoteIds, saving, theme]);

    const refreshNote = useCallback(async () => {
        try {
            const res = await api.get(`/notes/${initialNote.id}`);
            const fresh = res.data;
            setLinkedNotes(fresh.linked_notes || []);
            setLinkedNoteIds(fresh.linked_note_ids || []);
            const currentLinkedIds = fresh.linked_note_ids || [];
            setSuggestedLinks(
                (fresh.suggested_links || []).filter(s => !currentLinkedIds.includes(s.note_id))
            );
        } catch (e) {
            console.error('Could not refresh note links', e);
        }
    }, [initialNote.id]);

    const fetchSimilarNotes = useCallback(async () => {
        try {
            const res = await api.get(`/notes/similar/${initialNote.id}`);
            setSimilarNotes((res.data || []).filter(n => n.id !== initialNote.id));
        } catch (e) {
            // Similar notes is optional; silent failure is OK
            console.log('Similar notes not available:', e.message);
        }
    }, [initialNote.id]);

    useEffect(() => {
        refreshNote();
        fetchSimilarNotes();
    }, []);

    const addTag = () => {
        const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
        if (raw && !tags.includes(raw)) {
            setTags(prev => [...prev, raw]);
        }
        setTagInput('');
    };

    const removeTag = (tag) => setTags(prev => prev.filter(t => t !== tag));

    const generateMagicTags = async () => {
        if (!title.trim() && !content.trim()) {
            Alert.alert('Empty Note', 'Please add a title or some content first.');
            return;
        }

        setGeneratingTags(true);
        try {
            const res = await api.post('/ai/magic-tags', {
                title: title.trim(),
                content: content.trim()
            });

            const newTags = res.data || [];
            if (newTags.length > 0) {
                setTags(prev => {
                    const merged = [...prev];
                    newTags.forEach(t => {
                        if (!merged.includes(t)) Object.isFrozen(merged) ? null : merged.push(t);
                    });
                    return merged;
                });
            } else {
                Alert.alert('No tags found', 'The AI could not generate any tags for this note.');
            }
        } catch (error) {
            console.error('Magic Tags Error:', error);
            Alert.alert('AI Error', 'Failed to generate magic tags. Check your API Key.');
        } finally {
            setGeneratingTags(false);
        }
    };

    const handleSave = async () => {
        if (!title.trim() || !content.trim()) {
            Alert.alert('Incomplete', 'Please provide both a title and content.');
            return;
        }
        setSaving(true);

        // Grab any pending tag that wasn't committed yet
        const finalTags = [...tags];
        const pendingTag = tagInput.trim().replace(/^#/, '').toLowerCase();
        if (pendingTag && !finalTags.includes(pendingTag)) {
            finalTags.push(pendingTag);
        }

        console.log(`[EditNote] Sending payload -> id: ${initialNote.id}, title: ${title}, tags: ${JSON.stringify(finalTags)}`);

        try {
            await api.put(`/notes/${initialNote.id}`, {
                title,
                content,
                tags: finalTags,
                linked_note_ids: linkedNoteIds,
            });
            navigation.goBack();
        } catch (error) {
            Alert.alert('Error', 'Could not save note');
        } finally {
            setSaving(false);
        }
    };

    const handleUnlink = (targetNoteId, targetTitle) => {
        Alert.alert('Unlink Note', `Remove connection to "${targetTitle}"?`, [
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
            Alert.alert('Error', 'Could not open linked note');
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: theme.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Clean Title Input */}
                <TextInput
                    style={[styles.inputTitle, { color: theme.text }]}
                    placeholder="Note Title"
                    placeholderTextColor={theme.textTertiary}
                    value={title}
                    onChangeText={setTitle}
                    multiline
                    scrollEnabled={false}
                    onSubmitEditing={() => contentInputRef.current?.focus()}
                />

                <Animated.View entering={FadeIn.delay(100).duration(400)}>
                    {/* Clean Content Input */}
                    <TextInput
                        ref={contentInputRef}
                        style={[styles.inputContent, { color: theme.textSecondary }]}
                        placeholder="Start typing..."
                        placeholderTextColor={theme.textTertiary}
                        value={content}
                        onChangeText={setContent}
                        multiline
                        textAlignVertical="top"
                        scrollEnabled={false}
                    />
                </Animated.View>

                {/* Tag input area */}
                <Animated.View entering={FadeInDown.delay(160)} style={[styles.tagSection, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                    <View style={styles.tagHeaderRow}>
                        <View style={styles.tagSectionHeader}>
                            <Tag size={14} color={theme.textSecondary} />
                            <Text style={[styles.tagSectionLabel, { color: theme.textSecondary }]}>Tags</Text>
                        </View>
                        <TouchableOpacity
                            onPress={generateMagicTags}
                            disabled={generatingTags}
                            style={[styles.aiTagButton, { backgroundColor: theme.primaryLight }]}
                        >
                            {generatingTags ? (
                                <ActivityIndicator size="small" color={theme.primary} />
                            ) : (
                                <>
                                    <Sparkles size={14} color={theme.primary} />
                                    <Text style={[styles.aiTagText, { color: theme.primary }]}>AI Magic Tag</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.tagsRow}>
                        {tags.map(tag => (
                            <Animated.View key={tag} layout={Layout.springify()} entering={FadeIn.springify()}
                                style={[styles.staticTag, { backgroundColor: theme.primaryLight }]}
                            >
                                <Text style={[styles.staticTagText, { color: theme.primary }]}>#{tag}</Text>
                                <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                    <X size={11} color={theme.primary} />
                                </TouchableOpacity>
                            </Animated.View>
                        ))}
                        <TextInput
                            ref={tagInputRef}
                            style={[styles.tagInlineInput, { color: theme.text }]}
                            placeholder={tags.length === 0 ? 'Add tags...' : ''}
                            placeholderTextColor={theme.textTertiary}
                            value={tagInput}
                            onChangeText={setTagInput}
                            onBlur={addTag}
                            onSubmitEditing={addTag}
                            onKeyPress={({ nativeEvent }) => {
                                if (nativeEvent.key === ',' || nativeEvent.key === ' ') addTag();
                                else if (nativeEvent.key === 'Backspace' && tagInput === '' && tags.length > 0) removeTag(tags[tags.length - 1]);
                            }}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                </Animated.View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                {/* Linked Notes Area */}
                <Animated.View entering={SlideInDown.delay(300).springify()} style={styles.linksContainer}>
                    <View style={styles.linksHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Connections</Text>
                        <TouchableOpacity
                            style={[styles.addLinkIconBtn, { backgroundColor: theme.surfaceHighlight }]}
                            onPress={() => setModalVisible(true)}
                        >
                            <Plus size={16} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    {linkedNotes.length > 0 ? (
                        <View style={styles.chipsRow}>
                            {linkedNotes.map(ln => (
                                <LinkedChip
                                    key={ln.id}
                                    linkedNote={ln}
                                    theme={theme}
                                    onPress={() => handleOpenLinkedNote(ln)}
                                    onUnlink={() => handleUnlink(ln.id, ln.title)}
                                />
                            ))}
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.emptyLinkArea, { borderColor: theme.border, backgroundColor: theme.surface }]}
                            onPress={() => setModalVisible(true)}
                        >
                            <Link2 size={20} color={theme.textTertiary} />
                            <Text style={[styles.emptyLinkText, { color: theme.textTertiary }]}>No linked notes yet</Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* Similar Notes — Neo4j graph traversal */}
                {similarNotes.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(350).springify()} style={[styles.similarSection, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                        <View style={styles.suggestedHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Network size={15} color={theme.textSecondary} />
                                <Text style={[styles.suggestedLabel, { color: theme.textSecondary }]}>Related Notes</Text>
                            </View>
                            <Text style={[styles.dimLabel, { color: theme.textTertiary }]}>via Graph</Text>
                        </View>
                        {similarNotes.slice(0, 3).map(sn => (
                            <TouchableOpacity
                                key={sn.id}
                                style={[styles.suggestionRow, { borderTopColor: theme.border }]}
                                onPress={() => navigation.push('EditNote', { note: sn })}
                                activeOpacity={0.7}
                            >
                                <View style={styles.suggestionLeft}>
                                    <Text style={[styles.suggestionTitle, { color: theme.text }]} numberOfLines={1}>{sn.title}</Text>
                                    {sn.tags && sn.tags.length > 0 && (
                                        <Text style={[styles.scoreText, { color: theme.primary }]}>#{sn.tags[0]}</Text>
                                    )}
                                </View>
                                <ChevronRight size={16} color={theme.textTertiary} />
                            </TouchableOpacity>
                        ))}
                    </Animated.View>
                )}

                {/* Suggested Links - AI Panel */}
                {suggestedLinks.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.suggestedSection, { backgroundColor: theme.surface, borderColor: theme.primaryLight }]}>
                        <View style={styles.suggestedHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Sparkles size={16} color={theme.primary} />
                                <Text style={[styles.suggestedLabel, { color: theme.primary }]}>AI Suggestions</Text>
                            </View>
                        </View>

                        {suggestedLinks.map(s => (
                            <Animated.View key={s.note_id} layout={Layout.springify()} style={[styles.suggestionRow, { borderTopColor: theme.border }]}>
                                <View style={styles.suggestionLeft}>
                                    <Text style={[styles.suggestionTitle, { color: theme.text }]} numberOfLines={1}>{s.title}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={[styles.scoreBarBg, { backgroundColor: theme.border }]}>
                                            <View style={[styles.scoreBarFill, { backgroundColor: theme.primary, width: `${Math.round(s.score * 100)}%` }]} />
                                        </View>
                                        <Text style={[styles.scoreText, { color: theme.textTertiary }]}>{Math.round(s.score * 100)}% match</Text>
                                    </View>
                                </View>
                                <View style={styles.suggestionActions}>
                                    <TouchableOpacity
                                        style={[styles.linkConfirmBtn, { backgroundColor: theme.primary }, linkingId === s.note_id && { opacity: 0.5 }]}
                                        onPress={() => handleConfirmLink(s)}
                                        disabled={linkingId === s.note_id}
                                    >
                                        {linkingId === s.note_id ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={16} color="#FFF" />}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismissSuggestion(s.note_id)}>
                                        <X size={16} color={theme.textTertiary} />
                                    </TouchableOpacity>
                                </View>
                            </Animated.View>
                        ))}
                    </Animated.View>
                )}
            </ScrollView>

            <LinkNoteModal
                visible={modalVisible}
                currentNoteId={initialNote.id}
                alreadyLinkedIds={linkedNoteIds}
                onClose={() => setModalVisible(false)}
                onLink={refreshNote}
            />
        </KeyboardAvoidingView>
    );
};


const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: spacing.xl, paddingBottom: 100 },

    // Header Btn
    headerSaveBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: layout.radiusPill,
    },
    headerSaveText: {
        fontWeight: '700',
        fontSize: 14,
    },

    // Inputs
    inputTitle: {
        ...typography.h1,
        marginBottom: spacing.lg,
        padding: 0,
    },
    inputContent: {
        ...typography.body,
        minHeight: 120,
        padding: 0,
    },

    // Tags — now editable
    tagSection: {
        marginTop: spacing.xl,
        paddingVertical: spacing.md,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    tagHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    tagSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tagSectionLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    aiTagButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    aiTagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        alignItems: 'center',
        paddingTop: spacing.sm, // Added padding to separate from header
    },
    tagInlineInput: {
        minWidth: 100,
        flex: 1,
        ...typography.bodySmall,
        padding: 0,
    },
    staticTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: layout.radiusPill,
    },
    staticTagText: {
        fontSize: 13,
        fontWeight: '600',
    },


    divider: {
        height: 1,
        marginVertical: spacing.xl,
    },

    // Links Area
    linksContainer: {
        marginBottom: spacing.xl,
    },
    linksHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionTitle: {
        ...typography.label,
        letterSpacing: 1,
    },
    addLinkIconBtn: {
        width: 28, height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: layout.radiusSmall,
        borderWidth: 1,
        maxWidth: '100%',
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
        flexShrink: 1
    },
    emptyLinkArea: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: layout.radius,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    emptyLinkText: {
        ...typography.bodySmall,
        fontWeight: '500',
    },

    // AI Suggestions Panel
    suggestedSection: {
        borderRadius: layout.radius,
        borderWidth: 1,
        padding: spacing.md,
        overflow: 'hidden',
    },
    // Similar Notes Panel (Neo4j)
    similarSection: {
        borderRadius: layout.radius,
        borderWidth: 1,
        padding: spacing.md,
        overflow: 'hidden',
        marginBottom: spacing.md,
    },
    dimLabel: {
        fontSize: 11,
        fontWeight: '500',
    },

    suggestedHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md
    },
    suggestedLabel: {
        fontSize: 14,
        fontWeight: '700'
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderTopWidth: 1,
    },
    suggestionLeft: {
        flex: 1,
        marginRight: spacing.md
    },
    suggestionTitle: {
        ...typography.bodySmall,
        fontWeight: '600',
        marginBottom: 4
    },
    scoreBarBg: {
        width: 60,
        height: 4,
        borderRadius: 2,
    },
    scoreBarFill: {
        height: 4,
        borderRadius: 2
    },
    scoreText: {
        fontSize: 10,
        fontWeight: '500',
    },
    suggestionActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'center'
    },
    linkConfirmBtn: {
        width: 32, height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dismissBtn: {
        padding: spacing.xs
    },

    // Modal
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    modalTitle: {
        ...typography.h3
    },
    modalCancelBtn: {
        minWidth: 60
    },
    modalCancelText: {
        ...typography.bodySmall
    },
    modalDoneBtn: {
        borderRadius: layout.radiusPill,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        minWidth: 60,
        alignItems: 'center',
    },
    modalDoneText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14
    },
    modalEmpty: {
        textAlign: 'center',
        marginTop: 50,
    },
    modalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderBottomWidth: 1,
    },
    modalRowLeft: {
        flex: 1,
        marginRight: spacing.md
    },
    modalRowTitle: {
        ...typography.body,
        fontWeight: '600',
        marginBottom: 2
    },
    modalRowPreview: {
        ...typography.bodySmall,
    },
    modalCheckboxArea: {
        width: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkbox: {
        width: 22, height: 22,
        borderRadius: 6,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default EditNoteScreen;
