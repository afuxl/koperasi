'use client';

export default function Loader({ text = 'Memuat Data..', visible = true }) {
  if (!visible) return null;
  return (
    <div id="loader" style={{
      position: 'fixed', inset: 0,
      background: 'rgba(255,255,255,0.8)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      zIndex: 9999,
    }}>
      <i className="fas fa-circle-notch fa-spin fa-4x" style={{ color: 'var(--primary)', textShadow: '0 4px 12px rgba(211,47,47,0.3)' }} />
      <p style={{
        marginTop: 20, fontWeight: 600,
        color: 'var(--text-main)', fontSize: '1.1rem', letterSpacing: '0.5px',
      }}>{text}</p>
    </div>
  );
}
