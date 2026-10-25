// Datos de ejemplo para el modo demo. Son ficticios pero con la forma real de los documentos.
import { FUENTES_BASE } from '../lib/constantes';
import type { Config, Corrida, Estado, Fuente, Oportunidad, Pais, Relevancia, Tipo, Usuario } from '../lib/tipos';

const DIA = 86_400_000;

function cierreEn(dias: number | null, ahora: number): Date | null {
  if (dias === null) return null;
  // Cierre a las 23:59 de Montevideo del día indicado (aprox.: 02:59 UTC del día siguiente).
  const d = new Date(ahora + dias * DIA);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(d);
  return new Date(`${ymd}T23:59:00-03:00`);
}

interface Semilla {
  id: string;
  fuente: string;
  titulo: string;
  organismo: string;
  pais: Pais;
  tipo: Tipo;
  cierre: number | null;
  puntaje: number | null;
  relevancia?: Relevancia;
  resumen: string;
  motivo: string;
  servicios?: string[];
  estado?: Estado;
  nota?: string;
  monto?: number;
  moneda?: string;
  financiador?: string;
  admiteExtranjeras?: boolean | null;
  fuentesExtra?: string[];
  nueva?: boolean;
  prefiltro?: string;
  publicadoHace?: number;
}

const SEMILLAS: Semilla[] = [
  {
    id: 'bm-OP00473712',
    fuente: 'Banco Mundial',
    titulo: 'Expresión de interés · Evaluación de impacto del Programa de Inclusión Educativa',
    organismo: 'Ministerio de Educación y Cultura (MEC)',
    pais: 'Uruguay',
    tipo: 'expresion_interes',
    cierre: 12,
    puntaje: 88,
    resumen: 'Evaluación de impacto cuasi-experimental con encuesta a hogares en 4 departamentos, financiada por el Banco Mundial.',
    motivo: 'Objeto principal es una evaluación de impacto con trabajo de campo: núcleo de Equipos.',
    servicios: ['evaluacion_impacto', 'encuesta_hogares'],
    financiador: 'Banco Mundial',
    nueva: true,
    fuentesExtra: ['UNGM'],
  },
  {
    id: 'ce-1378357',
    fuente: 'Compras Estatales',
    titulo: 'Licitación Abreviada 14/2026 · Encuesta de satisfacción de usuarios del Sistema Nacional de Cuidados',
    organismo: 'Ministerio de Desarrollo Social (MIDES)',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: 5,
    puntaje: 82,
    resumen: 'Encuesta telefónica y presencial a 1.200 usuarios y cuidadores, con informe de resultados por departamento.',
    motivo: 'Encuesta de satisfacción con trabajo de campo propio; monto dentro del rango.',
    servicios: ['encuesta_hogares', 'otro'],
    monto: 2_400_000,
    moneda: 'UYU',
    estado: 'analizando',
    nota: 'Lo mira Lucía. Pedir aclaración sobre muestra mínima.',
  },
  {
    id: 'dncp-452311',
    fuente: 'DNCP Paraguay',
    titulo: 'Concurso de Ofertas 12/2026 · Línea de base del programa Hambre Cero en escuelas',
    organismo: 'Ministerio de Desarrollo Social (MDS) · Paraguay',
    pais: 'Paraguay',
    tipo: 'consultoria_firma',
    cierre: 9,
    puntaje: 76,
    resumen: 'Línea de base con encuesta a 300 escuelas y entrevistas a referentes. Monto estimado ₲ 1.150.000.000; admite firmas extranjeras.',
    motivo: 'Línea de base con relevamiento en campo; Paraguay dentro del alcance.',
    servicios: ['linea_base', 'cualitativo'],
    monto: 1_150_000_000,
    moneda: 'PYG',
    financiador: 'BID',
    admiteExtranjeras: true,
    fuentesExtra: ['BID'],
    nueva: true,
  },
  {
    id: 'im-D197177',
    fuente: 'Intendencia de Montevideo',
    titulo: 'Compra Directa D197177 · Estudio de percepción ciudadana sobre movilidad urbana',
    organismo: 'Intendencia de Montevideo · Departamento de Movilidad',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: 3,
    puntaje: 71,
    resumen: 'Estudio de percepción con encuesta online y grupos focales sobre el sistema de transporte metropolitano.',
    motivo: 'Estudio de percepción ciudadana con componente cualitativo.',
    servicios: ['cualitativo'],
    monto: 900_000,
    moneda: 'UYU',
    estado: 'postular',
    nota: 'Vamos con propuesta mixta. Responsable: Marcos.',
  },
  {
    id: 'ungm-238771',
    fuente: 'UNGM',
    titulo: 'RFP/UNDP/URY/2026/031 · Evaluación final del proyecto de transición energética',
    organismo: 'PNUD Uruguay',
    pais: 'Uruguay',
    tipo: 'consultoria_firma',
    cierre: 18,
    puntaje: 64,
    resumen: 'Evaluación final de proyecto con revisión documental y entrevistas a actores clave. Sin encuesta.',
    motivo: 'Evaluación con trabajo de campo cualitativo; afín pero sin encuesta.',
    servicios: ['cualitativo'],
    financiador: 'PNUD',
  },
  {
    id: 'cnd-llamado-13-2026',
    fuente: 'CND',
    titulo: 'Llamado 13/2026 · Diagnóstico territorial participativo en la cuenca del Santa Lucía',
    organismo: 'Corporación Nacional para el Desarrollo',
    pais: 'Uruguay',
    tipo: 'consultoria_firma',
    cierre: null,
    puntaje: 58,
    resumen: 'Diagnóstico participativo con talleres y mapeo de actores en 6 localidades.',
    motivo: 'Diagnóstico territorial con talleres: componente afín, no es el objeto principal.',
    servicios: ['cualitativo', 'otro'],
    nueva: true,
  },
  {
    id: 'ceibal-1182',
    fuente: 'Ceibal',
    titulo: 'Convocatoria 1182 · Estudio de uso de plataformas educativas en educación media',
    organismo: 'Ceibal',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: 21,
    puntaje: 79,
    resumen: 'Encuesta a estudiantes y docentes de 120 liceos, más análisis de datos de uso.',
    motivo: 'Encuesta a usuarios con muestra nacional: encaja con la firma.',
    servicios: ['encuesta_hogares'],
    nueva: true,
  },
  {
    id: 'auci-convocatoria-2026-07',
    fuente: 'AUCI',
    titulo: 'Convocatoria · Evaluación intermedia del Fondo Conjunto Uruguay–México',
    organismo: 'Agencia Uruguaya de Cooperación Internacional',
    pais: 'Uruguay',
    tipo: 'consultoria_individual',
    cierre: 7,
    puntaje: 52,
    resumen: 'Consultoría individual de evaluación intermedia con revisión de 14 proyectos.',
    motivo: 'Consultoría individual de evaluación de alto nivel; encaja como media.',
    servicios: ['otro'],
  },
  {
    id: 'bid-UR-T1287',
    fuente: 'BID',
    titulo: 'UR-T1287 · Aviso de proyecto: encuesta de micro y pequeñas empresas',
    organismo: 'Agencia Nacional de Desarrollo (ANDE)',
    pais: 'Uruguay',
    tipo: 'aviso_general',
    cierre: 25,
    puntaje: 45,
    resumen: 'Aviso general de adquisiciones del proyecto; incluye una encuesta a MiPyMEs entre sus componentes.',
    motivo: 'La encuesta es un componente dentro de un proyecto más amplio.',
    servicios: ['otro'],
    financiador: 'BID',
  },
  {
    id: 'fiap-2026-114',
    fuente: 'FIAP',
    titulo: 'Oferta 114/2026 · Asistencia técnica en sistemas de monitoreo y evaluación (EUROsociAL+)',
    organismo: 'FIAP · EUROsociAL+',
    pais: 'Paraguay',
    tipo: 'consultoria_individual',
    cierre: 14,
    puntaje: 41,
    resumen: 'Asistencia técnica para diseñar el sistema de M&E de la Secretaría Técnica de Planificación. Monto ₲ no informado; admisión de firmas extranjeras sin confirmar.',
    motivo: 'Monitoreo y evaluación sin trabajo de campo; afín pero marginal.',
    servicios: ['otro'],
    financiador: 'UE',
    admiteExtranjeras: null,
  },
  {
    id: 'ce-1379901',
    fuente: 'Compras Estatales',
    titulo: 'Compra Directa 455/2026 · Adquisición de tablets para relevamiento',
    organismo: 'Instituto Nacional de Estadística (INE)',
    pais: 'Uruguay',
    tipo: 'otro',
    cierre: 6,
    puntaje: 12,
    resumen: 'Compra de 300 tablets con funda para el censo.',
    motivo: 'Suministro de equipamiento: fuera de rubro.',
    servicios: [],
  },
  {
    id: 'ce-1380044',
    fuente: 'Compras Estatales',
    titulo: 'Licitación Pública 9/2026 · Encuesta de precios de materiales de construcción',
    organismo: 'Ministerio de Vivienda',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: 10,
    puntaje: null,
    relevancia: 'baja',
    resumen: '',
    motivo: 'prefiltro: exclusión por palabra “encuesta de precios”',
    prefiltro: 'exclusión por palabra “encuesta de precios”',
  },
  {
    id: 'dncp-455102',
    fuente: 'DNCP Paraguay',
    titulo: 'Licitación 31/2026 · Estudio de suelos para la ruta PY08',
    organismo: 'Ministerio de Obras Públicas y Comunicaciones · Paraguay',
    pais: 'Paraguay',
    tipo: 'servicios',
    cierre: 15,
    puntaje: null,
    relevancia: 'baja',
    resumen: '',
    motivo: 'prefiltro: exclusión temática “estudios de suelos”',
    prefiltro: 'exclusión temática “estudios de suelos”',
    monto: 3_200_000_000,
    moneda: 'PYG',
  },
  {
    id: 'ungm-239002',
    fuente: 'UNGM',
    titulo: 'RFQ/UNICEF/PRY/2026/77 · Encuesta MICS: capacitación de encuestadores',
    organismo: 'UNICEF Paraguay',
    pais: 'Paraguay',
    tipo: 'servicios',
    cierre: 4,
    puntaje: null,
    relevancia: 'sin_clasificar',
    resumen: '',
    motivo: '',
    nueva: true,
  },
  {
    id: 'bm-OP00471020',
    fuente: 'Banco Mundial',
    titulo: 'Solicitud de expresiones de interés · Encuesta nacional de salud y factores de riesgo',
    organismo: 'Ministerio de Salud Pública y Bienestar Social · Paraguay',
    pais: 'Paraguay',
    tipo: 'expresion_interes',
    cierre: -3,
    puntaje: 91,
    resumen: 'Encuesta nacional de salud a 8.000 hogares. Monto estimado ₲ 4.800.000.000; admite firmas extranjeras.',
    motivo: 'Encuesta de hogares de escala nacional: encaje alto.',
    servicios: ['encuesta_hogares'],
    estado: 'presentada',
    nota: 'Presentada con socio local de Asunción.',
    monto: 4_800_000_000,
    moneda: 'PYG',
    admiteExtranjeras: true,
    financiador: 'Banco Mundial',
  },
  {
    id: 'ce-1365512',
    fuente: 'Compras Estatales',
    titulo: 'Licitación Abreviada 3/2026 · Estudio de clima laboral',
    organismo: 'Banco de Previsión Social (BPS)',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: -40,
    puntaje: 74,
    resumen: 'Encuesta de clima laboral a 4.500 funcionarios.',
    motivo: 'Estudio de clima organizacional con encuesta.',
    servicios: ['otro'],
    estado: 'ganada',
    publicadoHace: 70,
  },
  {
    id: 'ce-1369810',
    fuente: 'Compras Estatales',
    titulo: 'Licitación Abreviada 22/2026 · Investigación de mercado para el lanzamiento de nuevos servicios',
    organismo: 'ANTEL',
    pais: 'Uruguay',
    tipo: 'servicios',
    cierre: -12,
    puntaje: 66,
    resumen: 'Investigación de mercado cuali-cuanti.',
    motivo: 'Investigación de mercado con encuesta y grupos.',
    servicios: ['cualitativo'],
    estado: 'perdida',
    publicadoHace: 45,
  },
  {
    id: 'ungm-237010',
    fuente: 'UNGM',
    titulo: 'RFP/OPS/2026/12 · Estudio regional de cobertura de vacunación (Argentina, Chile y Uruguay)',
    organismo: 'OPS/OMS',
    pais: 'Uruguay',
    tipo: 'consultoria_firma',
    cierre: 8,
    puntaje: 61,
    resumen: 'Estudio multipaís que incluye a Uruguay con encuesta de cobertura vacunal.',
    motivo: 'Multipaís que nombra a Uruguay: entra; la encuesta es un componente.',
    servicios: ['encuesta_hogares'],
    estado: 'descartada',
    nota: 'Requiere presencia en los 3 países.',
  },
];

