'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Icons (inline SVG to avoid installing icon library) ───────────────── */
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5v14" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const LinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const SparkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);
const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* ── Tag chip component ─────────────────────────────────────────────────── */
function TagChip({ tag, onRemove }) {
  return (
    <span className="tag" style={{ cursor: onRemove ? 'default' : undefined }}>
      #{tag}
      {onRemove && (
        <button onClick={() => onRemove(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}>
          <XIcon />
        </button>
      )}
    </span>
  );
}

function formatItemDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/* ── Unified Knowledge Base List Item (Notes & PDFs together) ────────── */
function UnifiedListItem({ item, isSelected, onClick }) {
  const isDoc = item.itemType === 'document';

  return (
    <div
      onClick={onClick}
      style={{
        ...s.noteItem,
        ...(isSelected ? s.noteItemActive : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={isDoc ? s.typeBadgePdf : s.typeBadgeNote}>
          {isDoc ? '📄 PDF' : '📝 NOTE'}
        </span>
        <div style={s.noteItemTitle} title={item.title}>
          {item.title || 'Untitled'}
        </div>
      </div>

      <div style={s.noteItemSnippet}>
        {isDoc
          ? `${item.page_count} pages • ${item.chunk_count || 1} chunks • ${((item.file_size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB`
          : (item.content ? `${item.content.slice(0, 75)}${item.content.length > 75 ? '…' : ''}` : 'Empty note')}
      </div>

      <div style={s.noteItemMeta}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{formatItemDate(item.updated_at)}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.tags?.slice(0, 2).map((t) => <TagChip key={t} tag={t} />)}
          {item.linked_count > 0 && (
            <span style={s.linkBadge}><LinkIcon /> {item.linked_count}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Passage Concept Highlighting Helper ─────────────────────────── */
function renderHighlightedText(text, term) {
  if (!text) return '';
  if (!term || !term.trim()) return text;
  const cleanTerm = term.trim();
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === cleanTerm.toLowerCase() ? (
      <mark
        key={i}
        style={{
          background: 'rgba(245, 158, 11, 0.35)',
          color: '#fbbf24',
          padding: '2px 5px',
          borderRadius: 4,
          fontWeight: 700,
          border: '1px solid rgba(245, 158, 11, 0.5)'
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function Home() {
  const { userToken, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  // Landing page redirect: If unauthenticated, immediately redirect to /login
  useEffect(() => {
    if (!authLoading && !userToken) {
      router.replace('/login');
    }
  }, [userToken, authLoading, router]);

  // Theme toggle
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('webTheme') : null;
    const dark = saved !== 'light';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    const attr = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', attr);
    localStorage.setItem('webTheme', attr);
  };

  // Unified Knowledge base state
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [filterKind, setFilterKind] = useState('all'); // 'all' | 'notes' | 'documents'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loadingItems, setLoadingItems] = useState(true);

  // Quick PDF upload from sidebar
  const pdfInputRef = useRef(null);
  const [quickUploading, setQuickUploading] = useState(false);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newTags, setNewTags] = useState([]);
  const [creating, setCreating] = useState(false);

  // Selected item state (Can be a Note or a PDF Document)
  const [selected, setSelected] = useState(null);

  // Note editing state
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTagInput, setEditTagInput] = useState('');
  const [editTags, setEditTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // PDF Document details & preview state
  const [selectedDocDetails, setSelectedDocDetails] = useState(null);
  const [loadingDocDetails, setLoadingDocDetails] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [docActiveTab, setDocActiveTab] = useState('preview'); // 'preview' | 'concepts' | 'chunks'

  // PDF Document tags state
  const [docTags, setDocTags] = useState([]);
  const [docTagInput, setDocTagInput] = useState('');
  const [generatingDocTags, setGeneratingDocTags] = useState(false);

  // Deep-linking study focus state
  const [studyConcept, setStudyConcept] = useState('');
  const [studySnippet, setStudySnippet] = useState('');
  const [studyChunkId, setStudyChunkId] = useState('');

  // Cross-Source Connections (Text-Text, Text-PDF, PDF-PDF)
  const [relatedContent, setRelatedContent] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const [linkingManual, setLinkingManual] = useState(null);

  const searchDebounce = useRef(null);

  // Fetch full knowledge base (Notes + PDFs)
  const fetchKnowledgeBase = useCallback(async () => {
    if (!userToken) return;
    setLoadingItems(true);
    try {
      const [notesRes, docsRes] = await Promise.all([
        api.get('/notes/'),
        api.get('/documents/')
      ]);
      setNotes(notesRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err);
    } finally {
      setLoadingItems(false);
    }
  }, [userToken]);

  useEffect(() => {
    if (userToken) {
      fetchKnowledgeBase();
    }
  }, [userToken, fetchKnowledgeBase]);

  // Clean up PDF blob on unmount or doc switch
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) window.URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Select a Note
  const selectNote = async (note) => {
    if (pdfBlobUrl) {
      window.URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setSelectedDocDetails(null);
    setShowCreate(false);

    const noteItem = {
      ...note,
      itemType: 'note',
      linked_count: note.linked_note_ids?.length || 0,
    };
    setSelected(noteItem);
    setEditTitle(note.title);
    setEditContent(note.content || '');
    setEditTags(note.tags || []);
    setEditTagInput('');
    setSuggestions((note.suggested_links || []).filter(s => !(note.linked_note_ids || []).includes(s.note_id)));

    // Refresh fresh note detail
    try {
      const res = await api.get(`/notes/${note.id}`);
      const fresh = { ...res.data, itemType: 'note', linked_count: res.data.linked_note_ids?.length || 0 };
      setSelected(fresh);
      setEditTitle(fresh.title);
      setEditContent(fresh.content || '');
      setEditTags(fresh.tags || []);
      const linkedIds = fresh.linked_note_ids || [];
      setSuggestions((fresh.suggested_links || []).filter(s => !linkedIds.includes(s.note_id)));
    } catch { /* use current */ }

    // Fetch cross-source connections (Text-Text, Text-PDF)
    setLoadingRelated(true);
    try {
      const relRes = await api.get(`/notes/${note.id}/related_content`);
      setRelatedContent(relRes.data.items || []);
    } catch {
      setRelatedContent([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Select a PDF Document
  const selectDocument = async (doc, initialTab = 'preview') => {
    if (pdfBlobUrl) {
      window.URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setShowCreate(false);

    const docItem = {
      id: doc.id,
      itemType: 'document',
      title: doc.filename || doc.title,
      filename: doc.filename,
      page_count: doc.page_count,
      chunk_count: doc.chunk_count,
      file_size_bytes: doc.file_size_bytes,
      status: doc.status,
      tags: doc.tags || [],
      updated_at: doc.updated_at,
      raw: doc,
      linked_count: doc.linked_ids?.length || 0,
    };
    setSelected(docItem);
    setDocTags(doc.tags || []);
    setDocTagInput('');
    setLoadingDocDetails(true);
    setDocActiveTab(initialTab);

    // Fetch enriched document details (chunks, concepts, linked_items, tags)
    try {
      const res = await api.get(`/documents/${doc.id}`);
      setSelectedDocDetails(res.data);
      if (res.data?.tags) {
        setDocTags(res.data.tags);
      }
    } catch (err) {
      console.error('Failed to fetch doc details:', err);
    } finally {
      setLoadingDocDetails(false);
    }

    // Fetch in-modal PDF preview blob
    try {
      const fileRes = await api.get(`/documents/${doc.id}/file`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      setPdfBlobUrl(url);
    } catch (err) {
      console.error('Failed to load PDF preview:', err);
    }

    // Fetch cross-source connections (PDF-PDF, PDF-Text)
    setLoadingRelated(true);
    try {
      const relRes = await api.get(`/documents/${doc.id}/related`);
      setRelatedContent(relRes.data.items || []);
    } catch {
      setRelatedContent([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Quick PDF file upload directly from Notes page
  const handleQuickPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Only genuine PDF documents (.pdf) are supported.');
      return;
    }

    setQuickUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchKnowledgeBase();
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      selectDocument(res.data);
    } catch (err) {
      alert('Failed to upload PDF: ' + (err.response?.data?.detail || err.message));
    } finally {
      setQuickUploading(false);
    }
  };

  // Search across knowledge base
  const handleSearchChange = (q) => {
    setSearchQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await api.get('/search', { params: { q: q.trim() } });
        setSearchResults(res.data);
      } catch { setSearchResults([]); }
    }, 400);
  };

  // Save text note
  const saveNote = async () => {
    if (!selected || selected.itemType !== 'note' || !editTitle.trim()) return;
    setSaving(true);
    try {
      await api.put(`/notes/${selected.id}`, {
        title: editTitle,
        content: editContent,
        tags: editTags,
        linked_note_ids: selected.linked_note_ids || [],
      });
      await fetchKnowledgeBase();
      const res = await api.get(`/notes/${selected.id}`);
      setSelected({ ...res.data, itemType: 'note' });
    } catch { alert('Could not save note.'); }
    finally { setSaving(false); }
  };

  // Create text note
  const createNote = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/notes/', { title: newTitle, content: newContent, tags: newTags });
      setNewTitle(''); setNewContent(''); setNewTags([]); setNewTagInput('');
      setShowCreate(false);
      await fetchKnowledgeBase();
      selectNote(res.data);
    } catch { alert('Could not create note.'); }
    finally { setCreating(false); }
  };

  // Delete Note or Document
  const handleDeleteCurrent = async () => {
    if (!selected) return;
    if (selected.itemType === 'note') {
      if (!confirm(`Delete note "${selected.title}"?`)) return;
      try {
        await api.delete(`/notes/${selected.id}`);
        setSelected(null);
        await fetchKnowledgeBase();
      } catch { alert('Could not delete note.'); }
    } else {
      if (!confirm(`Delete PDF "${selected.title}" and its extracted concepts?`)) return;
      try {
        await api.delete(`/documents/${selected.id}`);
        setSelected(null);
        if (pdfBlobUrl) window.URL.revokeObjectURL(pdfBlobUrl);
        setPdfBlobUrl(null);
        await fetchKnowledgeBase();
      } catch { alert('Could not delete document.'); }
    }
  };

  // Link items (Bidirectional Text-Text, Text-PDF, PDF-PDF)
  const handleLinkTarget = async (targetId, targetType) => {
    if (!selected) return;
    setLinkingManual(targetId);
    try {
      if (selected.itemType === 'note') {
        if (targetType === 'note') {
          await api.post(`/notes/${selected.id}/link`, { target_note_id: targetId });
        } else {
          await api.post(`/documents/${targetId}/link`, { target_id: selected.id, target_type: 'note' });
        }
        await selectNote(selected);
      } else {
        await api.post(`/documents/${selected.id}/link`, { target_id: targetId, target_type: targetType });
        await selectDocument(selected);
      }
      setShowLinkPicker(false);
      await fetchKnowledgeBase();
    } catch (err) {
      alert('Could not create connection: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLinkingManual(null);
    }
  };

  // Unlink items
  const handleUnlink = async (targetId, targetType = 'note') => {
    if (!selected) return;
    try {
      if (selected.itemType === 'note') {
        await api.delete(`/notes/${selected.id}/unlink`, { data: { target_note_id: targetId } });
        await selectNote(selected);
      } else {
        await api.delete(`/documents/${selected.id}/unlink`, { data: { target_id: targetId, target_type: targetType } });
        await selectDocument(selected);
      }
      await fetchKnowledgeBase();
    } catch {
      alert('Could not unlink connection.');
    }
  };

  // Download PDF
  const handleDownloadPdf = async (docId, filename) => {
    try {
      const res = await api.get(`/documents/${docId}/file`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to download document.');
    }
  };

  // Tag helpers
  const addTag = (input, setInput, tags, setTags) => {
    const raw = input.trim().replace(/^#/, '').toLowerCase();
    if (raw && !tags.includes(raw)) setTags(prev => [...prev, raw]);
    setInput('');
  };
  const removeTag = (tag, setTags) => setTags(prev => prev.filter(t => t !== tag));

  // AI Magic Tagging
  const [generatingTags, setGeneratingTags] = useState(false);
  const generateMagicTags = async (isEditMode) => {
    const t = isEditMode ? editTitle : newTitle;
    const c = isEditMode ? editContent : newContent;
    if (!t.trim() && !c.trim()) {
      alert("Please enter a title or content first!");
      return;
    }
    setGeneratingTags(true);
    try {
      const res = await api.post('/ai/magic-tags', { title: t, content: c });
      const generated = res.data || [];
      const setTags = isEditMode ? setEditTags : setNewTags;
      setTags(prev => Array.from(new Set([...prev, ...generated])));
    } catch {
      alert('Failed to generate tags. Quota might be exceeded!');
    } finally {
      setGeneratingTags(false);
    }
  };

  // Document Tag Helpers (Issue 2)
  const addDocTag = async (input, setInput, tags, setTags) => {
    const raw = input.trim().toLowerCase().replace(/^#/, '');
    if (raw && !tags.includes(raw)) {
      const nextTags = [...tags, raw];
      setTags(nextTags);
      setInput('');
      if (selected && selected.itemType === 'document') {
        try {
          await api.put(`/documents/${selected.id}/tags`, { tags: nextTags });
          setSelected(prev => prev ? { ...prev, tags: nextTags } : prev);
          setDocuments(prev => prev.map(d => d.id === selected.id ? { ...d, tags: nextTags } : d));
        } catch (e) {
          console.error('Failed to save document tag:', e);
        }
      }
    }
  };

  const removeDocTag = async (tagToRemove, setTags) => {
    const nextTags = docTags.filter(t => t !== tagToRemove);
    setTags(nextTags);
    if (selected && selected.itemType === 'document') {
      try {
        await api.put(`/documents/${selected.id}/tags`, { tags: nextTags });
        setSelected(prev => prev ? { ...prev, tags: nextTags } : prev);
        setDocuments(prev => prev.map(d => d.id === selected.id ? { ...d, tags: nextTags } : d));
      } catch (e) {
        console.error('Failed to remove document tag:', e);
      }
    }
  };

  const generateDocMagicTags = async () => {
    if (!selected) return;
    setGeneratingDocTags(true);
    try {
      const chunkSample = selectedDocDetails?.chunks?.map(c => c.text).slice(0, 3).join(' ') || '';
      const res = await api.post('/ai/magic-tags', {
        title: selected.filename || selected.title || '',
        content: chunkSample.slice(0, 2000)
      });
      const generated = res.data || [];
      const merged = Array.from(new Set([...docTags, ...generated]));
      setDocTags(merged);
      await api.put(`/documents/${selected.id}/tags`, { tags: merged });
      setSelected(prev => prev ? { ...prev, tags: merged } : prev);
      setDocuments(prev => prev.map(d => d.id === selected.id ? { ...d, tags: merged } : d));
    } catch (err) {
      console.error('Failed to generate document magic tags:', err);
    } finally {
      setGeneratingDocTags(false);
    }
  };

  // Aggregate Unified List
  const unifiedItems = [
    ...notes.map(n => ({
      id: n.id,
      itemType: 'note',
      title: n.title,
      content: n.content,
      tags: n.tags || [],
      linked_count: n.linked_note_ids?.length || 0,
      updated_at: n.updated_at,
      raw: n,
    })),
    ...documents.map(d => ({
      id: d.id,
      itemType: 'document',
      title: d.filename,
      filename: d.filename,
      page_count: d.page_count,
      chunk_count: d.chunk_count,
      file_size_bytes: d.file_size_bytes,
      status: d.status,
      tags: d.tags || [],
      linked_count: d.linked_ids?.length || 0,
      updated_at: d.updated_at,
      raw: d,
    }))
  ].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  // Filter items by type & search (uses Elasticsearch API results when available)
  const filteredItems = unifiedItems.filter(item => {
    if (filterKind === 'notes' && item.itemType !== 'note') return false;
    if (filterKind === 'documents' && item.itemType !== 'document') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchLocal =
        (item.title || '').toLowerCase().includes(q) ||
        (item.content || '').toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q));

      // 1. Instant local match always stays visible (never flickers or disappears)
      if (matchLocal) return true;

      // 2. Also include any typo-tolerant fuzzy matches from Elasticsearch API
      if (searchResults !== null && Array.isArray(searchResults)) {
        const matchedIds = new Set(searchResults.map(r => String(r.id)));
        if (matchedIds.has(String(item.id))) return true;
      }

      return false;
    }
    return true;
  });

  // Handle URL Deep-Linking (e.g. from Study Path Builder)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('doc');
    const noteId = params.get('note');
    const concept = params.get('concept');
    const snippet = params.get('snippet');
    const chunkId = params.get('chunk');

    if (concept) setStudyConcept(concept);
    if (snippet) setStudySnippet(snippet);
    if (chunkId) setStudyChunkId(chunkId);

    if (docId) {
      const matchDoc = documents.find(d => d.id === docId);
      if (matchDoc) {
        selectDocument(matchDoc, 'chunks');
      } else if (documents.length > 0) {
        api.get(`/documents/${docId}`).then(res => {
          if (res.data) selectDocument(res.data, 'chunks');
        }).catch(err => console.error('Failed to open deep-linked doc:', err));
      }
    } else if (noteId) {
      const matchNote = notes.find(n => n.id === noteId);
      if (matchNote) {
        selectNote(matchNote);
      }
    }
  }, [documents.length, notes.length]);

  if (authLoading || !userToken) {
    return (
      <div style={s.splashLoading}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={s.root}>
      {/* ── Left Sidebar (Unified Knowledge Base: Notes & PDFs Together) ── */}
      <aside style={s.sidebar}>
        {/* Header */}
        <div style={s.sidebarHeader}>
          <div style={s.logoRow}>
            <div style={s.logoMini}>✦</div>
            <span style={s.logoText}>Smart Notes+</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Link href="/documents" style={s.navLink} title="PDF Documents & Ingestion">📚</Link>
            <Link href="/study-path" style={s.navLink} title="Study Path Builder">🗺️</Link>
            <Link href="/concept-graph" style={s.navLink} title="Interactive Concept Graph">🧠</Link>
            <Link href="/analytics" style={s.navLink} title="Analytics">📉</Link>
            <button onClick={toggleTheme} style={s.navLink} title={isDark ? 'Switch to Light' : 'Switch to Dark'}>
              {isDark ? '☀️' : '🌙'}
            </button>
            <button onClick={logout} style={s.navLink} title="Logout">⏏</button>
          </div>
        </div>

        {/* Search */}
        <div style={s.searchWrap}>
          <SearchIcon />
          <input
            style={s.searchInput}
            placeholder="Search notes & PDFs…"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} style={s.clearBtn}><XIcon /></button>
          )}
        </div>

        {/* Filter Pills (All / Notes / PDFs) */}
        <div style={s.filterRow}>
          <button
            onClick={() => setFilterKind('all')}
            style={{ ...s.filterPill, ...(filterKind === 'all' ? s.filterPillActive : {}) }}
          >
            All ({unifiedItems.length})
          </button>
          <button
            onClick={() => setFilterKind('notes')}
            style={{ ...s.filterPill, ...(filterKind === 'notes' ? s.filterPillActive : {}) }}
          >
            📝 Notes ({notes.length})
          </button>
          <button
            onClick={() => setFilterKind('documents')}
            style={{ ...s.filterPill, ...(filterKind === 'documents' ? s.filterPillActive : {}) }}
          >
            📄 PDFs ({documents.length})
          </button>
        </div>

        {/* Action Buttons: New Note & Upload PDF */}
        <div style={{ display: 'flex', gap: 8, margin: '0 14px 10px' }}>
          <button
            className="btn btn-primary"
            onClick={() => { setShowCreate(true); setSelected(null); }}
            style={{ flex: 1, fontSize: 13, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <PlusIcon /> Note
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => pdfInputRef.current?.click()}
            disabled={quickUploading}
            style={{ flex: 1, fontSize: 13, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            title="Upload a PDF document to knowledge base"
          >
            {quickUploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UploadIcon />}
            {quickUploading ? 'Uploading…' : 'PDF'}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleQuickPdfUpload}
            style={{ display: 'none' }}
          />
        </div>

        {/* Unified Item List */}
        <div style={s.noteList}>
          {loadingItems ? (
            <div style={s.centeredMsg}><span className="spinner" /></div>
          ) : filteredItems.length === 0 ? (
            <div style={s.centeredMsg}>
              {searchQuery ? 'No matching items.' : 'No notes or PDFs yet. Create or upload one!'}
            </div>
          ) : (
            filteredItems.map(item => (
              <UnifiedListItem
                key={`${item.itemType}-${item.id}`}
                item={item}
                isSelected={selected?.id === item.id && selected?.itemType === item.itemType}
                onClick={() => {
                  if (item.itemType === 'note') selectNote(item.raw);
                  else selectDocument(item.raw);
                }}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <main style={s.main}>
        {/* Create Note Form */}
        {showCreate && (
          <form onSubmit={createNote} style={s.createForm} className="animate-in">
            <div style={s.panelHeader}>
              <h2 style={s.panelTitle}>New Text Note</h2>
              <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
            <input
              className="input"
              placeholder="Title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              required
              autoFocus
              style={{ fontSize: 18, fontWeight: 700, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '8px 0', marginBottom: 16 }}
            />
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>TAGS</span>
                <button
                  type="button"
                  onClick={() => generateMagicTags(false)}
                  disabled={generatingTags}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}
                >
                  {generatingTags ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <SparkIcon />}
                  AI Magic Tag
                </button>
              </div>
              <div style={s.tagRow}>
                {newTags.map(t => <TagChip key={t} tag={t} onRemove={tag => removeTag(tag, setNewTags)} />)}
                <input
                  style={s.tagInlineInput}
                  placeholder={newTags.length === 0 ? 'Type a tag and press Enter…' : ''}
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(newTagInput, setNewTagInput, newTags, setNewTags); }
                    if (e.key === ',') { e.preventDefault(); addTag(newTagInput, setNewTagInput, newTags, setNewTags); }
                  }}
                />
              </div>
            </div>
            <textarea
              style={s.editContent}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Start typing your note here…"
              required
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create Note'}
              </button>
            </div>
          </form>
        )}

        {/* Selected Item: TEXT NOTE VIEW */}
        {selected && selected.itemType === 'note' && (
          <div style={s.editPanel} className="animate-in">
            <div style={s.panelHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={s.typeBadgeNote}>📝 NOTE</span>
                <input
                  style={s.editTitle}
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="Note Title"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={saveNote}
                  disabled={saving}
                  style={{ height: 34, fontSize: 13, padding: '0 16px' }}
                >
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleDeleteCurrent}
                  title="Delete Note"
                  style={{ color: 'var(--danger)', height: 34, width: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            <textarea
              style={s.editContent}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Write your note content…"
            />

            {/* Tags */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 24px' }}>
                <span style={s.tagFieldLabel}>TAGS</span>
                <button
                  type="button"
                  onClick={() => generateMagicTags(true)}
                  disabled={generatingTags}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}
                >
                  {generatingTags ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <SparkIcon />}
                  AI Magic Tag
                </button>
              </div>
              <div style={s.tagRow}>
                {editTags.map(t => <TagChip key={t} tag={t} onRemove={tag => removeTag(tag, setEditTags)} />)}
                <input
                  style={s.tagInlineInput}
                  placeholder={editTags.length === 0 ? 'Add tags…' : ''}
                  value={editTagInput}
                  onChange={e => setEditTagInput(e.target.value)}
                  onBlur={() => addTag(editTagInput, setEditTagInput, editTags, setEditTags)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(editTagInput, setEditTagInput, editTags, setEditTags); }
                    if (e.key === ',') { e.preventDefault(); addTag(editTagInput, setEditTagInput, editTags, setEditTags); }
                    if (e.key === 'Backspace' && !editTagInput && editTags.length) removeTag(editTags[editTags.length - 1], setEditTags);
                  }}
                />
              </div>
            </div>

            {/* Connections & Related Items Section */}
            <div style={s.section}>
              <div style={{ ...s.sectionTitle, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LinkIcon /> Connections & Knowledge Links ({((selected.linked_notes?.length || 0) + relatedContent.length)})
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '3px 10px', fontSize: 12, height: 26 }}
                  onClick={() => { setShowLinkPicker(true); setLinkPickerQuery(''); }}
                >
                  + Link Note or PDF
                </button>
              </div>

              {/* Explicit connections */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {(selected.linked_notes || []).map(ln => (
                  <div key={ln.id} style={s.linkedChip}>
                    <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => {
                      const found = notes.find(n => n.id === ln.id);
                      if (found) selectNote(found);
                    }}>
                      📝 {ln.title}
                    </span>
                    <button onClick={() => handleUnlink(ln.id, 'note')} style={s.unlinkBtn} title="Remove connection"><XIcon /></button>
                  </div>
                ))}
              </div>

              {/* Cross-Source Connections (Text-Text, Text-PDF) */}
              {loadingRelated ? (
                <div style={{ padding: 12, textAlign: 'center' }}><div className="spinner" style={{ width: 16, height: 16 }} /></div>
              ) : relatedContent.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relatedContent.map((item) => (
                    <div key={item.id} style={s.connectionCard}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={item.source_type === 'document' ? s.typeBadgePdf : s.typeBadgeNote}>
                            {item.source_type === 'document' ? '📄 PDF' : '📝 NOTE'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                            {item.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          💡 {item.similarity_reason}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (item.source_type === 'document') {
                            const d = documents.find(doc => doc.id === item.id);
                            if (d) selectDocument(d);
                            else router.push('/documents');
                          } else {
                            const n = notes.find(nt => nt.id === item.id);
                            if (n) selectNote(n);
                          }
                        }}
                        style={s.openLinkBtn}
                      >
                        Open {item.source_type === 'document' ? 'PDF' : 'Note'} →
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>
                  No connections yet. Mention shared concepts or click &quot;+ Link Note or PDF&quot; above.
                </div>
              )}

              {/* Inline Link Picker Modal / Popover */}
              {showLinkPicker && (
                <div style={s.linkPickerBox}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid var(--border)' }}>
                    <SearchIcon />
                    <input
                      autoFocus
                      className="input"
                      placeholder="Search any note or PDF to link…"
                      value={linkPickerQuery}
                      onChange={e => setLinkPickerQuery(e.target.value)}
                      style={{ flex: 1, height: 30, background: 'transparent', border: 'none', outline: 'none', fontSize: 13 }}
                    />
                    <button onClick={() => setShowLinkPicker(false)} style={s.unlinkBtn}><XIcon /></button>
                  </div>
                  <div style={s.linkPickerList}>
                    {unifiedItems
                      .filter(i =>
                        i.id !== selected.id &&
                        (i.title.toLowerCase().includes(linkPickerQuery.toLowerCase()) ||
                          (i.content || '').toLowerCase().includes(linkPickerQuery.toLowerCase()))
                      )
                      .slice(0, 8)
                      .map(i => (
                        <button
                          key={`${i.itemType}-${i.id}`}
                          style={s.linkPickerRow}
                          onClick={() => handleLinkTarget(i.id, i.itemType)}
                          disabled={linkingManual === i.id}
                        >
                          <span style={i.itemType === 'document' ? s.typeBadgePdf : s.typeBadgeNote}>
                            {i.itemType === 'document' ? '📄 PDF' : '📝 NOTE'}
                          </span>
                          <span style={{ flex: 1 }}>{i.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--primary)' }}>+ Link</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected Item: PDF DOCUMENT NOTE VIEW */}
        {selected && selected.itemType === 'document' && (
          <div style={s.docViewPanel} className="animate-in">
            {/* Document Header */}
            <div style={s.panelHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <span style={s.typeBadgePdf}>📄 PDF NOTE</span>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{selected.title}</h2>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
                    <span style={{ ...s.statusBadge, ...(selected.status === 'ready' ? s.statusBadgeReady : s.statusBadgeWait) }}>
                      {selected.status === 'ready' ? '✓ Ready' : `⏳ ${selected.status}`}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      📑 {selected.page_count} pages • 💾 {((selected.file_size_bytes || 0) / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDownloadPdf(selected.id, selected.filename)}
                  style={{ height: 34, fontSize: 13, padding: '0 12px' }}
                >
                  ⬇️ Download
                </button>
                <Link
                  href="/concept-graph"
                  className="btn btn-ghost"
                  style={{ height: 34, fontSize: 13, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  🧠 Graph
                </Link>
                <button
                  className="btn btn-ghost"
                  onClick={handleDeleteCurrent}
                  title="Delete Document"
                  style={{ color: 'var(--danger)', height: 34, width: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            {/* Document Tags (Issue 2) */}
            <div style={s.tagRow}>
              <div style={s.tagFieldHeader}>
                <span style={s.tagFieldLabel}>TAGS</span>
                <button
                  style={s.sparkBtn}
                  onClick={generateDocMagicTags}
                  disabled={generatingDocTags}
                  title="Generate tags with AI from document content"
                >
                  {generatingDocTags ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <SparkIcon />}
                  Magic Tags
                </button>
              </div>
              <div style={s.tagList}>
                {docTags.map(t => (
                  <TagChip key={t} tag={t} onRemove={tag => removeDocTag(tag, setDocTags)} />
                ))}
                <input
                  style={s.tagInput}
                  value={docTagInput}
                  onChange={e => setDocTagInput(e.target.value)}
                  placeholder={docTags.length === 0 ? 'Type a tag and press Enter…' : ''}
                  onBlur={() => addDocTag(docTagInput, setDocTagInput, docTags, setDocTags)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addDocTag(docTagInput, setDocTagInput, docTags, setDocTags); }
                    if (e.key === ',') { e.preventDefault(); addDocTag(docTagInput, setDocTagInput, docTags, setDocTags); }
                    if (e.key === 'Backspace' && !docTagInput && docTags.length) removeDocTag(docTags[docTags.length - 1], setDocTags);
                  }}
                />
              </div>
            </div>

            {/* Document View Sub-Tabs */}
            <div style={s.subTabBar}>
              <button
                style={{ ...s.subTabBtn, ...(docActiveTab === 'preview' ? s.subTabBtnActive : {}) }}
                onClick={() => setDocActiveTab('preview')}
              >
                📄 PDF Reader
              </button>
              <button
                style={{ ...s.subTabBtn, ...(docActiveTab === 'concepts' ? s.subTabBtnActive : {}) }}
                onClick={() => setDocActiveTab('concepts')}
              >
                🧠 Extracted Concepts ({selectedDocDetails?.concepts?.length || 0})
              </button>
              <button
                style={{ ...s.subTabBtn, ...(docActiveTab === 'chunks' ? s.subTabBtnActive : {}) }}
                onClick={() => setDocActiveTab('chunks')}
              >
                🧩 Text Chunks ({selectedDocDetails?.chunks?.length || 0})
              </button>
            </div>

            {/* Sub-Tab Content */}
            <div style={s.subTabContent}>
              {docActiveTab === 'preview' && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {pdfBlobUrl ? (
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=1`}
                      title={selected.title}
                      style={{ width: '100%', height: '480px', border: '1px solid var(--border)', borderRadius: 8, background: '#1c1c20' }}
                    />
                  ) : (
                    <div style={s.centeredMsg}>
                      <span className="spinner" />
                      <p style={{ marginTop: 8 }}>Loading PDF in-browser viewer…</p>
                    </div>
                  )}
                </div>
              )}

              {docActiveTab === 'concepts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={s.infoBannerMini}>
                    💡 Extracted by AI from this document. Click <em>Study Path</em> to build a prerequisite learning path.
                  </div>
                  {(!selectedDocDetails?.concepts || selectedDocDetails.concepts.length === 0) ? (
                    <p style={{ color: 'var(--text-tertiary)', padding: 12 }}>No distinct concepts extracted yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                      {selectedDocDetails.concepts.map(c => (
                        <div key={c.normalized_name} style={s.conceptCardMini}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <strong style={{ fontSize: 13, color: '#f9fafb' }}>{c.name}</strong>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button
                                onClick={() => {
                                  setStudyConcept(c.name);
                                  setDocActiveTab('chunks');
                                }}
                                style={s.locateChunkBtn}
                                title="Locate passages for this concept in the PDF chunks"
                              >
                                🔍 In Text
                              </button>
                              <Link href={`/study-path?concept=${encodeURIComponent(c.normalized_name)}`} style={s.studyPathLinkMini}>
                                🗺️ Path
                              </Link>
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {c.description || 'Core concept from document.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {docActiveTab === 'chunks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={s.infoBannerMini}>
                    💡 Partitioned semantic chunks (~400 words) for vector search, context retrieval, and concept mapping.
                  </div>

                  {studyConcept && (
                    <div style={s.studyFocusBanner}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>🎯</span>
                        <div>
                          <strong style={{ color: '#38bdf8', fontSize: 13 }}>Focusing on Concept: &ldquo;{studyConcept}&rdquo;</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Passages explaining this topic are highlighted in glowing amber below.
                          </div>
                        </div>
                      </div>
                      <button
                        style={s.clearStudyBtn}
                        onClick={() => { setStudyConcept(''); setStudySnippet(''); setStudyChunkId(''); }}
                        title="Clear concept focus"
                      >
                        ✕ Clear Focus
                      </button>
                    </div>
                  )}

                  {(!selectedDocDetails?.chunks || selectedDocDetails.chunks.length === 0) ? (
                    <p style={{ color: 'var(--text-tertiary)', padding: 12 }}>No chunks available.</p>
                  ) : (
                    selectedDocDetails.chunks.map(ch => {
                      const matchesConcept = studyConcept && ch.text.toLowerCase().includes(studyConcept.toLowerCase());
                      const matchesSnippet = studySnippet && ch.text.toLowerCase().includes(studySnippet.slice(0, 30).toLowerCase());
                      const isHighlighted = matchesConcept || matchesSnippet || ch.id === studyChunkId;

                      return (
                        <div
                          key={ch.id}
                          id={`chunk-${ch.id}`}
                          style={{
                            ...s.chunkCardMini,
                            ...(isHighlighted ? s.chunkCardHighlighted : {})
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: isHighlighted ? '#38bdf8' : 'var(--primary)', fontWeight: 700 }}>
                              Page {ch.page_number} • Chunk #{ch.chunk_index + 1} ({ch.token_count || ch.word_count || 0} words)
                            </div>
                            {isHighlighted && (
                              <span style={s.highlightBadge}>
                                ★ Target Concept
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {renderHighlightedText(ch.text, studyConcept || (studySnippet ? studySnippet.slice(0, 35) : ''))}
                          </p>
                          {ch.extracted_concepts?.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {ch.extracted_concepts.map(ec => (
                                <span
                                  key={ec}
                                  onClick={() => setStudyConcept(ec)}
                                  style={{
                                    ...s.chunkConceptTag,
                                    ...(studyConcept && ec.toLowerCase() === studyConcept.toLowerCase() ? s.chunkConceptTagActive : {})
                                  }}
                                  title={`Focus on "${ec}"`}
                                >
                                  #{ec}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Document Connections (PDF-PDF and PDF-Text) */}
            <div style={s.section}>
              <div style={{ ...s.sectionTitle, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LinkIcon /> Document Connections ({((selectedDocDetails?.linked_items?.length || 0) + relatedContent.length)})
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '3px 10px', fontSize: 12, height: 26 }}
                  onClick={() => { setShowLinkPicker(true); setLinkPickerQuery(''); }}
                >
                  + Link Note or PDF
                </button>
              </div>

              {/* Explicit connections */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {(selectedDocDetails?.linked_items || []).map(li => (
                  <div key={li.id} style={s.linkedChip}>
                    <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => {
                      if (li.type === 'document') {
                        const d = documents.find(doc => doc.id === li.id);
                        if (d) selectDocument(d);
                      } else {
                        const n = notes.find(nt => nt.id === li.id);
                        if (n) selectNote(n);
                      }
                    }}>
                      {li.type === 'document' ? '📄' : '📝'} {li.title}
                    </span>
                    <button onClick={() => handleUnlink(li.id, li.type)} style={s.unlinkBtn} title="Remove connection"><XIcon /></button>
                  </div>
                ))}
              </div>

              {/* Cross-Source Connections (PDF-PDF, PDF-Text) */}
              {loadingRelated ? (
                <div style={{ padding: 12, textAlign: 'center' }}><div className="spinner" style={{ width: 16, height: 16 }} /></div>
              ) : relatedContent.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relatedContent.map((item) => (
                    <div key={item.id} style={s.connectionCard}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={item.source_type === 'document' ? s.typeBadgePdf : s.typeBadgeNote}>
                            {item.source_type === 'document' ? '📄 PDF' : '📝 NOTE'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                            {item.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          💡 {item.similarity_reason}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (item.source_type === 'document') {
                            const d = documents.find(doc => doc.id === item.id);
                            if (d) selectDocument(d);
                            else router.push('/documents');
                          } else {
                            const n = notes.find(nt => nt.id === item.id);
                            if (n) selectNote(n);
                          }
                        }}
                        style={s.openLinkBtn}
                      >
                        Open {item.source_type === 'document' ? 'PDF' : 'Note'} →
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>
                  No connections yet. Mention shared concepts or click &quot;+ Link Note or PDF&quot; above.
                </div>
              )}

              {/* Inline Link Picker */}
              {showLinkPicker && (
                <div style={s.linkPickerBox}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid var(--border)' }}>
                    <SearchIcon />
                    <input
                      autoFocus
                      className="input"
                      placeholder="Search note or PDF to connect…"
                      value={linkPickerQuery}
                      onChange={e => setLinkPickerQuery(e.target.value)}
                      style={{ flex: 1, height: 30, background: 'transparent', border: 'none', outline: 'none', fontSize: 13 }}
                    />
                    <button onClick={() => setShowLinkPicker(false)} style={s.unlinkBtn}><XIcon /></button>
                  </div>
                  <div style={s.linkPickerList}>
                    {unifiedItems
                      .filter(i =>
                        i.id !== selected.id &&
                        (i.title.toLowerCase().includes(linkPickerQuery.toLowerCase()) ||
                          (i.content || '').toLowerCase().includes(linkPickerQuery.toLowerCase()))
                      )
                      .slice(0, 8)
                      .map(i => (
                        <button
                          key={`${i.itemType}-${i.id}`}
                          style={s.linkPickerRow}
                          onClick={() => handleLinkTarget(i.id, i.itemType)}
                          disabled={linkingManual === i.id}
                        >
                          <span style={i.itemType === 'document' ? s.typeBadgePdf : s.typeBadgeNote}>
                            {i.itemType === 'document' ? '📄 PDF' : '📝 NOTE'}
                          </span>
                          <span style={{ flex: 1 }}>{i.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--primary)' }}>+ Link</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state: Nothing selected */}
        {!selected && !showCreate && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>✦</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Your Unified Knowledge Base</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 15, maxWidth: 440, lineHeight: 1.6, marginBottom: 24 }}>
              Select any text note or uploaded PDF to read, edit, or explore cross-source concept connections.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ height: 42, fontSize: 14 }}>
                <PlusIcon /> New Note
              </button>
              <button className="btn btn-secondary" onClick={() => pdfInputRef.current?.click()} style={{ height: 42, fontSize: 14 }}>
                <UploadIcon /> Upload PDF
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Comprehensive Styling ────────────────────────────────────────────────── */
const s = {
  root: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  splashLoading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0e0e11',
  },

  // Sidebar
  sidebar: {
    width: 320,
    minWidth: 280,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--surface)',
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 14px 10px',
    borderBottom: '1px solid var(--border)',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  logoMini: {
    width: 28, height: 28, borderRadius: 8,
    background: 'linear-gradient(135deg, #8B5CF6, #6d28d9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: '#fff',
  },
  logoText: { fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 },
  navLink: {
    width: 30, height: 30, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 15, color: 'var(--text-secondary)',
    textDecoration: 'none',
    transition: 'background 0.1s',
  },

  // Search
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '10px 14px 6px',
    padding: '7px 12px',
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-tertiary)',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 },

  // Filter Row
  filterRow: {
    display: 'flex',
    gap: 4,
    margin: '6px 14px 10px',
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 3,
  },
  filterPill: {
    flex: 1,
    background: 'none',
    border: 'none',
    padding: '5px 4px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  filterPillActive: {
    background: 'var(--surface)',
    color: 'var(--text)',
    fontWeight: 700,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },

  // Note list
  noteList: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  centeredMsg: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 13 },

  noteItem: {
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
  },
  noteItemActive: { background: 'rgba(139,92,246,0.08)', borderLeft: '3px solid var(--primary)' },
  noteItemTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 },
  noteItemSnippet: { fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  noteItemMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  linkBadge: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(139,92,246,0.1)', padding: '2px 7px', borderRadius: 999 },

  typeBadgeNote: {
    fontSize: 9,
    fontWeight: 800,
    background: 'rgba(245, 158, 11, 0.18)',
    color: '#fbbf24',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  typeBadgePdf: {
    fontSize: 9,
    fontWeight: 800,
    background: 'rgba(59, 130, 246, 0.18)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
  },
  statusBadgeReady: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  statusBadgeWait: {
    background: 'rgba(139, 92, 246, 0.15)',
    color: 'var(--primary)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
  },

  // Main panel
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  // Panel header
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid var(--border)',
    gap: 12,
  },
  panelTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text)' },

  // Create form
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 24px 24px',
    height: '100%',
    overflowY: 'auto',
  },

  // Edit panel
  editPanel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
  },
  editTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--text)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    letterSpacing: -0.4,
  },
  editContent: {
    flex: 1,
    minHeight: 280,
    padding: '16px 24px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: 15,
    lineHeight: 1.8,
    resize: 'none',
  },

  // PDF Document View Panel
  docViewPanel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
  },
  subTabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface-hi)',
    padding: '0 24px',
  },
  subTabBtn: {
    background: 'none',
    border: 'none',
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
  },
  subTabBtnActive: {
    color: 'var(--primary)',
    borderBottomColor: 'var(--primary)',
    fontWeight: 700,
  },
  subTabContent: {
    padding: '20px 24px',
    flex: 1,
  },
  infoBannerMini: {
    background: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 8,
  },
  conceptCardMini: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
  },
  studyPathLinkMini: {
    fontSize: 11,
    color: 'var(--primary)',
    textDecoration: 'none',
    fontWeight: 700,
  },
  chunkCardMini: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '12px 14px',
  },

  // Tags
  tagFieldLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '0 24px' },
  tagInlineInput: {
    minWidth: 120, flex: 1,
    background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  },

  // Sections
  section: { padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)' },
  sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 },

  // Linked chips
  linkedChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 12px',
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13, color: 'var(--text)',
  },
  unlinkBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 },

  // Connection Cards (Text-Text, Text-PDF, PDF-PDF)
  connectionCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'border-color 0.15s ease',
  },
  openLinkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '4px 8px',
  },

  // Link picker
  linkPickerBox: {
    marginTop: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--surface)',
    boxShadow: 'var(--shadow-md)',
  },
  linkPickerList: { maxHeight: 200, overflowY: 'auto' },
  linkPickerRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', textAlign: 'left',
    padding: '8px 12px',
    background: 'none', border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit',
    transition: 'background 0.1s',
  },

  // Deep-linking study focus and passage highlighting styles (Issue 3)
  studyFocusBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(129, 140, 248, 0.1))',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 8,
  },
  clearStudyBtn: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chunkCardHighlighted: {
    border: '2px solid #38bdf8',
    background: 'rgba(56, 189, 248, 0.05)',
    boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)',
  },
  highlightBadge: {
    background: 'rgba(56, 189, 248, 0.2)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  locateChunkBtn: {
    background: 'rgba(56, 189, 248, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    color: '#38bdf8',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chunkConceptTag: {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    background: 'var(--surface-hi)',
    padding: '2px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid var(--border)',
    transition: 'all 0.15s ease',
  },
  chunkConceptTagActive: {
    color: '#fbbf24',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    fontWeight: 700,
  },

  // Empty state
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text)', textAlign: 'center', padding: 40,
  },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 18,
    background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(109,40,217,0.1))',
    border: '1px solid rgba(139,92,246,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 26, marginBottom: 18,
    boxShadow: '0 0 40px rgba(139,92,246,0.15)',
  },
};
