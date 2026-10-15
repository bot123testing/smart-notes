import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, ScrollView, Alert,
    ActivityIndicator
} from 'react-native';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { ArrowLeft, Tag, X, Plus, Sparkles } from 'lucide-react-native';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { typography, spacing, layout, shadows } from '../theme/theme';
import PrimaryButton from '../components/PrimaryButton';

const AddNoteScreen = ({ navigation }) => {
    const { theme, isDark } = useTheme();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [generatingTags, setGeneratingTags] = useState(false);

    const contentRef = useRef(null);
    const tagInputRef = useRef(null);

    // Set header options
    React.useLayoutEffect(() => {
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
                    onPress={handleSave}
                    disabled={!title.trim() || saving}
                    style={[
                        styles.headerSaveBtn,
                        { backgroundColor: title.trim() ? theme.primary : theme.border }
                    ]}
                >
                    {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[styles.headerSaveText, { color: title.trim() ? '#fff' : theme.textTertiary }]}>Save</Text>
                    }
                </TouchableOpacity>
            ),
        });
    }, [navigation, title, content, tags, tagInput, saving, theme]);

    const addTag = () => {
        const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
        if (raw && !tags.includes(raw)) {
            setTags(prev => [...prev, raw]);
        }
        setTagInput('');
    };

    const removeTag = (tag) => {
        setTags(prev => prev.filter(t => t !== tag));
    };

    const handleTagInputKey = ({ nativeEvent }) => {
        if (nativeEvent.key === ',' || nativeEvent.key === ' ' || nativeEvent.key === 'Enter') {
            addTag();
        } else if (nativeEvent.key === 'Backspace' && tagInput === '' && tags.length > 0) {
            setTags(prev => prev.slice(0, -1));
        }
    };

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
                    // Merge and deduplicate
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
        if (!title.trim()) {
            Alert.alert('Title required', 'Please add a title for your note.');
            return;
        }
        setSaving(true);

        // Grab any pending tag that wasn't committed yet
        const finalTags = [...tags];
        const pendingTag = tagInput.trim().replace(/^#/, '').toLowerCase();
        if (pendingTag && !finalTags.includes(pendingTag)) {
            finalTags.push(pendingTag);
        }

        console.log(`[AddNote] Sending payload -> title: ${title}, tags: ${JSON.stringify(finalTags)}`);

        try {
            await api.post('/notes/', { title: title.trim(), content: content.trim(), tags: finalTags });
            navigation.goBack();
        } catch (error) {
            Alert.alert('Error', 'Could not save note. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: theme.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Title */}
                <TextInput
                    style={[styles.titleInput, { color: theme.text }]}
                    placeholder="Note title..."
                    placeholderTextColor={theme.textTertiary}
                    value={title}
                    onChangeText={setTitle}
                    multiline
                    scrollEnabled={false}
                    autoFocus
                    onSubmitEditing={() => contentRef.current?.focus()}
                    returnKeyType="next"
                />

                {/* Content */}
                <Animated.View entering={FadeIn.delay(100)}>
                    <TextInput
                        ref={contentRef}
                        style={[styles.contentInput, { color: theme.textSecondary }]}
                        placeholder="Write your thoughts..."
                        placeholderTextColor={theme.textTertiary}
                        value={content}
                        onChangeText={setContent}
                        multiline
                        textAlignVertical="top"
                        scrollEnabled={false}
                    />
                </Animated.View>

                {/* Tag input area */}
                <Animated.View entering={FadeInDown.delay(160)} style={[styles.tagSection, { borderTopColor: theme.border }]}>
                    <View style={styles.tagHeaderRow}>
                        <View style={styles.tagSectionHeader}>
                            <Tag size={14} color={theme.primary} />
                            <Text style={[styles.tagSectionLabel, { color: theme.textTertiary }]}>Tags</Text>
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
                            <Animated.View
                                key={tag}
                                layout={Layout.springify()}
                                entering={FadeIn.springify()}
                                style={[styles.tagPill, { backgroundColor: theme.primaryLight }]}
                            >
                                <Text style={[styles.tagPillText, { color: theme.primary }]}>#{tag}</Text>
                                <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                    <X size={12} color={theme.primary} />
                                </TouchableOpacity>
                            </Animated.View>
                        ))}

                        <TextInput
                            ref={tagInputRef}
                            style={[styles.tagInput, { color: theme.text }]}
                            placeholder={tags.length === 0 ? 'Add tags (comma to separate)...' : ''}
                            placeholderTextColor={theme.textTertiary}
                            value={tagInput}
                            onChangeText={setTagInput}
                            onKeyPress={handleTagInputKey}
                            onBlur={addTag}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                            onSubmitEditing={addTag}
                        />
                    </View>
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: {
        padding: spacing.xl,
        paddingBottom: 120,
    },
    titleInput: {
        ...typography.h1,
        marginBottom: spacing.md,
        padding: 0,
    },
    contentInput: {
        ...typography.body,
        minHeight: 140,
        padding: 0,
        lineHeight: 26,
    },
    tagSection: {
        marginTop: spacing.xl,
        paddingTop: spacing.lg,
        borderTopWidth: 1,
    },
    tagSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: spacing.sm,
    },
    tagSectionLabel: {
        ...typography.label,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        alignItems: 'center',
    },
    tagPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: layout.radiusPill,
    },
    tagPillText: {
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
    tagHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    tagInput: {
        minWidth: 120,
        flex: 1,
        ...typography.bodySmall,
        padding: 0,
    },
    headerSaveBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: layout.radiusPill,
        marginRight: spacing.xs,
    },
    headerSaveText: {
        fontWeight: '700',
        fontSize: 14,
    },
});

export default AddNoteScreen;