const AUTORES = ['marcos@equipos.com.uy', 'lucia@equipos.com.uy', 'radar'];

export function generarOportunidades(ahora: number, corridaId: string, extra = 0): Oportunidad[] {
  const lista: Oportunidad[] = SEMILLAS.map((s, i) => {
    const publicado = new Date(ahora - (s.publicadoHace ?? 2 + (i % 6)) * DIA);
    const detectado = new Date(publicado.getTime() + 8 * 3_600_000);
    const estado = s.estado ?? 'nueva';
    const fuentes = [s.fuente, ...(s.fuentesExtra ?? [])];
    const historial: Oportunidad['historial'] = [
      { tipo: 'alta', de: null, a: 'nueva', autor: 'radar', fecha: detectado, detalle: `Detectado en ${s.fuente}` },
    ];
    if (s.fuentesExtra?.length) {
      historial.push({ tipo: 'fusion', de: null, a: s.fuentesExtra.join(', '), autor: 'radar', fecha: detectado, detalle: 'Mismo llamado en otra fuente' });
    }
    if (i === 1) {
      historial.push({
        tipo: 'cierre',
        de: cierreEn((s.cierre ?? 0) - 7, ahora)?.toISOString() ?? null,
        a: cierreEn(s.cierre, ahora)?.toISOString() ?? null,
        autor: 'radar',
        fecha: new Date(ahora - DIA),
        detalle: 'Prórroga',
      });
    }
    if (estado !== 'nueva') {
      historial.push({ tipo: 'estado', de: 'nueva', a: estado, autor: AUTORES[i % 2], fecha: new Date(detectado.getTime() + DIA) });
    }
    return {
      docId: s.id,
      fuente: s.fuente,
      idOficial: s.id.split('-').slice(1).join('-'),
      titulo: s.titulo,
      organismo: s.organismo,
      pais: s.pais,
      tipo: s.tipo,
      url: 'https://example.org/aviso/' + s.id,
      publicado,
      cierre: cierreEn(s.cierre, ahora),
      monto: s.monto ?? null,
      moneda: s.moneda ?? null,
      financiador: s.financiador ?? null,
      idioma: 'es',
      fuentes,
      fuentesDetalle: fuentes.map((f) => ({ fuente: f, docId: s.id, url: 'https://example.org/aviso/' + s.id })),
      detectado,
      detectadoCorrida: s.nueva ? corridaId : 'anterior',
      relevancia: s.relevancia ?? (s.puntaje === null ? 'sin_clasificar' : s.puntaje >= 70 ? 'alta' : s.puntaje >= 40 ? 'media' : 'baja'),
      puntaje: s.puntaje,
      resumen: s.resumen,
      motivo: s.motivo,
      servicios: s.servicios ?? [],
      clasificacion: s.puntaje === null ? null : { modelo: 'gemini-3.1-flash-lite', promptVersion: 'v1', fecha: detectado, confianza: 'alta' },
      prefiltro: s.prefiltro ? { paso: false, regla: s.prefiltro } : { paso: true, regla: null },
      etapa: s.relevancia === 'sin_clasificar' ? 'clasificar' : 'lista',
      estado,
      estadoFecha: detectado,
      motivoDescarte: estado === 'descartada' ? { codigo: 'requisitos', texto: 'Presencia en 3 países' } : null,
      nota: s.nota ?? '',
      historial,
      manual: false,
      admiteExtranjeras: s.admiteExtranjeras ?? null,
      orgId: 'equipos',
    };
  });

  lista.push({
    docId: 'manual-beo-linea-de-base-salud-rural-a1b2c3',
    fuente: 'BEO',
    titulo: 'Línea de base del programa de salud rural (aviso BEO)',
    organismo: 'Ministerio de Salud Pública',
    pais: 'Uruguay',
    tipo: 'otro',
    url: '',
    publicado: null,
    cierre: cierreEn(16, ahora),
    fuentes: ['BEO'],
    detectado: new Date(ahora - 4 * DIA),
    relevancia: 'media',
    puntaje: null,
    resumen: '',
    motivo: 'Carga manual (BEO)',
    estado: 'analizando',
    nota: 'Llegó por correo de BEO. Ver TdR adjuntos.',
    historial: [
      { tipo: 'alta', de: null, a: 'nueva', autor: 'marcos@equipos.com.uy', fecha: new Date(ahora - 4 * DIA), detalle: 'Carga manual (BEO)' },
      { tipo: 'estado', de: 'nueva', a: 'analizando', autor: 'marcos@equipos.com.uy', fecha: new Date(ahora - 3 * DIA) },
    ],
    manual: true,
    canal: 'BEO',
    orgId: 'equipos',
  });

  // Volumen sintético para probar rendimiento (?n=2000).
  const organismos = ['MIDES', 'MSP', 'INAU', 'ANEP', 'UTE', 'OSE', 'MTSS', 'Ministerio de Hacienda · Paraguay', 'MEC · Paraguay'];
  const temas = ['Encuesta de satisfacción', 'Evaluación de resultados', 'Relevamiento de datos', 'Suministro de insumos', 'Estudio de demanda', 'Mantenimiento edilicio', 'Grupos focales', 'Censo de beneficiarios'];
  const fuentesNombres = FUENTES_BASE.map((f) => f.nombre);
  const estados: Estado[] = ['nueva', 'nueva', 'nueva', 'analizando', 'descartada', 'ganada', 'perdida', 'presentada'];
  for (let i = 0; i < extra; i++) {
    const pais: Pais = i % 4 === 0 ? 'Paraguay' : 'Uruguay';
    const puntaje = (i * 37) % 100;
    const f = fuentesNombres[i % fuentesNombres.length];
    const id = `demo-${i}`;
    const cierre = i % 9 === 0 ? null : cierreEn(((i * 7) % 120) - 60, ahora);
    lista.push({
      docId: id,
      fuente: f,
      titulo: `${temas[i % temas.length]} N.º ${1000 + i}`,
      organismo: organismos[i % organismos.length],
      pais,
      tipo: 'servicios',
      url: 'https://example.org/aviso/' + id,
      publicado: new Date(ahora - ((i % 300) + 1) * DIA),
      cierre,
      monto: pais === 'Paraguay' ? 50_000_000 * ((i % 20) + 1) : null,
      moneda: pais === 'Paraguay' ? 'PYG' : null,
      fuentes: [f],
      detectado: new Date(ahora - ((i % 300) + 1) * DIA),
      detectadoCorrida: 'anterior',
      relevancia: puntaje >= 70 ? 'alta' : puntaje >= 40 ? 'media' : 'baja',
      puntaje,
      resumen: 'Aviso sintético generado para la prueba de volumen.',
      motivo: 'Puntaje sintético.',
      estado: estados[i % estados.length],
      historial: [],
      prefiltro: { paso: true, regla: null },
      orgId: 'equipos',
    });
  }
  return lista;
}

