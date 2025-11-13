import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1419 100%)',
      color: '#fff',
      fontFamily: '"Georgia", "Times New Roman", "Times", serif'
    }}>
      <h1 style={{ fontSize: '4rem', margin: '0 0 1rem 0', fontWeight: 800 }}>404</h1>
      <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0', fontWeight: 700 }}>Page Not Found</h2>
      <p style={{ fontSize: '1.125rem', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '2rem' }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link 
        href="/"
        style={{
          padding: '0.75rem 1.5rem',
          background: 'rgba(99, 102, 241, 0.8)',
          border: '1px solid rgba(99, 102, 241, 0.5)',
          borderRadius: '10px',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: '0.875rem',
          transition: 'all 0.2s'
        }}
      >
        Go Home
      </Link>
    </div>
  );
}

