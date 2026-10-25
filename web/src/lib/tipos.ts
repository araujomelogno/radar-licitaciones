// Tipos del dominio. Siguen los contratos de docs/arquitectura.md.
// Las fechas se manejan como Date en la app; la capa de datos convierte desde y hacia Timestamp.

export type Rol = 'admin' | 'editor' | 'lector';

export type Estado =
  | 'nueva'
  | 'analizando'
  | 'postular'
  | 'presentada'
  | 'evaluacion'
  | 'ganada'
  | 'perdida'
  | 'descartada';

export type Relevancia = 'alta' | 'media' | 'baja' | 'sin_clasificar';

export type Pais = 'Uruguay' | 'Paraguay';

export type Tipo =
  | 'consultoria_firma'
  | 'consultoria_individual'
  | 'servicios'
  | 'expresion_interes'
  | 'aviso_general'
  | 'otro';

export type MotivoCodigo = 'fuera_rubro' | 'monto' | 'pais' | 'requisitos' | 'plazo' | 'otro';

export interface MotivoDescarte {
  codigo: MotivoCodigo;
  texto: string;
}

export type TipoHistorial = 'alta' | 'estado' | 'cierre' | 'nota' | 'fusion' | 'migracion';

export interface EntradaHistorial {
  tipo: TipoHistorial;
  de: string | null;
  a: string | null;
  autor: string;
  fecha: Date | null;
  detalle?: string;
}

export interface FuenteDetalle {
  fuente: string;
  docId: string;
  url: string;
}

export interface Clasificacion {
  modelo: string;
  promptVersion: string;
  fecha: Date | null;
  confianza?: 'alta' | 'media' | 'baja';
  esInvestigacion?: boolean;
  intentos?: number;
}

export interface Oportunidad {
  docId: string;
  fuente: string;
  idOficial?: string | null;
  titulo: string;
  organismo: string;
  pais: Pais | null;
  tipo: Tipo | null;
  url: string;
  publicado: Date | null;
  cierre: Date | null;
  monto?: number | null;
  moneda?: string | null;
  financiador?: string | null;
  idioma?: string | null;
  fuentes: string[];
  fuentesDetalle?: FuenteDetalle[];
  detectado: Date | null;
  detectadoCorrida?: string | null;
  relevancia: Relevancia;
  puntaje: number | null;
  resumen?: string;
  motivo?: string;
  servicios?: string[];
  clasificacion?: Clasificacion | null;
  prefiltro?: { paso: boolean; regla: string | null } | null;
  etapa?: 'prefiltro' | 'clasificar' | 'lista';
  estado: Estado;
  estadoFecha?: Date | null;
  motivoDescarte?: MotivoDescarte | null;
  nota?: string;
  historial: EntradaHistorial[];
  manual?: boolean;
  canal?: string | null;
  admiteExtranjeras?: boolean | null;
  actualizadoPor?: string;
  orgId?: string;
}

export interface Antecedente {
  titulo: string;
  cliente: string;
  anio: number | null;
  monto: number | null;
  moneda: Moneda;
}

export type Moneda = 'USD' | 'UYU' | 'PYG';

export interface ConfigPerfil {
  servicios: string[];
  sectores: string[];
  antecedentes: Antecedente[];
  paises: string[];
  rangoMonto: { min: number | null; max: number | null; moneda: Moneda };
  version?: number;
  actualizado?: Date | null;
  actualizadoPor?: string;
}

export interface Umbrales {
  alta: number;
  media: number;
}

export interface ConfigBusqueda {
  incluir: string[];
  excluir: string[];
  excluirRubros: string[];
  porFuente: Record<string, { incluir: string[]; excluir: string[] }>;
  umbrales: Umbrales;
  ventanaDias: number;
  version?: number;
  actualizado?: Date | null;
  actualizadoPor?: string;
}

export interface ConfigSistema {
  modelo: string;
  promptVersion: string;
  appUrl?: string;
  remitente?: string;
  destinatariosExtra: string[];
  precios?: { entradaPorMillon: number; salidaPorMillon: number };
  version?: number;
}

export interface Config {
  perfil: ConfigPerfil;
  busqueda: ConfigBusqueda;
  sistema: ConfigSistema;
}

export type MetodoAcceso = 'http' | 'navegador' | 'agente_local' | 'manual';
export type EstadoFuenteCorrida = 'ok' | 'error' | 'bloqueo' | 'omitida';

export interface UltimaCorridaFuente {
  corridaId: string;
  inicio: Date | null;
  fin: Date | null;
  estado: EstadoFuenteCorrida;
  leidos: number;
  nuevos: number;
  actualizados: number;
  error?: string | null;
}

export type ResultadoPrueba = 'ok' | 'bloqueo' | 'error' | 'pendiente';

export interface Fuente {
  id: string;
  nombre: string;
  slug: string;
  paises: string[];
  activa: boolean;
  metodo: MetodoAcceso;
  url?: string;
  ultimaCorrida?: UltimaCorridaFuente | null;
  ceroConsecutivos?: number;
  pruebaAcceso?: { http?: ResultadoPrueba; navegador?: ResultadoPrueba; fecha?: Date | null; detalle?: string } | null;
}

export type EstadoCorrida = 'en_curso' | 'ok' | 'parcial' | 'error';

export interface FuenteEnCorrida {
  estado: EstadoFuenteCorrida | 'en_curso';
  leidos: number;
  nuevos: number;
  actualizados: number;
  error?: string | null;
}

export interface Corrida {
  id: string;
  inicio: Date | null;
  fin: Date | null;
  estado: EstadoCorrida;
  disparo: 'programada' | 'manual';
  solicitadoPor?: string | null;
  fuentes: Record<string, FuenteEnCorrida>;
  totales?: Partial<Record<'leidos' | 'nuevos' | 'actualizados' | 'fusionados' | 'prefiltrados' | 'clasificados' | 'sinClasificar', number>>;
  llm?: { llamadas: number; tokensEntrada: number; tokensSalida: number; costoUsd: number };
}

export interface Usuario {
  uid: string;
  email: string;
  nombre?: string;
  foto?: string;
  rol: Rol | null;
  creado?: Date | null;
  ultimoAcceso?: Date | null;
  /** Invitación de asignarRol para alguien que todavía no entró nunca. */
  pendiente?: boolean;
}

export interface NuevoManual {
  titulo: string;
  organismo: string;
  pais: Pais | null;
  canal: 'BEO' | 'CAF' | 'correo' | 'contacto' | 'otro';
  cierre: Date | null;
  estado: Estado;
  url: string;
}