export function generarFuentes(ahora: number, corridaId: string): Fuente[] {
  return FUENTES_BASE.map((f, i) => {
    const bloqueo = f.id === 'ungm';
    const error = f.id === 'im';
    const leidos = [184, 0, 63, 12, 7, 0, 5, 3, 2, 9][i];
    return {
      ...f,
      activa: f.id !== 'fiap',
      metodo: f.id === 'arce' ? 'navegador' : f.id === 'ungm' ? 'agente_local' : 'http',
      url: undefined,
      ceroConsecutivos: error ? 3 : 0,
      ultimaCorrida:
        f.id === 'fiap'
          ? { corridaId, inicio: new Date(ahora - 3 * 3_600_000), fin: new Date(ahora - 3 * 3_600_000), estado: 'omitida', leidos: 0, nuevos: 0, actualizados: 0, error: null }
          : {
              corridaId,
              inicio: new Date(ahora - 3 * 3_600_000),
              fin: new Date(ahora - 3 * 3_600_000 + (60 + i * 20) * 1000),
              estado: bloqueo ? 'bloqueo' : error ? 'error' : 'ok',
              leidos: bloqueo || error ? 0 : leidos,
              nuevos: bloqueo || error ? 0 : [3, 0, 1, 1, 0, 0, 1, 0, 0, 1][i],
              actualizados: bloqueo || error ? 0 : [2, 0, 1, 0, 0, 0, 0, 0, 0, 0][i],
              error: bloqueo ? 'HTTP 403 desde Cloud Run (bloqueo de acceso)' : error ? 'Timeout leyendo la cartelera SIAB tras 2 reintentos' : null,
            },
      pruebaAcceso: {
        http: f.id === 'arce' || f.id === 'ungm' || f.id === 'im' ? 'bloqueo' : 'ok',
        navegador: f.id === 'ungm' ? 'bloqueo' : f.id === 'ceibal' ? 'pendiente' : 'ok',
        fecha: new Date(ahora - 10 * DIA),
        detalle: f.id === 'ungm' ? 'Rechaza IPs de Cloud Run también con Playwright' : '',
      },
    };
  });
}

