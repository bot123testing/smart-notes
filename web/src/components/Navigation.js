'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Navigation({ isDark, onToggleTheme }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const navItems = [
    { href: '/', label: 'Notes', icon: '📝' },
    { href: '/documents', label: 'PDF Documents', icon: '📚' },
    { href: '/study-path', label: 'Study Paths', icon: '🗺️' },
    { href: '/concept-graph', label: 'Concept Graph', icon: '🧠' },
    { href: '/analytics', label: 'Analytics', icon: '📊' },
  ];

  return (
    <header style={styles.header}>
      <div style={styles.leftSection}>
        <Link href="/" style={styles.brand}>
          <div style={styles.brandLogo}>✦</div>
          <span style={styles.brandTitle}>Smart Notes+</span>
          <span style={styles.brandBadge}>Study Path</span>
        </Link>

        <nav style={styles.nav}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                }}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={styles.rightSection}>
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            style={styles.iconBtn}
            title={isDark ? 'Switch to Light' : 'Switch to Dark'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        )}
        <button
          onClick={logout}
          style={styles.logoutBtn}
          title="Sign out of your account"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}

const styles = {
  header: {
    height: 56,
    background: 'rgba(26, 26, 30, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 32,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
  },
  brandLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    boxShadow: '0 2px 8px var(--primary-glow)',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.3px',
  },
  brandBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--primary-glow)',
    color: 'var(--primary)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  },
  navLinkActive: {
    color: 'var(--text)',
    background: 'var(--surface-hi)',
    fontWeight: 600,
    boxShadow: 'inset 0 0 0 1px var(--border)',
  },
  navIcon: {
    fontSize: 14,
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.15s ease',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
