import { CANALES_MANUALES, DOMINIO } from '../lib/constantes';
import { docIdManual, esEmailDominio, hora } from '../lib/helpers';
import type { Config, Corrida, Fuente, Oportunidad, Rol, Usuario } from '../lib/tipos';
import type { DataApi, Sesion, UsuarioSesion } from './api';
import { completarConfig } from './defaults';
import { generarConfig, generarCorridas, generarFuentes, generarOportunidades, generarUsuarios } from './demoDatos';

type Listener = () => void;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Implementación en memoria para previsualizar la app sin Firebase.
 * Respeta la misma interfaz y simula la latencia y los errores de las Cloud Functions.
 */
export function crearDemoApi(): DataApi {
  const ahora = Date.now();
  const params = new URLSearchParams(location.search);
  const corridaId = 'ultima';
  const extra = Math.min(Number(params.get('n') ?? 0) || 0, 5000);

  let ops: Oportunidad[] = generarOportunidades(ahora, corridaId, extra);
  let fuentes: Fuente[] = generarFuentes(ahora, corridaId);
  let corridas: Corrida[] = generarCorridas(ahora, corridaId);
  let config: Config = generarConfig();
  let usuarios: Usuario[] = generarUsuarios(ahora);
  let lock: { corridaId: string; inicio: Date | null } | null = null;

  const rolInicial = params.get('rol');
  let sesion: Sesion = sesionPara(
    rolInicial === 'anonimo' ? 'anonimo' : rolInicial === 'sin_rol' ? null : ((rolInicial as Rol) ?? 'admin'),
  );

  const listeners = new Set<Listener>();
  const emitir = () => listeners.forEach((l) => l());
  const sub = (fn: Listener) => {
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  };

  function sesionPara(rol: Rol | null | 'anonimo'): Sesion {
    if (rol === 'anonimo') return { estado: 'anonimo' };
    const u: UsuarioSesion = { uid: 'demo', email: `demo@${DOMINIO}`, nombre: 'Usuario demo' };
    return rol ? { estado: 'ok', usuario: u, rol } : { estado: 'sin_rol', usuario: u };
  }

  const autorizado = (...roles: Rol[]) => {
    if (sesion.estado !== 'ok' || !roles.includes(sesion.rol)) throw new Error('No tenés permiso para esta acción.');
  };

  const actualizarOp = (id: string, fn: (o: Oportunidad) => Oportunidad) => {
    ops = ops.map((o) => (o.docId === id ? fn(o) : o));
    emitir();
  };

  return {
    modo: 'demo',

    onSesion(cb) {
      return sub(() => cb(sesion));
    },
    async ingresar() {
      await espera(300);
      sesion = sesionPara('admin');
      emitir();
    },
    async salir() {
      sesion = { estado: 'anonimo' };
      emitir();
    },
    demoCambiarRol(rol) {
      sesion = sesionPara(rol);
      emitir();
    },

    suscribirOportunidades(cb) {
      return sub(() => cb(ops));
    },
    suscribirCorridas(cb) {
      return sub(() => cb(corridas, lock));
    },
    suscribirFuentes(cb) {
      return sub(() => cb(fuentes));
    },
    suscribirConfig(cb) {
      return sub(() => cb(completarConfig(config)));
    },
    suscribirUsuarios(cb) {
      return sub(() => cb(usuarios));
    },

    async cambiarEstado(op, cambio, autor) {
      autorizado('admin', 'editor');
      await espera(120);
      const detalle =
        cambio.nuevo === 'descartada' && cambio.motivoDescarte
          ? `Motivo: ${cambio.motivoDescarte.codigo}${cambio.motivoDescarte.texto ? ` · ${cambio.motivoDescarte.texto}` : ''}`
          : undefined;
      actualizarOp(op.docId, (o) => ({
        ...o,
        estado: cambio.nuevo,
        estadoFecha: new Date(),
        motivoDescarte: cambio.nuevo === 'descartada' ? (cambio.motivoDescarte ?? null) : null,
        actualizadoPor: autor,
        historial: [...o.historial, { tipo: 'estado', de: o.estado, a: cambio.nuevo, autor, fecha: new Date(), detalle }],
      }));
    },

    async guardarNota(op, nota, autor) {
      autorizado('admin', 'editor');
      await espera(120);
      actualizarOp(op.docId, (o) => ({
        ...o,
        nota,
        actualizadoPor: autor,
        historial: [...o.historial, { tipo: 'nota', de: null, a: nota.slice(0, 280), autor, fecha: new Date() }],
      }));
    },

    async crearManual(d, autor) {
      autorizado('admin', 'editor');
      await espera(200);
      const id = docIdManual(d.titulo);
      const etiqueta = CANALES_MANUALES.find((c) => c.clave === d.canal)?.etiqueta ?? 'Otro';
      ops = [
        {
          docId: id,
          fuente: etiqueta,
          fuentes: [etiqueta],
          titulo: d.titulo.trim(),
          organismo: d.organismo.trim(),
          pais: d.pais,
          tipo: 'otro',
          url: d.url.trim(),
          publicado: null,
          cierre: d.cierre,
          detectado: new Date(),
          detectadoCorrida: null,
          relevancia: 'media',
          puntaje: null,
          resumen: '',
          motivo: `Carga manual (${etiqueta})`,
          estado: d.estado,
          estadoFecha: new Date(),
          nota: '',
          historial: [{ tipo: 'alta', de: null, a: d.estado, autor, fecha: new Date(), detalle: `Carga manual (${etiqueta})` }],
          manual: true,
          canal: d.canal,
          etapa: 'lista',
          orgId: 'equipos',
        },
        ...ops,
      ];
      emitir();
      return id;
    },

    async guardarConfig(id, datos, autor) {
      autorizado('admin');
      await espera(250);
      const previo = config[id] as { version?: number };
      config = {
        ...config,
        [id]: { ...config[id], ...datos, version: (previo.version ?? 0) + 1, actualizado: new Date(), actualizadoPor: autor },
      };
      emitir();
    },

    async actualizarFuente(id, cambios) {
      autorizado('admin');
      await espera(150);
      fuentes = fuentes.map((f) => (f.id === id ? { ...f, ...cambios } : f));
      emitir();
    },

    async lanzarCorrida() {
      autorizado('admin');
      await espera(400);
      if (lock) throw new Error(`Ya hay una corrida en curso, empezó a las ${hora(lock.inicio)}.`);
      const inicio = new Date();
      const id = `demo-${inicio.getTime()}-manual`;
      lock = { corridaId: id, inicio };
      corridas = [
        { id, inicio, fin: null, estado: 'en_curso', disparo: 'manual', solicitadoPor: sesion.estado === 'ok' ? sesion.usuario.email : null, fuentes: {} },
        ...corridas,
      ];
      emitir();
      // La corrida simulada termina en 20 segundos.
      setTimeout(() => {
        lock = null;
        corridas = corridas.map((c) => (c.id === id ? { ...c, estado: 'ok', fin: new Date(), totales: { leidos: 0, nuevos: 0 } } : c));
        emitir();
      }, 20_000);
      return { corridaId: id };
    },

    async asignarRol(email, rol) {
      autorizado('admin');
      await espera(300);
      if (!esEmailDominio(email, DOMINIO)) throw new Error(`Solo cuentas de ${DOMINIO}.`);
      const e = email.trim().toLowerCase();
      const existe = usuarios.find((u) => u.email === e);
      usuarios = existe
        ? usuarios.map((u) => (u.email === e ? { ...u, rol } : u))
        : [...usuarios, { uid: `u-${Date.now()}`, email: e, nombre: '', rol, creado: new Date() }];
      emitir();
    },
  };
}