export function generarCorridas(ahora: number, corridaId: string): Corrida[] {
  const out: Corrida[] = [];
  for (let i = 0; i < 8; i++) {
    const inicio = new Date(ahora - 3 * 3_600_000 - i * DIA);
    const parcial = i < 3;
    out.push({
      id: i === 0 ? corridaId : `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(inicio).replace(/-/g, '')}-060000-programada`,
      inicio,
      fin: new Date(inicio.getTime() + (14 + i) * 60_000),
      estado: i === 5 ? 'error' : parcial ? 'parcial' : 'ok',
      disparo: i === 2 ? 'manual' : 'programada',
      solicitadoPor: i === 2 ? 'admin@equipos.com.uy' : null,
      fuentes: Object.fromEntries(
        FUENTES_BASE.map((f, j) => [
          f.id,
          {
            estado: parcial && f.id === 'ungm' ? 'bloqueo' : parcial && f.id === 'im' ? 'error' : 'ok',
            leidos: (j * 13 + i * 5) % 90,
            nuevos: (j + i) % 3,
            actualizados: (j * i) % 2,
          },
        ]),
      ),
      totales: { leidos: 290 - i * 7, nuevos: 7 - (i % 4), actualizados: 3, fusionados: 1, prefiltrados: 211 - i, clasificados: 74 - i, sinClasificar: i === 0 ? 1 : 0 },
      llm: { llamadas: 74 - i, tokensEntrada: 222_000 - i * 3000, tokensSalida: 22_200 - i * 300, costoUsd: 0.089 - i * 0.002 },
    });
  }
  return out;
}

