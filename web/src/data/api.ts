import type {
  Config,
  ConfigBusqueda,
  ConfigPerfil,
  ConfigSistema,
  Corrida,
  Estado,
  Fuente,
  MotivoDescarte,
  NuevoManual,
  Oportunidad,
  Rol,
  Usuario,
} from '../lib/tipos';

export type Unsub = () => void;

export interface UsuarioSesion {
  uid: string;
  email: string;
  nombre: string;
  foto?: string;
}

export type Sesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo'; error?: string }
  | { estado: 'dominio_invalido'; usuario: UsuarioSesion }
  | { estado: 'sin_rol'; usuario: UsuarioSesion }
  | { estado: 'ok'; usuario: UsuarioSesion; rol: Rol };

export interface CambioEstado {
  nuevo: Estado;
  motivoDescarte?: MotivoDescarte | null;
}

export type ConfigDocId = 'perfil' | 'busqueda' | 'sistema';
export type ConfigParcial = Partial<ConfigPerfil> | Partial<ConfigBusqueda> | Partial<ConfigSistema>;

/**
 * Capa de acceso a datos. La app solo habla con esta interfaz;
 * hay una implementación con Firebase y otra en memoria para el modo demo.
 */
export interface DataApi {
  readonly modo: 'firebase' | 'demo';

  // Sesión
  onSesion(cb: (s: Sesion) => void): Unsub;
  ingresar(): Promise<void>;
  salir(): Promise<void>;

  // Lecturas en tiempo real
  suscribirOportunidades(cb: (ops: Oportunidad[]) => void, onError: (e: Error) => void): Unsub;
  suscribirCorridas(cb: (corridas: Corrida[], lock: { corridaId: string; inicio: Date | null } | null) => void): Unsub;
  suscribirFuentes(cb: (fuentes: Fuente[]) => void): Unsub;
  suscribirConfig(cb: (c: Config) => void): Unsub;
  suscribirUsuarios(cb: (u: Usuario[]) => void): Unsub;

  // Escrituras de editor
  cambiarEstado(op: Oportunidad, cambio: CambioEstado, autor: string): Promise<void>;
  guardarNota(op: Oportunidad, nota: string, autor: string): Promise<void>;
  crearManual(datos: NuevoManual, autor: string): Promise<string>;

  // Admin
  guardarConfig(doc: ConfigDocId, datos: ConfigParcial, autor: string): Promise<void>;
  actualizarFuente(id: string, cambios: Partial<Pick<Fuente, 'activa' | 'metodo'>>, autor: string): Promise<void>;
  lanzarCorrida(): Promise<{ corridaId: string }>;
  asignarRol(email: string, rol: Rol | null): Promise<void>;

  // Solo demo
  demoCambiarRol?(rol: Rol | null): void;
}
