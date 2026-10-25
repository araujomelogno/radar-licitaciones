// Lógica pura de las Cloud Functions, separada para testearla sin Firebase.

export const DOMINIO = "equipos.com.uy";
export const ORG_ID = "equipos";
export const ROLES = ["admin", "editor", "lector"] as const;
export type Rol = (typeof ROLES)[number];
export const TZ = "America/Montevideo";
export const LOCK_MINUTOS = 60;

export function emailDelDominio(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DOMINIO}`);
}

export function rolValido(rol: unknown): rol is Rol {
  return typeof rol === "string" && (ROLES as readonly string[]).includes(rol);
}

function partes(fecha: Date): Record<string, string> {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  return Object.fromEntries(p.map((x) => [x.type, x.value]));
}

/** `AAAAMMDD-HHMMSS-manual` en hora de Montevideo (mismo formato que el workflow). */
export function nuevoCorridaId(fecha: Date, disparo: "manual" | "programada" = "manual"): string {
  const o = partes(fecha);
  return `${o.year}${o.month}${o.day}-${o.hour}${o.minute}${o.second}-${disparo}`;
}

export function horaLocal(fecha: Date): string {
  const o = partes(fecha);
  return `${o.hour}:${o.minute}`;
}

export function mensajeCorridaEnCurso(inicio: Date): string {
  return `ya hay una corrida en curso, empezó a las ${horaLocal(inicio)}`;
}

export function lockVigente(lock: { corridaId?: string; expira?: Date } | undefined, ahora: Date): boolean {
  return !!lock?.corridaId && !!lock.expira && lock.expira.getTime() > ahora.getTime();
}

export function idInvitacion(email: string): string {
  return `invitacion-${email.toLowerCase().replace(/[^a-z0-9@._-]/g, "")}`;
}

// Campos que escribe el pipeline o el propio guardado: no son cambios de configuración.
const CAMPOS_SISTEMA = new Set([
  "actualizado", "actualizadoPor", "version", "orgId", "ultimaCorrida", "ceroConsecutivos", "pruebaAcceso",
]);

type Valor = unknown;

function igual(a: Valor, b: Valor): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
}

function normalizar(v: Valor): Valor {
  if (v && typeof v === "object" && "toDate" in (v as object) && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(v)) return v.map(normalizar);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, normalizar((v as Record<string, Valor>)[k])]));
  }
  return v ?? null;
}

/** Diferencia campo a campo para `auditoria`, sin los campos que maneja el sistema. */
export function diferencias(
  antes: Record<string, Valor> | undefined,
  despues: Record<string, Valor> | undefined,
): Record<string, { de: Valor; a: Valor }> {
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  const cambios: Record<string, { de: Valor; a: Valor }> = {};
  for (const k of claves) {
    if (CAMPOS_SISTEMA.has(k)) continue;
    const de = antes?.[k] ?? null;
    const a = despues?.[k] ?? null;
    if (!igual(de, a)) cambios[k] = { de: normalizar(de), a: normalizar(a) };
  }
  return cambios;
}
