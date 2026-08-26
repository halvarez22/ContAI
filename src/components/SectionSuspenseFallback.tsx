/**
 * Fallback Suspense ultraligero (H2).
 * Sin Design System (Skeleton/Spinner) — no anular el lazy loading.
 */

export function SectionSuspenseFallback({
  label = 'Cargando módulo…',
}: {
  label?: string;
}) {
  return (
    <div
      className="contai-suspense-fallback"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="contai-suspense-fallback__dot" aria-hidden />
      <span className="contai-suspense-fallback__text">{label}</span>
      <style>{`
        .contai-suspense-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: 8rem;
          padding: 1.5rem;
          color: #64748b;
          font-size: 0.875rem;
          font-family: system-ui, sans-serif;
        }
        .contai-suspense-fallback__dot {
          width: 0.625rem;
          height: 0.625rem;
          border-radius: 9999px;
          background: #94a3b8;
          animation: contai-suspense-pulse 1s ease-in-out infinite;
        }
        @keyframes contai-suspense-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
