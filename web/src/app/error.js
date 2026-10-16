'use client';

export default function Error({ error, reset }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 20, marginBottom: 10 }}>Something went wrong!</h2>
      <p style={{ color: '#ef4444', fontSize: 14 }}>{error?.message}</p>
      <button
        onClick={() => reset()}
        style={{
          marginTop: 16,
          padding: '8px 16px',
          backgroundColor: '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer'
        }}
      >
        Try Again
      </button>
    </div>
  );
}
