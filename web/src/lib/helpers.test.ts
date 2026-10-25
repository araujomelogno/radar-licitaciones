import { describe, expect, it } from 'vitest';
import {
  celdaCsv,
  cierraEn7Dias,
  desdeFechaInput,
  diasRestantes,
  docIdManual,
  esEmailDominio,
  estaAbierta,
  registroACsv,
  relevanciaDe,
  sinDuplicados,
  slug,
  textoCierre,
} from './helpers';
import type { Oportunidad } from './tipos';

const U = { alta: 70, media: 40 };

function op(p: Partial<Oportunidad> = {}): Oportunidad {
  return {
    docId: 'ce-1',
    fuente: 'Compras Estatales',
    titulo: 'Encuesta de satisfacción',
    organismo: 'MIDES',
    pais: 'Uruguay',
    tipo: 'servicios',
    url: 'https://example.org',
    publicado: null,
    cierre: null,
    fuentes: ['Compras Estatales'],
    detectado: null,
    relevancia: 'sin_clasificar',
    puntaje: null,
    estado: 'nueva',
    historial: [],
    ...p,
  };
}

describe('relevanciaDe', () => {
  it('deriva del puntaje con los umbrales', () => {
    expect(relevanciaDe(op({ puntaje: 70 }), U)).toBe('alta');
    expect(relevanciaDe(op({ puntaje: 69 }), U)).toBe('media');
    expect(relevanciaDe(op({ puntaje: 40 }), U)).toBe('media');
    expect(relevanciaDe(op({ puntaje: 39 }), U)).toBe('baja');
  });
  it('cambiar el umbral cambia la relevancia sin reclasificar', () => {
    expect(relevanciaDe(op({ puntaje: 65, relevancia: 'media' }), { alta: 60, media: 30 })).toBe('alta');
  });
  it('sin puntaje respeta la relevancia guardada', () => {
    expect(relevanciaDe(op({ puntaje: null, relevancia: 'sin_clasificar' }), U)).toBe('sin_clasificar');
    expect(relevanciaDe(op({ puntaje: null, relevancia: 'baja' }), U)).toBe('baja');
  });
  it('sin umbrales (lector) usa la relevancia guardada', () => {
    expect(relevanciaDe(op({ puntaje: 90, relevancia: 'media' }), null)).toBe('media');
  });
});

describe('abierta y cierres', () => {
  const ahora = new Date('2026-10-25T12:00:00-03:00');
  it('sin cierre está abierta y no cuenta en 7 días', () => {
    expect(estaAbierta(op(), ahora)).toBe(true);
    expect(cierraEn7Dias(op(), ahora)).toBe(false);
    expect(textoCierre(null, ahora)).toBe('Fecha a confirmar');
  });
  it('descartada no está abierta', () => {
    expect(estaAbierta(op({ estado: 'descartada' }), ahora)).toBe(false);
  });
  it('cierre pasado no está abierta', () => {
    expect(estaAbierta(op({ cierre: new Date('2026-10-24T23:59:00-03:00') }), ahora)).toBe(false);
  });
  it('días restantes en hora de Montevideo', () => {
    expect(diasRestantes(new Date('2026-10-25T23:59:00-03:00'), ahora)).toBe(0);
    // 01:00 UTC del 26 sigue siendo el 25 en Montevideo.
    expect(diasRestantes(new Date('2026-10-26T01:00:00Z'), ahora)).toBe(0);
    expect(diasRestantes(new Date('2026-11-01T23:59:00-03:00'), ahora)).toBe(7);
    expect(cierraEn7Dias(op({ cierre: new Date('2026-11-01T23:59:00-03:00') }), ahora)).toBe(true);
    expect(cierraEn7Dias(op({ cierre: new Date('2026-11-02T23:59:00-03:00') }), ahora)).toBe(false);
  });
  it('fecha de formulario sin hora se toma 23:59 local', () => {
    expect(desdeFechaInput('2026-11-10')?.toISOString()).toBe('2026-11-11T02:59:00.000Z');
    expect(desdeFechaInput('')).toBeNull();
  });
});

describe('slug y ids', () => {
  it('slug sin tildes ni signos', () => {
    expect(slug('Evaluación de impacto — Programa Uruguay Crece Contigo!')).toBe('evaluacion-de-impacto-programa-uruguay-c');
    expect(slug('¿?')).toBe('llamado');
  });
  it('docId manual', () => {
    expect(docIdManual('Línea de base BEO')).toMatch(/^manual-linea-de-base-beo-[0-9a-f]{6}$/);
  });
});

describe('keywords y emails', () => {
  it('sin duplicados ignora mayúsculas y tildes', () => {
    expect(sinDuplicados(['Encuesta', 'encuesta', ' evaluación ', 'evaluacion', ''])).toEqual(['Encuesta', 'evaluación']);
  });
  it('dominio', () => {
    expect(esEmailDominio('ana@equipos.com.uy')).toBe(true);
    expect(esEmailDominio('ana@gmail.com')).toBe(false);
    expect(esEmailDominio('ana@equipos.com.uy.evil.com')).toBe(false);
  });
});

describe('CSV', () => {
  it('escapa comillas, comas y saltos', () => {
    expect(celdaCsv('a,b')).toBe('"a,b"');
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv(null)).toBe('');
  });
  it('exporta cabecera y filas', () => {
    const csv = registroACsv([op({ puntaje: 80, nota: 'línea 1\nlínea 2' })], U);
    const lineas = csv.split('\r\n');
    expect(lineas[0].startsWith('ID,Título,Organismo')).toBe(true);
    expect(csv).toContain('Alta');
    expect(csv).toContain('"línea 1\nlínea 2"');
    expect(csv).toContain('Fecha a confirmar');
  });
});
