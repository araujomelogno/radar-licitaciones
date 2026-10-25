import type { Estado, MetodoAcceso, MotivoCodigo, Relevancia, Rol, Tipo } from './tipos';

export const ORG_ID = 'equipos';
export const DOMINIO = 'equipos.com.uy';
export const TZ = 'America/Montevideo';

export const ESTADOS: { clave: Estado; etiqueta: string }[] = [
  { clave: 'nueva', etiqueta: 'Nueva' },
  { clave: 'analizando', etiqueta: 'Analizando' },
  { clave: 'postular', etiqueta: 'Vamos a postular' },
  { clave: 'presentada', etiqueta: 'Nos presentamos' },
  { clave: 'evaluacion', etiqueta: 'En evaluación' },
  { clave: 'ganada', etiqueta: 'Ganada' },
  { clave: 'perdida', etiqueta: 'Perdida' },
  { clave: 'descartada', etiqueta: 'Descartada' },
];

export const ETIQUETA_ESTADO: Record<Estado, string> = Object.fromEntries(
  ESTADOS.map((e) => [e.clave, e.etiqueta]),
) as Record<Estado, string>;

/** Estados que cierran el ciclo: una oportunidad en ellos no está abierta. */
export const ESTADOS_CERRADOS: Estado[] = ['descartada', 'ganada', 'perdida'];

export const MOTIVOS_DESCARTE: { clave: MotivoCodigo; etiqueta: string }[] = [
  { clave: 'fuera_rubro', etiqueta: 'Fuera de rubro' },
  { clave: 'monto', etiqueta: 'Monto' },
  { clave: 'pais', etiqueta: 'País' },
  { clave: 'requisitos', etiqueta: 'Requisitos' },
  { clave: 'plazo', etiqueta: 'Plazo' },
  { clave: 'otro', etiqueta: 'Otro' },
];

export const ETIQUETA_RELEVANCIA: Record<Relevancia, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  sin_clasificar: 'Sin clasificar',
};

export const ORDEN_RELEVANCIA: Record<Relevancia, number> = { alta: 0, media: 1, sin_clasificar: 2, baja: 3 };

export const ETIQUETA_TIPO: Record<Tipo, string> = {
  consultoria_firma: 'Consultoría de firma',
  consultoria_individual: 'Consultoría individual',
  servicios: 'Servicios',
  expresion_interes: 'Expresión de interés',
  aviso_general: 'Aviso general',
  otro: 'Otro',
};

export const ETIQUETA_ROL: Record<Rol, string> = { admin: 'Admin', editor: 'Editor', lector: 'Lector' };

export const ETIQUETA_METODO: Record<MetodoAcceso, string> = {
  http: 'HTTP',
  navegador: 'Navegador sin interfaz',
  agente_local: 'Agente local',
  manual: 'Carga manual',
};

export const FUENTES_BASE: { id: string; nombre: string; slug: string; paises: string[] }[] = [
  { id: 'arce', nombre: 'Compras Estatales', slug: 'ce', paises: ['UY'] },
  { id: 'im', nombre: 'Intendencia de Montevideo', slug: 'im', paises: ['UY'] },
  { id: 'dncp', nombre: 'DNCP Paraguay', slug: 'dncp', paises: ['PY'] },
  { id: 'bm', nombre: 'Banco Mundial', slug: 'bm', paises: ['UY', 'PY'] },
  { id: 'bid', nombre: 'BID', slug: 'bid', paises: ['UY', 'PY'] },
  { id: 'ungm', nombre: 'UNGM', slug: 'ungm', paises: ['UY', 'PY'] },
  { id: 'cnd', nombre: 'CND', slug: 'cnd', paises: ['UY'] },
  { id: 'auci', nombre: 'AUCI', slug: 'auci', paises: ['UY'] },
  { id: 'fiap', nombre: 'FIAP', slug: 'fiap', paises: ['UY', 'PY'] },
  { id: 'ceibal', nombre: 'Ceibal', slug: 'ceibal', paises: ['UY'] },
];

export const CANALES_MANUALES: { clave: 'BEO' | 'CAF' | 'correo' | 'contacto' | 'otro'; etiqueta: string }[] = [
  { clave: 'BEO', etiqueta: 'BEO' },
  { clave: 'CAF', etiqueta: 'CAF' },
  { clave: 'correo', etiqueta: 'Correo' },
  { clave: 'contacto', etiqueta: 'Contacto' },
  { clave: 'otro', etiqueta: 'Otro' },
];

export const MAX_KEYWORDS = 200;
export const PAGINA = 50;
