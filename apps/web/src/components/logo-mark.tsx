/** Ícono de Kahal para ImageResponse (íconos PWA). Solo estilos inline. */
export function LogoMark({ size }: { size: number }) {
  const s = size;
  return (
    <div style={{ width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#4f46e5' }}>
      <svg width={s * 0.56} height={s * 0.56} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v5M9.5 4.5h5" />
        <path d="M4 21V12l8-5 8 5v9" />
        <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
        <path d="M2 21h20" />
      </svg>
    </div>
  );
}
