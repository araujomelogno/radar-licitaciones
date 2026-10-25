import { ESTADOS_CERRADOS, ETIQUETA_ESTADO, ETIQUETA_RELEVANCIA, ETIQUETA_TIPO, ORDEN_RELEVANCIA, TZ } from './constantes';
import type { Oportunidad, Relevancia, Umbrales } from './tipos';

// ── Relevancia ──────────────────────────────────────────────────────────

/**
 * La relevancia no la decide el modelo: se deriva del puntaje con los umbrales vigentes.
 * Sin puntaje se respeta la relevancia guardada (prefiltro, sin clasificar o manual).
 */
export function relevanciaDe(op: Pick<Oportunidad, 'puntaje' | 'relevancia' | 'manual'>, u: Umbrales | null): Relevancia {
  // Sin umbrales (el lector no lee config/*) se usa la relevancia que guardó el pipeline.
  if (!u || op.puntaje === null || op.puntaje === undefined || Number.isNaN(op.puntaje)) {
    return op.relevancia ?? 'sin_clasificar';
  }
  if (op.puntaje >= u.alta) return 'alta';
  if (op.puntaje >= u.media) return 'media';
  return 'baja';
}

export function esDescartePrefiltro(op: Pick<Oportunidad, 'prefiltro'>): boolean {
  return !!op.prefiltro && op.prefiltro.paso === false;
}

// ── Fechas (siempre en hora de Montevideo) ──────────────────────────────

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD del instante en la zona de Montevideo. */
export function diaLocal(d: Date): string {
  return fmtDia.format(d);
}

