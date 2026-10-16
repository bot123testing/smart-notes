'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: 40, textAlign: 'center' }}>
        <h2>Application Error</h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>{error?.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 20,
            padding: '10px 20px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