export function generarConfig(): Config {
  return {
    perfil: {
      servicios: ['Encuestas de hogares', 'Opinión pública', 'Evaluación de impacto', 'Estudios cualitativos', 'Investigación de mercado', 'Líneas de base'],
      sectores: ['Desarrollo social', 'Salud', 'Educación', 'Empleo', 'Gobierno'],
      antecedentes: [
        { titulo: 'Encuesta Nacional de Juventud', cliente: 'INJU', anio: 2024, monto: 180_000, moneda: 'USD' },
        { titulo: 'Evaluación del Programa Uruguay Impulsa', cliente: 'MIDES', anio: 2023, monto: 95_000, moneda: 'USD' },
      ],
      paises: ['Uruguay', 'Paraguay'],
      rangoMonto: { min: 15_000, max: 600_000, moneda: 'USD' },
      version: 4,
      actualizado: new Date(Date.now() - 5 * DIA),
      actualizadoPor: 'admin@equipos.com.uy',
    },
    busqueda: {
      incluir: ['encuesta', 'sondeo', 'opinión pública', 'investigación de mercado', 'grupo focal', 'focus group', 'línea de base', 'evaluación de impacto', 'evaluación final', 'satisfacción de usuarios', 'relevamiento de datos', 'monitoreo y evaluación', 'diagnóstico social', 'mapeo de actores', 'clima laboral', 'entrevistas en profundidad', 'censo'],
      excluir: ['encuesta de precios', 'topografía', 'geotecnia', 'medidor'],
      excluirRubros: ['obras', 'suministros', 'equipamiento', 'mantenimiento', 'insumos médicos', 'contratación de personal individual', 'becas', 'fondos para empresas', 'estudios de suelos', 'saneamiento', 'impacto ambiental'],
      porFuente: { dncp: { incluir: ['relevamiento', 'consultoría'], excluir: ['provisión'] } },
      umbrales: { alta: 70, media: 40 },
      ventanaDias: 7,
      version: 9,
      actualizado: new Date(Date.now() - 2 * DIA),
      actualizadoPor: 'admin@equipos.com.uy',
    },
    sistema: {
      modelo: 'gemini-3.1-flash-lite',
      promptVersion: 'v1',
      appUrl: 'https://radar.equipos.com.uy',
      remitente: 'radar@equipos.com.uy',
      destinatariosExtra: ['marcos@equipos.com.uy'],
      precios: { entradaPorMillon: 0.25, salidaPorMillon: 1.5 },
      version: 2,
    },
  };
}

export function generarUsuarios(ahora: number): Usuario[] {
  return [
    { uid: 'u1', email: 'admin@equipos.com.uy', nombre: 'Admin del radar', rol: 'admin', ultimoAcceso: new Date(ahora - 3600_000) },
    { uid: 'u2', email: 'marcos@equipos.com.uy', nombre: 'Marcos Pérez', rol: 'editor', ultimoAcceso: new Date(ahora - DIA) },
    { uid: 'u3', email: 'lucia@equipos.com.uy', nombre: 'Lucía Fernández', rol: 'editor', ultimoAcceso: new Date(ahora - 2 * DIA) },
    { uid: 'u4', email: 'sofia@equipos.com.uy', nombre: 'Sofía Rodríguez', rol: 'lector', ultimoAcceso: new Date(ahora - 6 * DIA) },
    { uid: 'u5', email: 'pasante@equipos.com.uy', nombre: 'Pasante Campo', rol: null, ultimoAcceso: new Date(ahora - 3600_000 * 5) },
  ];
}
