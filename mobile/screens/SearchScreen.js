import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, FlatList,
    TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
    Platform, Keyboard
} from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Search, X, FileText, ArrowRight } from 'lucide-react-native';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { typography, spacing, layout, shadows } from '../theme/theme';

const DEBOUNCE_MS = 400;

const SearchScreen = ({ navigation }) => {
    const { theme } = useTheme();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    const doSearch = useCallback(async (q) => {
        if (!q.trim()) {
            setResults([]);
            setSearched(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        setSearched(true);
        try {
            const res = await api.get('/search', { params: { q: q.trim() } });
            setResults(res.data || []);
        } catch (e) {
            console.error('Search error:', e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleChangeText = (text) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(text), DEBOUNCE_MS);
    };

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setSearched(false);
        inputRef.current?.focus();
    };

    const openNote = (note) => {
        Keyboard.dismiss();
        navigation.navigate('EditNote', { note });
    };

    const renderResult = ({ item, index }) => (
        <Animated.View
            entering={FadeInDown.delay(index * 50).springify()}
            layout={LinearTransition.springify()}
        >
            <TouchableOpacity
                style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => openNote(item)}
                activeOpacity={0.75}
            >
                <View style={[styles.resultIcon, { backgroundColor: theme.primaryLight }]}>
                    <FileText size={16} color={theme.primary} />
                </View>
                <View style={styles.resultText}>
                    <Text style={[styles.resultTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    {item.content ? (
                        <Text style={[styles.resultSnippet, { color: theme.textSecondary }]} numberOfLines={2}>
                            {item.content}
                        </Text>
                    ) : null}
                    {item.tags && item.tags.length > 0 && (
                        <View style={styles.tagRow}>
                            {item.tags.slice(0, 4).map(tag => (
                                <View key={tag} style={[styles.tagChip, { backgroundColor: theme.primaryLight }]}>
                                    <Text style={[styles.tagText, { color: theme.primary }]}>#{tag}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
                <ArrowRight size={16} color={theme.textTertiary} />
            </TouchableOpacity>
        </Animated.View>
    );

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: theme.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Search Bar */}
            <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.sm }]}>
                <Search size={18} color={loading ? theme.primary : theme.textTertiary} />
                <TextInput
                    ref={inputRef}
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Search notes, tags, content..."
                    placeholderTextColor={theme.textTertiary}
                    value={query}
                    onChangeText={handleChangeText}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={() => doSearch(query)}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X size={16} color={theme.textTertiary} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Results */}
            {loading && (
                <View style={styles.centeredMsg}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={[styles.hintText, { color: theme.textTertiary }]}>Searching...</Text>
                </View>
            )}

            {!loading && searched && results.length === 0 && (
                <View style={styles.centeredMsg}>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No results for "{query}"</Text>
                    <Text style={[styles.hintText, { color: theme.textTertiary }]}>
                        Try different keywords or check your spelling
                    </Text>
                </View>
            )}

            {!loading && !searched && (
                <View style={styles.centeredMsg}>
                    <Search size={40} color={theme.border} />
                    <Text style={[styles.hintText, { color: theme.textTertiary, marginTop: spacing.md }]}>
                        Results are ranked by ElasticSearch relevance
                    </Text>
                </View>
            )}

            {!loading && results.length > 0 && (
                <>
                    <Text style={[styles.resultsCount, { color: theme.textTertiary }]}>
                        {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
                    </Text>
                    <FlatList
                        data={results}
                        keyExtractor={item => item.id}
                        renderItem={renderResult}
                        contentContainerStyle={styles.list}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    />
                </>
            )}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        margin: spacing.md,
        paddingHorizontal: spacing.md,
        height: 50,
        borderRadius: layout.radius,
        borderWidth: 1.5,
    },
    input: {
        flex: 1,
        ...typography.body,
        padding: 0,
    },
    centeredMsg: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
        ...typography.h3,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    hintText: {
        ...typography.bodySmall,
        textAlign: 'center',
    },
    resultsCount: {
        ...typography.label,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.sm,
    },
    list: {
        paddingHorizontal: spacing.md,
        paddingBottom: 40,
    },
    resultCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: layout.radius,
        borderWidth: 1,
        marginBottom: spacing.sm,
    },
    resultIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultText: {
        flex: 1,
        gap: 4,
    },
    resultTitle: {
        ...typography.bodySmall,
        fontWeight: '600',
    },
    resultSnippet: {
        fontSize: 12,
        lineHeight: 16,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 2,
    },
    tagChip: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '700',
    },
});

export default SearchScreen;
