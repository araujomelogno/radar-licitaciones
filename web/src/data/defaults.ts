import type { Config } from '../lib/tipos';

/** Valores por defecto mientras config/* no exista o le falten campos. */
export const CONFIG_DEFECTO: Config = {
  perfil: {
    servicios: [],
    sectores: [],
    antecedentes: [],
    paises: ['Uruguay', 'Paraguay'],
    rangoMonto: { min: null, max: null, moneda: 'USD' },
  },
  busqueda: {
    incluir: [],
    excluir: [],
    excluirRubros: [],
    porFuente: {},
    umbrales: { alta: 70, media: 40 },
    ventanaDias: 7,
  },
  sistema: {
    modelo: 'gemini-3.1-flash-lite',
    promptVersion: 'v1',
    destinatariosExtra: [],
  },
};

export function completarConfig(parcial: Partial<{ perfil: object; busqueda: object; sistema: object }>): Config {
  const p = (parcial.perfil ?? {}) as Partial<Config['perfil']>;
  const b = (parcial.busqueda ?? {}) as Partial<Config['busqueda']>;
  const s = (parcial.sistema ?? {}) as Partial<Config['sistema']>;
  return {
    perfil: {
      ...CONFIG_DEFECTO.perfil,
      ...p,
      rangoMonto: { ...CONFIG_DEFECTO.perfil.rangoMonto, ...(p.rangoMonto ?? {}) },
    },
    busqueda: {
      ...CONFIG_DEFECTO.busqueda,
      ...b,
      umbrales: { ...CONFIG_DEFECTO.busqueda.umbrales, ...(b.umbrales ?? {}) },
      porFuente: b.porFuente ?? {},
    },
    sistema: { ...CONFIG_DEFECTO.sistema, ...s, destinatariosExtra: s.destinatariosExtra ?? [] },
  };
}
