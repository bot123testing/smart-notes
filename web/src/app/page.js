'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useRouter } from 'next/navigation';

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

/* ── Note card in list ──────────────────────────────────────────────────── */
function NoteListItem({ note, isSelected, onClick }) {
  const relTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div onClick={onClick} style={{
      ...s.noteItem,
      ...(isSelected ? s.noteItemActive : {}),
    }}>
      <div style={s.noteItemTitle}>{note.title || 'Untitled'}</div>
      {note.content && (
        <div style={s.noteItemSnippet}>
          {note.content.slice(0, 80)}{note.content.length > 80 ? '…' : ''}
        </div>
      )}
      <div style={s.noteItemMeta}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{relTime(note.updated_at)}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {note.tags?.slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
          {note.linked_notes?.length > 0 && (
            <span style={s.linkBadge}><LinkIcon /> {note.linked_notes.length}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Suggestion row ─────────────────────────────────────────────────────── */
function SuggestionRow({ suggestion, onLink, onDismiss }) {
  const [linking, setLinking] = useState(false);
  const doLink = async () => { setLinking(true); await onLink(suggestion); setLinking(false); };
  return (
    <div style={s.suggestionRow}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{suggestion.title}</div>
        <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(suggestion.score * 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: 2 }} />
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 34 }}>{Math.round(suggestion.score * 100)}%</span>
      <button onClick={doLink} disabled={linking} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
        {linking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '+ Link'}
      </button>
      <button onClick={() => onDismiss(suggestion.note_id)} style={s.dismissBtn}><XIcon /></button>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function Home() {
  const { userToken, logout } = useAuth();
  const router = useRouter();

  // Theme toggle
  const [isDark, setIsDark] = useState(true);

  // Init theme from localStorage on mount
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

  // List state
  const [notes, setNotes] = useState([]);
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Manual link picker
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkPickerQuery, setLinkPickerQuery] = useState('');
  const [linkingManual, setLinkingManual] = useState(null); // note being linked

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [newTags, setNewTags] = useState([]);
  const [creating, setCreating] = useState(false);

  // Detail / editing
  const [selected, setSelected] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTagInput, setEditTagInput] = useState('');
  const [editTags, setEditTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const searchDebounce = useRef(null);

  useEffect(() => {
    if (!userToken) { router.push('/login'); return; }
    fetchNotes();
  }, [userToken]);

  const fetchNotes = async () => {
    setLoadingNotes(true);
    try {
      const res = await api.get('/notes/');
      setNotes(res.data);
    } catch { /* auth redirect handled by interceptor */ }
    finally { setLoadingNotes(false); }
  };

  /* ── Search ── */
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

  /* ── Select a note ── */
  const selectNote = async (note) => {
    setSelected(note);
    setEditTitle(note.title);
    setEditContent(note.content || '');
    setEditTags(note.tags || []);
    setEditTagInput('');
    setSuggestions((note.suggested_links || []).filter(s => !(note.linked_note_ids || []).includes(s.note_id)));

    // Refresh note detail from server
    try {
      const res = await api.get(`/notes/${note.id}`);
      const fresh = res.data;
      setSelected(fresh);
      setEditTitle(fresh.title);
      setEditContent(fresh.content || '');
      setEditTags(fresh.tags || []);
      const linkedIds = fresh.linked_note_ids || [];
      setSuggestions((fresh.suggested_links || []).filter(s => !linkedIds.includes(s.note_id)));
    } catch { /* use stale data */ }
  };

  /* ── Save note ── */
  const saveNote = async () => {
    if (!selected || !editTitle.trim()) return;
    setSaving(true);
    try {
      await api.put(`/notes/${selected.id}`, {
        title: editTitle,
        content: editContent,
        tags: editTags,
        linked_note_ids: selected.linked_note_ids || [],
      });
      await fetchNotes();
      // Refresh selected
      const res = await api.get(`/notes/${selected.id}`);
      setSelected(res.data);
    } catch { alert('Could not save note.'); }
    finally { setSaving(false); }
  };

  /* ── Create note ── */
  const createNote = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/notes/', { title: newTitle, content: newContent, tags: newTags });
      setNewTitle(''); setNewContent(''); setNewTags([]); setNewTagInput('');
      setShowCreate(false);
      await fetchNotes();
      selectNote(res.data);
    } catch { alert('Could not create note.'); }
    finally { setCreating(false); }
  };

  /* ── Delete note ── */
  const deleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await api.delete(`/notes/${noteId}`);
      if (selected?.id === noteId) setSelected(null);
      await fetchNotes();
    } catch { alert('Could not delete note.'); }
  };

  /* ── Link suggestion ── */
  const handleLinkSuggestion = async (suggestion) => {
    if (!selected) return;
    try {
      await api.post(`/notes/${selected.id}/link`, { target_note_id: suggestion.note_id });
      setSuggestions(prev => prev.filter(s => s.note_id !== suggestion.note_id));
      const res = await api.get(`/notes/${selected.id}`);
      setSelected(res.data);
      await fetchNotes();
    } catch { alert('Could not link notes.'); }
  };

  /* ── Unlink ── */
  const handleUnlink = async (targetId) => {
    if (!selected) return;
    try {
      await api.delete(`/notes/${selected.id}/unlink`, { data: { target_note_id: targetId } });
      const res = await api.get(`/notes/${selected.id}`);
      setSelected(res.data);
      await fetchNotes();
    } catch { alert('Could not unlink notes.'); }
  };

  /* ── Tag helpers ── */
  const addTag = (input, setInput, tags, setTags) => {
    const raw = input.trim().replace(/^#/, '').toLowerCase();
    if (raw && !tags.includes(raw)) setTags(prev => [...prev, raw]);
    setInput('');
  };
  const removeTag = (tag, setTags) => setTags(prev => prev.filter(t => t !== tag));

  /* ── Display list ── */
  const displayNotes = searchResults !== null ? searchResults : notes;

  if (!userToken) return null;

  return (
    <div style={s.root}>
      {/* ── Sidebar ── */}
      <aside style={s.sidebar}>
        {/* Header */}
        <div style={s.sidebarHeader}>
          <div style={s.logoRow}>
            <div style={s.logoMini}>✦</div>
            <span style={s.logoText}>Smart Notes+</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="/analytics" style={s.navLink} title="Analytics">📉</a>
            <a href="/graph" style={s.navLink} title="Graph">🧠</a>
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
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} style={s.clearBtn}><XIcon /></button>
          )}
        </div>

        {/* New note button */}
        <button
          className="btn btn-primary"
          onClick={() => { setShowCreate(true); setSelected(null); }}
          style={{ margin: '0 14px 8px', fontSize: 13, height: 36 }}
        >
          <PlusIcon /> New Note
        </button>

        {/* Search info */}
        {searchResults !== null && (
          <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {/* Note list */}
        <div style={s.noteList}>
          {loadingNotes ? (
            <div style={s.centeredMsg}><span className="spinner" /></div>
          ) : displayNotes.length === 0 ? (
            <div style={s.centeredMsg}>
              {searchResults !== null ? 'No results.' : 'No notes yet. Create one!'}
            </div>
          ) : (
            displayNotes.map(note => (
              <NoteListItem
                key={note.id || note._id}
                note={note}
                isSelected={selected?.id === (note.id || note._id)}
                onClick={() => selectNote(note)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <main style={s.main}>
        {/* Create form */}
        {showCreate && (
          <form onSubmit={createNote} style={s.createForm} className="animate-in">
            <div style={s.panelHeader}>
              <h2 style={s.panelTitle}>New Note</h2>
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
            <textarea
              className="input"
              placeholder="Start writing…"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              style={{ minHeight: 160, border: 'none', background: 'transparent', padding: '8px 0', fontSize: 15, lineHeight: 1.7, resize: 'none', borderRadius: 0 }}
            />
            {/* Tags */}
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <div style={s.tagFieldLabel}>Tags</div>
              <div style={s.tagRow}>
                {newTags.map(t => <TagChip key={t} tag={t} onRemove={tag => removeTag(tag, setNewTags)} />)}
                <input
                  style={s.tagInlineInput}
                  placeholder={newTags.length === 0 ? 'Add tags (enter or comma)…' : ''}
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onBlur={() => addTag(newTagInput, setNewTagInput, newTags, setNewTags)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(newTagInput, setNewTagInput, newTags, setNewTags); }
                    if (e.key === ',') { e.preventDefault(); addTag(newTagInput, setNewTagInput, newTags, setNewTags); }
                    if (e.key === 'Backspace' && !newTagInput && newTags.length) removeTag(newTags[newTags.length - 1], setNewTags);
                  }}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating || !newTitle.trim()} style={{ alignSelf: 'flex-end', height: 38 }}>
              {creating ? <span className="spinner" /> : 'Create Note'}
            </button>
          </form>
        )}

        {/* Edit panel */}
        {selected && !showCreate && (
          <div style={s.editPanel} className="animate-in" key={selected.id}>
            {/* Header */}
            <div style={s.panelHeader}>
              <input
                style={s.editTitle}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Note title"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => deleteNote(selected.id)}
                  style={{ padding: '6px 10px', color: 'var(--danger)' }}
                  title="Delete note"
                >
                  <TrashIcon />
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveNote}
                  disabled={saving || !editTitle.trim()}
                  style={{ height: 36, fontSize: 13, minWidth: 72 }}
                >
                  {saving ? <span className="spinner" /> : 'Save'}
                </button>
              </div>
            </div>

            {/* Content */}
            <textarea
              style={s.editContent}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Write your thoughts…"
            />

            {/* Tags */}
            <div style={{ marginBottom: 20 }}>
              <div style={s.tagFieldLabel}>Tags</div>
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

            {/* Linked notes — always show with Add Link button */}
            <div style={s.section}>
              <div style={{ ...s.sectionTitle, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LinkIcon /> Connections ({selected.linked_notes?.length ?? 0})</span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '3px 10px', fontSize: 12, height: 26 }}
                  onClick={() => { setShowLinkPicker(true); setLinkPickerQuery(''); }}
                >
                  + Link Note
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(selected.linked_notes || []).map(ln => (
                  <div key={ln.id} style={s.linkedChip}>
                    <span style={{ cursor: 'pointer' }} onClick={() => selectNote(ln)}>{ln.title}</span>
                    <button onClick={() => handleUnlink(ln.id)} style={s.unlinkBtn} title="Remove link"><XIcon /></button>
                  </div>
                ))}
                {(!selected.linked_notes || selected.linked_notes.length === 0) && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No connections yet. Click "+ Link Note" to connect ideas.</span>
                )}
              </div>

              {/* Inline link picker */}
              {showLinkPicker && (
                <div style={s.linkPickerBox}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      autoFocus
                      className="input"
                      placeholder="Search notes to link…"
                      value={linkPickerQuery}
                      onChange={e => setLinkPickerQuery(e.target.value)}
                      style={{ flex: 1, height: 32, padding: '4px 10px', fontSize: 13 }}
                    />
                    <button onClick={() => setShowLinkPicker(false)} style={s.unlinkBtn}><XIcon /></button>
                  </div>
                  <div style={s.linkPickerList}>
                    {notes
                      .filter(n =>
                        n.id !== selected.id &&
                        !(selected.linked_note_ids || []).includes(n.id) &&
                        (n.title.toLowerCase().includes(linkPickerQuery.toLowerCase()) ||
                          (n.content || '').toLowerCase().includes(linkPickerQuery.toLowerCase()))
                      )
                      .slice(0, 8)
                      .map(n => (
                        <button
                          key={n.id}
                          style={s.linkPickerRow}
                          onClick={async () => {
                            setLinkingManual(n.id);
                            await handleLinkSuggestion({ note_id: n.id, title: n.title, score: 1 });
                            setLinkingManual(null);
                            setShowLinkPicker(false);
                          }}
                          disabled={linkingManual === n.id}
                        >
                          <span>{n.title}</span>
                          {n.tags?.slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
                        </button>
                      ))
                    }
                    {notes.filter(n => n.id !== selected.id && !(selected.linked_note_ids || []).includes(n.id) && n.title.toLowerCase().includes(linkPickerQuery.toLowerCase())).length === 0 && (
                      <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: 13 }}>No notes found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>



            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}><SparkIcon /> AI Suggestions</div>
                <div style={s.suggestionsBox}>
                  {suggestions.map(sug => (
                    <SuggestionRow
                      key={sug.note_id}
                      suggestion={sug}
                      onLink={handleLinkSuggestion}
                      onDismiss={id => setSuggestions(prev => prev.filter(s => s.note_id !== id))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selected && !showCreate && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>✦</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Your knowledge base</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 15, marginBottom: 24 }}>
              Select a note to read or edit, or create a new one.
            </p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ height: 44, fontSize: 15 }}>
              <PlusIcon /> New Note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */
const s = {
  root: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },

  // Sidebar
  sidebar: {
    width: 280,
    minWidth: 240,
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
    margin: '10px 14px',
    padding: '7px 12px',
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text-tertiary)',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 },

  // Note list
  noteList: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  centeredMsg: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 13 },

  noteItem: {
    padding: '11px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
  },
  noteItemActive: { background: 'rgba(139,92,246,0.08)', borderLeft: '3px solid var(--primary)' },
  noteItemTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  noteItemSnippet: { fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  noteItemMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  linkBadge: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(139,92,246,0.1)', padding: '2px 7px', borderRadius: 999 },

  // Main panel
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  // Create form / Edit panel shared header
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
    overflow: 'hidden',
  },
  editTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    letterSpacing: -0.5,
  },
  editContent: {
    flex: 1,
    padding: '16px 24px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: 15,
    lineHeight: 1.8,
    resize: 'none',
    overflowY: 'auto',
  },

  // Tags
  tagFieldLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, paddingLeft: 24 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '0 24px' },
  tagInlineInput: {
    minWidth: 120, flex: 1,
    background: 'none', border: 'none', outline: 'none',
    color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  },

  // Sections
  section: { padding: '12px 24px', borderTop: '1px solid var(--border)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 },

  // Linked chips
  linkedChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 10px',
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13, color: 'var(--text)',
  },
  unlinkBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 },

  // Suggestions
  suggestionsBox: { border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  suggestionRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  dismissBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 },

  // Link picker
  linkPickerBox: {
    marginTop: 12,
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
    background: 'var(--surface)',
  },
  linkPickerList: { maxHeight: 220, overflowY: 'auto' },
  linkPickerRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', textAlign: 'left',
    padding: '9px 12px',
    background: 'none', border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit',
    transition: 'background 0.1s',
  },


  // Empty state
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text)', textAlign: 'center', padding: 40,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(109,40,217,0.1))',
    border: '1px solid rgba(139,92,246,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, marginBottom: 20,
    boxShadow: '0 0 40px rgba(139,92,246,0.1)',
  },
};
