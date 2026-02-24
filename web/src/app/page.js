'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import styles from './page.module.css';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { userToken, logout } = useAuth();
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!userToken) {
      router.push('/login');
      return;
    }
    fetchNotes();
  }, [userToken]);

  const fetchNotes = async () => {
    try {
      const res = await api.get('/notes/');
      setNotes(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/notes/', { title, content });
      setTitle('');
      setContent('');
      fetchNotes();
    } catch (err) {
      alert('Failed to create note');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/notes/${id}`);
      fetchNotes();
    } catch (err) {
      alert('Failed to delete');
    }
  }

  if (!userToken) return null;

  return (
    <main className={styles.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '800px' }}>
        <h1>Smart Notes+</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => router.push('/analytics')}
            style={{ padding: '0.4rem 0.9rem', background: 'transparent', color: '#6366f1', border: '1px solid #6366f1', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            📉 Analytics
          </button>
          <button
            onClick={() => router.push('/graph')}
            style={{ padding: '0.4rem 0.9rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            🧠 Knowledge Graph
          </button>
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '800px', margin: '2rem 0' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            style={{ padding: '0.5rem' }}
          />
          <textarea
            placeholder="Content"
            value={content}
            onChange={e => setContent(e.target.value)}
            required
            style={{ padding: '0.5rem', minHeight: '100px' }}
          />
          <button type="submit" style={{ padding: '0.5rem', background: '#0070f3', color: 'white', border: 'none' }}>Add Note</button>
        </form>
      </div>

      <div style={{ width: '100%', maxWidth: '800px' }}>
        {notes.map(note => (
          <div key={note._id} style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem', borderRadius: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>{note.title}</h3>
              <button onClick={() => handleDelete(note._id)} style={{ color: 'red' }}>X</button>
            </div>
            <p>{note.content}</p>
          </div>
        ))}
        {notes.length === 0 && <p>No notes yet.</p>}
      </div>
    </main>
  );
}
