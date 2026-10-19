'use client';

import React, { useState, useEffect, useRef } from 'react';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Link from 'next/link';

export default function DocumentsPage() {
  const { userToken } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docDetails, setDocDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'concepts' | 'chunks' | 'related'
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch documents list
  const fetchDocuments = async () => {
    try {
      const res = await api.get('/documents/');
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userToken) return;
    fetchDocuments();

    // Poll every 3 seconds if any document is processing
    const interval = setInterval(() => {
      setDocuments((prevDocs) => {
        const hasActive = prevDocs.some(
          (d) => d.status !== 'ready' && d.status !== 'failed'
        );
        if (hasActive) {
          fetchDocuments();
        }
        return prevDocs;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [userToken]);

  // Handle PDF Upload
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Invalid file type: Only genuine PDF documents (.pdf) are supported.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError('File exceeds 15 MB limit. Please select a smaller PDF.');
      return;
    }

    setUploadError(null);
    setUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 90) / (progressEvent.total || file.size)
          );
          setUploadProgress(percent);
        },
      });

      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchDocuments();
      }, 600);
    } catch (err) {
      console.error('Upload failed:', err);
      const detail = err.response?.data?.detail || err.message || 'Upload failed.';
      setUploadError(detail);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Open Document Detail Drawer
  const openDocumentDetails = async (doc) => {
    setSelectedDoc(doc);
    setLoadingDetails(true);
    setLoadingPdf(true);
    setActiveTab('preview');
    if (pdfBlobUrl) {
      window.URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }

    try {
      const res = await api.get(`/documents/${doc.id}`);
      setDocDetails(res.data);
      // Fetch related items
      fetchRelated(doc.id);
    } catch (err) {
      console.error('Failed to fetch doc details:', err);
    } finally {
      setLoadingDetails(false);
    }

    // Fetch PDF binary for in-modal preview
    try {
      const fileRes = await api.get(`/documents/${doc.id}/file`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }));
      setPdfBlobUrl(url);
    } catch (err) {
      console.error('Failed to fetch PDF blob for preview:', err);
    } finally {
      setLoadingPdf(false);
    }
  };

  const closeDocumentDetails = () => {
    if (pdfBlobUrl) {
      window.URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setSelectedDoc(null);
    setDocDetails(null);
  };

  const fetchRelated = async (docId) => {
    setLoadingRelated(true);
    try {
      const res = await api.get(`/documents/${docId}/related`);
      setRelatedItems(res.data.items || []);
    } catch (err) {
      console.error('Failed to fetch related items:', err);
      setRelatedItems([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Download PDF file
  const handleDownloadFile = async (docId, filename) => {
    try {
      const res = await api.get(`/documents/${docId}/file`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download document: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Delete Document
  const handleDelete = async (docId, filename) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? All chunks and associated provenance will be cleaned up.`)) {
      return;
    }
    try {
      await api.delete(`/documents/${docId}`);
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setDocDetails(null);
      }
      fetchDocuments();
    } catch (err) {
      alert('Failed to delete document: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Pipeline status badge helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ready':
        return <span style={{ ...styles.badge, ...styles.badgeReady }}>✓ Ready</span>;
      case 'failed':
        return <span style={{ ...styles.badge, ...styles.badgeFailed }}>✕ Failed</span>;
      case 'uploaded':
        return <span style={{ ...styles.badge, ...styles.badgeActive }}>⏳ Uploaded</span>;
      case 'text_extracted':
        return <span style={{ ...styles.badge, ...styles.badgeActive }}>📄 Text Extracted</span>;
      case 'concepts_extracted':
        return <span style={{ ...styles.badge, ...styles.badgeActive }}>🧠 Concepts Extracted</span>;
      case 'indexed_es':
        return <span style={{ ...styles.badge, ...styles.badgeActive }}>⚡ Indexed (ES)</span>;
      case 'graphed_neo4j':
        return <span style={{ ...styles.badge, ...styles.badgeActive }}>🕸️ Graphed (Neo4j)</span>;
      default:
        return <span style={styles.badge}>{status}</span>;
    }
  };

  if (!userToken) return null;

  return (
    <div style={styles.page}>
      <Navigation />

      <main style={styles.main}>
        {/* Header Section */}
        <section style={styles.heroSection}>
          <div style={styles.heroContent}>
            <h1 style={styles.pageTitle}>PDF Knowledge Base</h1>
            <p style={styles.pageSubtitle}>
              Stream university textbooks, slides, and papers. Concepts and prerequisite chains are automatically extracted across documents and synced into Neo4j and Elasticsearch.
            </p>
          </div>

          {/* Upload Card */}
          <div style={styles.uploadCard}>
            <input
              type="file"
              accept=".pdf,application/pdf"
              ref={fileInputRef}
              onChange={handleUpload}
              style={{ display: 'none' }}
              id="pdf-upload-input"
            />
            <label htmlFor="pdf-upload-input" style={styles.uploadLabel}>
              <div style={styles.uploadIcon}>📥</div>
              <div style={styles.uploadTextTitle}>
                {uploading ? 'Processing PDF Stream...' : 'Click or Drag PDF to Upload'}
              </div>
              <div style={styles.uploadSubtext}>
                Max 15 MB • Max 50 pages • 400-word sliding window chunking
              </div>
            </label>

            {uploading && (
              <div style={styles.progressContainer}>
                <div style={{ ...styles.progressBar, width: `${uploadProgress}%` }} />
                <span style={styles.progressText}>{uploadProgress}% uploaded</span>
              </div>
            )}

            {uploadError && (
              <div style={styles.errorBanner}>
                <span>⚠️ {uploadError}</span>
                <button onClick={() => setUploadError(null)} style={styles.clearErrBtn}>✕</button>
              </div>
            )}
          </div>
        </section>

        {/* Documents Grid / Table */}
        <section style={styles.docsSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>
              Uploaded Documents ({documents.length})
            </h2>
            <button onClick={fetchDocuments} style={styles.refreshBtn} title="Refresh list">
              🔄 Refresh
            </button>
          </div>

          {loading ? (
            <div style={styles.centered}>
              <div className="spinner" />
              <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Loading knowledge base...</p>
            </div>
          ) : documents.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📂</div>
              <h3>No Documents Ingested Yet</h3>
              <p>Upload lecture notes or textbook PDFs to extract concepts and generate customized study paths.</p>
            </div>
          ) : (
            <div style={styles.docGrid}>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    ...styles.docCard,
                    ...(selectedDoc?.id === doc.id ? styles.docCardSelected : {}),
                  }}
                  onClick={() => openDocumentDetails(doc)}
                >
                  <div style={styles.docCardHeader}>
                    <div style={styles.pdfBadge}>PDF</div>
                    {getStatusBadge(doc.status)}
                  </div>

                  <h3 style={styles.docTitle} title={doc.filename}>
                    {doc.filename}
                  </h3>

                  <div style={styles.docMeta}>
                    <span>📑 {doc.page_count} pages</span>
                    <span>🧩 {doc.chunk_count} chunks</span>
                    <span>💾 {(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>

                  {doc.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {doc.tags.map((t) => (
                        <span key={t} style={{ fontSize: 11, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {doc.status !== 'ready' && doc.status !== 'failed' && (
                    <div style={styles.processingBarWrap}>
                      <div style={styles.processingBarAnimation} />
                      <span style={{ fontSize: 11, color: 'var(--primary)' }}>Analyzing with Gemini...</span>
                    </div>
                  )}

                  <div style={styles.docCardActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadFile(doc.id, doc.filename)}
                      style={styles.actionBtn}
                      title="Download original PDF"
                    >
                      📥 File
                    </button>
                    <button
                      onClick={() => openDocumentDetails(doc)}
                      style={{ ...styles.actionBtn, color: 'var(--primary)' }}
                      title="Inspect extracted concepts & chunks"
                    >
                      🔍 Inspect
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id, doc.filename)}
                      style={{ ...styles.actionBtn, color: 'var(--danger)' }}
                      title="Delete document and cascade remove provenance"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Document Detail Modal / Drawer */}
        {selectedDoc && (
          <div style={styles.modalOverlay} onClick={closeDocumentDetails}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div>
                  <h2 style={styles.modalTitle}>{selectedDoc.filename}</h2>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
                    {getStatusBadge(selectedDoc.status)}
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      📑 {selectedDoc.page_count} pages • 💾 {(selectedDoc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      SHA256: {selectedDoc.file_sha256?.slice(0, 12)}...
                    </span>
                  </div>
                </div>
                <button onClick={closeDocumentDetails} style={styles.closeBtn}>✕</button>
              </div>

              {/* Tabs */}
              <div style={styles.tabBar}>
                <button
                  style={{ ...styles.tabBtn, ...(activeTab === 'preview' ? styles.tabBtnActive : {}) }}
                  onClick={() => setActiveTab('preview')}
                >
                  📄 PDF Preview
                </button>
                <button
                  style={{ ...styles.tabBtn, ...(activeTab === 'concepts' ? styles.tabBtnActive : {}) }}
                  onClick={() => setActiveTab('concepts')}
                >
                  🧠 Extracted Concepts ({docDetails?.concepts?.length || 0})
                </button>
                <button
                  style={{ ...styles.tabBtn, ...(activeTab === 'chunks' ? styles.tabBtnActive : {}) }}
                  onClick={() => setActiveTab('chunks')}
                >
                  🧩 Chunks ({docDetails?.chunks?.length || 0})
                </button>
                <button
                  style={{ ...styles.tabBtn, ...(activeTab === 'related' ? styles.tabBtnActive : {}) }}
                  onClick={() => setActiveTab('related')}
                >
                  🔗 Related Content ({relatedItems.length})
                </button>
              </div>

              {/* Tab Contents */}
              <div style={styles.tabBody}>
                {activeTab === 'preview' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={styles.infoBanner}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div>
                        <strong>Original Document Viewer:</strong> Read your uploaded PDF directly with native in-browser zoom and page navigation.
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleDownloadFile(selectedDoc.id, selectedDoc.filename)}
                          style={styles.actionBtnSmall}
                        >
                          ⬇️ Download
                        </button>
                        {pdfBlobUrl && (
                          <a
                            href={pdfBlobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.actionBtnSmall}
                          >
                            ↗️ Open in Tab
                          </a>
                        )}
                      </div>
                    </div>

                    {loadingPdf ? (
                      <div style={styles.centered}>
                        <div className="spinner" />
                        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Loading PDF document...</p>
                      </div>
                    ) : pdfBlobUrl ? (
                      <iframe
                        src={`${pdfBlobUrl}#toolbar=1`}
                        title={selectedDoc.filename}
                        style={{
                          width: '100%',
                          height: '520px',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: '#18181b',
                          flex: 1,
                        }}
                      />
                    ) : (
                      <div style={styles.centered}>
                        <p style={{ color: 'var(--text-tertiary)' }}>Unable to load PDF preview. Use the download button above.</p>
                      </div>
                    )}
                  </div>
                ) : loadingDetails ? (
                  <div style={styles.centered}><div className="spinner" /></div>
                ) : activeTab === 'concepts' ? (
                  <div style={styles.conceptsList}>
                    <div style={styles.infoBanner}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div>
                        <strong>What are Extracted Concepts?</strong> High-level technical topics, architectures, and algorithms discovered in this document by Gemini 2.5 Flash. Click <em>Study Path</em> on any concept to view prerequisite chains.
                      </div>
                    </div>

                    {(!docDetails?.concepts || docDetails.concepts.length === 0) ? (
                      <p style={{ color: 'var(--text-tertiary)', padding: 16 }}>
                        {selectedDoc.status === 'ready'
                          ? 'No distinct concepts extracted from this document.'
                          : 'Concepts are currently being extracted in the background...'}
                      </p>
                    ) : (
                      docDetails.concepts.map((c) => (
                        <div key={c.normalized_name} style={styles.conceptCard}>
                          <div style={styles.conceptCardHeader}>
                            <h4 style={styles.conceptName}>{c.name}</h4>
                            <Link
                              href={`/study-path?concept=${encodeURIComponent(c.normalized_name)}`}
                              style={styles.buildPathBtn}
                            >
                              🗺️ Study Path
                            </Link>
                          </div>
                          <p style={styles.conceptDesc}>
                            {c.description || 'Core concept extracted from PDF context.'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ) : activeTab === 'chunks' ? (
                  <div style={styles.chunksList}>
                    <div style={styles.infoBanner}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div>
                        <strong>What are Chunks?</strong> The document is partitioned into semantic segments (~400 words) to enable precise search, vector indexing, and granular concept mapping without hitting AI token limits.
                      </div>
                    </div>

                    {(!docDetails?.chunks || docDetails.chunks.length === 0) ? (
                      <p style={{ color: 'var(--text-tertiary)', padding: 16 }}>No chunks available.</p>
                    ) : (
                      docDetails.chunks.map((ch) => (
                        <div key={ch.id} style={styles.chunkCard}>
                          <div style={styles.chunkMeta}>
                            <span>Page {ch.page_number} • Chunk #{ch.chunk_index + 1}</span>
                            <span>{ch.word_count || ch.token_count || 0} words</span>
                          </div>
                          <p style={styles.chunkText}>{ch.text}</p>
                          {ch.extracted_concepts?.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {ch.extracted_concepts.map((ec) => (
                                <span key={ec} style={styles.chunkConceptTag}>#{ec}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div style={styles.relatedList}>
                    <div style={styles.infoBanner}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div>
                        <strong>What is Related Content?</strong> Cross-connections between this document and your other uploaded PDFs and text notes, discovered through shared extracted concepts and Elasticsearch semantic text similarity.
                      </div>
                    </div>

                    {loadingRelated ? (
                      <div style={styles.centered}><div className="spinner" /></div>
                    ) : relatedItems.length === 0 ? (
                      <p style={{ color: 'var(--text-tertiary)', padding: 16 }}>
                        No cross-linked documents or notes found yet. Create notes or upload more PDFs sharing concepts to see automatic links.
                      </p>
                    ) : (
                      relatedItems.map((item) => (
                        <div key={item.id} style={styles.relatedCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={item.source_type === 'document' ? styles.sourceBadgeDoc : styles.sourceBadgeNote}>
                              {item.source_type === 'document' ? '📄 Document' : '📝 Note'}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              Score: {item.score}
                            </span>
                          </div>
                          <h4 style={styles.relatedTitle}>{item.title}</h4>
                          <p style={styles.relatedReason}>💡 {item.similarity_reason}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  main: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
  },
  heroSection: {
    marginBottom: 40,
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: 32,
    alignItems: 'center',
  },
  heroContent: {},
  pageTitle: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: '-0.8px',
    marginBottom: 12,
  },
  pageSubtitle: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  uploadCard: {
    background: 'var(--surface)',
    border: '2px dashed var(--border)',
    borderRadius: 'var(--radius)',
    padding: '24px',
    textAlign: 'center',
    transition: 'border-color 0.2s ease',
  },
  uploadLabel: {
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  uploadTextTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
  },
  uploadSubtext: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  progressContainer: {
    marginTop: 16,
    background: 'var(--surface-hi)',
    borderRadius: 8,
    overflow: 'hidden',
    height: 12,
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--primary), #a855f7)',
    transition: 'width 0.2s ease',
  },
  progressText: {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginTop: 6,
    textAlign: 'center',
  },
  errorBanner: {
    marginTop: 12,
    padding: '8px 12px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    fontSize: 13,
    color: '#f87171',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearErrBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 14,
  },
  docsSection: {
    marginTop: 24,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
  },
  refreshBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  docGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 20,
  },
  docCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 20,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  docCardSelected: {
    borderColor: 'var(--primary)',
    boxShadow: '0 0 0 2px var(--primary-glow)',
  },
  docCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pdfBadge: {
    fontSize: 10,
    fontWeight: 800,
    background: '#ef4444',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: '0.5px',
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: 'var(--text-tertiary)',
    marginBottom: 16,
  },
  processingBarWrap: {
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  processingBarAnimation: {
    width: 14,
    height: 14,
    border: '2px solid var(--primary)',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  docCardActions: {
    display: 'flex',
    gap: 8,
    borderTop: '1px solid var(--border)',
    paddingTop: 14,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 999,
    background: 'var(--surface-hi)',
    color: 'var(--text-secondary)',
  },
  badgeReady: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  badgeFailed: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  badgeActive: {
    background: 'rgba(139, 92, 246, 0.15)',
    color: 'var(--primary)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  centered: {
    textAlign: 'center',
    padding: 40,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  },
  modalContent: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    width: '100%',
    maxWidth: 960,
    height: '88vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 18,
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
    padding: '0 16px',
  },
  tabBtn: {
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
  tabBtnActive: {
    color: 'var(--primary)',
    borderBottomColor: 'var(--primary)',
    fontWeight: 600,
  },
  tabBody: {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
  },
  conceptsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  conceptCard: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 14,
  },
  conceptCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  conceptName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
  },
  buildPathBtn: {
    fontSize: 12,
    color: 'var(--primary)',
    textDecoration: 'none',
    fontWeight: 500,
  },
  conceptDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  chunksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  chunkCard: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 14,
  },
  chunkMeta: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chunkText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
  },
  relatedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  relatedCard: {
    background: 'var(--surface-hi)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 14,
  },
  sourceBadgeDoc: {
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    padding: '2px 8px',
    borderRadius: 4,
  },
  sourceBadgeNote: {
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#fbbf24',
    padding: '2px 8px',
    borderRadius: 4,
  },
  relatedTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    marginTop: 6,
    marginBottom: 4,
  },
  relatedReason: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    fontSize: 13,
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  actionBtnSmall: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--primary)',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  chunkConceptTag: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'rgba(139, 92, 246, 0.15)',
    color: '#c084fc',
    fontWeight: 600,
  },
};