function diaANumero(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Días calendario que faltan hasta el cierre (0 = cierra hoy, negativo = ya cerró). null si no hay fecha. */
export function diasRestantes(cierre: Date | null | undefined, ahora: Date = new Date()): number | null {
  if (!cierre) return null;
  return diaANumero(diaLocal(cierre)) - diaANumero(diaLocal(ahora));
}

export function estaAbierta(op: Pick<Oportunidad, 'cierre' | 'estado'>, ahora: Date = new Date()): boolean {
  if (ESTADOS_CERRADOS.includes(op.estado)) return false;
  return !op.cierre || op.cierre.getTime() > ahora.getTime();
}

/** Abierta y con cierre conocido dentro de los próximos 7 días. Sin fecha no cuenta. */
export function cierraEn7Dias(op: Pick<Oportunidad, 'cierre' | 'estado'>, ahora: Date = new Date()): boolean {
  if (!op.cierre || !estaAbierta(op, ahora)) return false;
  const d = diasRestantes(op.cierre, ahora);
  return d !== null && d >= 0 && d <= 7;
}

export function textoCierre(cierre: Date | null | undefined, ahora: Date = new Date()): string {
  const d = diasRestantes(cierre, ahora);
  if (d === null) return 'Fecha a confirmar';
  if (cierre && cierre.getTime() <= ahora.getTime()) return 'Cerrado';
  if (d === 0) return 'Cierra hoy';
  if (d === 1) return 'Cierra mañana';
  return `Cierra en ${d} días`;
}

const fmtFecha = new Intl.DateTimeFormat('es-UY', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = new Intl.DateTimeFormat('es-UY', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fmtHora = new Intl.DateTimeFormat('es-UY', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const fecha = (d: Date | null | undefined) => (d ? fmtFecha.format(d) : '—');
export const fechaHora = (d: Date | null | undefined) => (d ? fmtFechaHora.format(d) : '—');
export const hora = (d: Date | null | undefined) => (d ? fmtHora.format(d) : '—');

/** Valor para <input type="date"> en hora de Montevideo. */
export const fechaInput = (d: Date | null | undefined) => (d ? diaLocal(d) : '');

/** Un cierre sin hora se toma a las 23:59 hora de Montevideo (UTC-3). */
export function desdeFechaInput(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T23:59:00-03:00`);
}

// ── Montos ──────────────────────────────────────────────────────────────

export function monto(valor: number | null | undefined, moneda: string | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const m = moneda || 'USD';
  try {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: m,
      currencyDisplay: m === 'PYG' ? 'code' : 'symbol',
      maximumFractionDigits: 0,
    }).format(valor);
  } catch {
    return `${m} ${valor.toLocaleString('es-UY')}`;
  }
}

// ── Texto ───────────────────────────────────────────────────────────────

export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function slug(s: string, max = 40): string {
  const base = normalizar(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, max).replace(/-+$/g, '') || 'llamado';
}

export function hex6(): string {
  const a = new Uint8Array(3);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function docIdManual(titulo: string): string {
  return `manual-${slug(titulo)}-${hex6()}`;
}

/** Quita duplicados (sin distinguir mayúsculas ni tildes) y vacíos, conservando el primero. */
export function sinDuplicados(lista: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const raw of lista) {
    const v = raw.trim();
    const k = normalizar(v);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(v);
  }
  return out;
}

export function esEmailDominio(email: string, dominio = 'equipos.com.uy'): boolean {
  return new RegExp(`^[^\\s@]+@${dominio.replace(/\./g, '\\.')}$`, 'i').test(email.trim());
}

export function iniciales(nombre?: string, email?: string): string {
  const src = (nombre || email || '?').trim();
  const partes = src.split(/[\s.@]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// ── Orden y búsqueda ────────────────────────────────────────────────────

export function compararPorRelevanciaYCierre(u: Umbrales | null) {
  return (a: Oportunidad, b: Oportunidad) => {
    const ra = ORDEN_RELEVANCIA[relevanciaDe(a, u)];
    const rb = ORDEN_RELEVANCIA[relevanciaDe(b, u)];
    if (ra !== rb) return ra - rb;
    const ca = a.cierre?.getTime() ?? Number.POSITIVE_INFINITY;
    const cb = b.cierre?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return (b.puntaje ?? -1) - (a.puntaje ?? -1);
  };
}

/** Texto indexable de una oportunidad, sin tildes, para la búsqueda libre. */
export function textoBusqueda(op: Oportunidad): string {
  return normalizar(
    [op.titulo, op.organismo, op.resumen, op.motivo, op.nota, op.fuentes.join(' '), op.docId, op.idOficial].join(' '),
  );
}

// ── CSV ─────────────────────────────────────────────────────────────────

export function celdaCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? fechaHora(v) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registroACsv(ops: Oportunidad[], u: Umbrales | null): string {
  const cab = [
    'ID',
    'Título',
    'Organismo',
    'País',
    'Fuentes',
    'Tipo',
    'Publicado',
    'Cierre',
    'Relevancia',
    'Puntaje',
    'Estado',
    'Motivo de descarte',
    'Nota',
    'Monto',
    'Moneda',
    'URL',
  ];
  const filas = ops.map((op) => [
    op.docId,
    op.titulo,
    op.organismo,
    op.pais ?? '',
    op.fuentes.join(' / '),
    op.tipo ? ETIQUETA_TIPO[op.tipo] : '',
    op.publicado ? fecha(op.publicado) : '',
    op.cierre ? fechaHora(op.cierre) : 'Fecha a confirmar',
    ETIQUETA_RELEVANCIA[relevanciaDe(op, u)],
    op.puntaje ?? '',
    ETIQUETA_ESTADO[op.estado],
    op.motivoDescarte ? `${op.motivoDescarte.codigo}${op.motivoDescarte.texto ? `: ${op.motivoDescarte.texto}` : ''}` : '',
    op.nota ?? '',
    op.monto ?? '',
    op.moneda ?? '',
    op.url,
  ]);
  return [cab, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n');
}

export function descargarArchivo(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  // BOM para que Excel abra bien las tildes.
  const blob = new Blob(['﻿', contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
