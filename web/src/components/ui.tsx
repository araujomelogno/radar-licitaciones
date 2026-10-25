import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_RELEVANCIA, MAX_KEYWORDS } from '../lib/constantes';
import { sinDuplicados, normalizar } from '../lib/helpers';
import type { Estado, Relevancia } from '../lib/tipos';

// ── Íconos (trazo simple, heredan color) ────────────────────────────────
const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const Icono = {
  radar: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12l6-6" />
    </>,
  ),
  registro: svg(
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>,
  ),
  config: svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </>,
  ),
  buscar: svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>,
  ),
  sol: svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  ),
  luna: svg(<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />),
};

// ── Chips ───────────────────────────────────────────────────────────────
export function EstadoChip({ estado }: { estado: Estado }) {
  return <span className={`est est-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

export function RelevanciaBadge({ relevancia, puntaje }: { relevancia: Relevancia; puntaje?: number | null }) {
  return (
    <span className={`rel rel-${relevancia}`} title={puntaje != null ? `Puntaje ${puntaje}/100` : undefined}>
      {ETIQUETA_RELEVANCIA[relevancia]}
      {puntaje != null && <span className="pts">· {puntaje}</span>}
    </span>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────
export function Modal({
  titulo,
  onCerrar,
  children,
  pie,
  ancho,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: number;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    // Foco en el diálogo (no en un campo) para no abrir el teclado en el celular.
    caja.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      previo?.focus?.();
    };
  }, [onCerrar]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby={id} ref={caja} tabIndex={-1} style={ancho ? { maxWidth: ancho } : undefined}>
        <div className="modal-head">
          <div className="modal-title" id={id}>
            {titulo}
          </div>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {pie && <div className="modal-foot">{pie}</div>}
      </div>
    </div>
  );
}

// ── Lista de etiquetas (keywords, servicios, sectores) ──────────────────
export function TagInput({
  valor,
  onChange,
  placeholder,
  max = MAX_KEYWORDS,
  id,
  deshabilitado,
}: {
  valor: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtro, setFiltro] = useState('');

  const agregar = (crudo: string) => {
    const nuevos = crudo
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!nuevos.length) return;
    const antes = valor.length;
    const combinado = sinDuplicados([...valor, ...nuevos]);
    if (combinado.length > max) {
      setAviso(`Máximo ${max} por lista. Sacá alguna antes de agregar.`);
      onChange(combinado.slice(0, max));
    } else if (combinado.length - antes < nuevos.length) {
      setAviso('Algunas ya estaban en la lista y no se repitieron.');
      onChange(combinado);
    } else {
      setAviso('');
      onChange(combinado);
    }
    setTexto('');
  };

  const visibles = filtro ? valor.filter((v) => normalizar(v).includes(normalizar(filtro))) : valor;

  return (
    <div>
      {valor.length > 30 && (
        <input className="input input-sm tags-filter" placeholder="Filtrar la lista…" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar la lista" />
      )}
      <div className="tags">
        {visibles.map((t) => (
          <span key={t} className="tag">
            {t}
            {!deshabilitado && (
              <button type="button" aria-label={`Quitar ${t}`} onClick={() => onChange(valor.filter((x) => x !== t))}>
                ×
              </button>
            )}
          </span>
        ))}
        {!deshabilitado && (
          <input
            id={id}
            value={texto}
            placeholder={placeholder ?? 'Escribí y apretá Enter'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                agregar(texto);
              } else if (e.key === 'Backspace' && !texto && valor.length) {
                onChange(valor.slice(0, -1));
              }
            }}
            onBlur={() => texto && agregar(texto)}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text');
              if (/[,;\n]/.test(t)) {
                e.preventDefault();
                agregar(t);
              }
            }}
          />
        )}
      </div>
      <div className="tags-meta">
        <span className={aviso ? 'field-error' : ''} style={{ marginTop: 0 }}>
          {aviso}
        </span>
        <span className="mono">
          {valor.length}/{max}
        </span>
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="empty-state">
      <div className="spinner" />
      <p className="mt-2">{texto}</p>
    </div>
  );
}
