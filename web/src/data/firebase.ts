import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CANALES_MANUALES, DOMINIO, FUENTES_BASE, ORG_ID } from '../lib/constantes';
import { docIdManual, esEmailDominio } from '../lib/helpers';
import type { Corrida, Fuente, Oportunidad, Rol, Usuario } from '../lib/tipos';
import type { DataApi, Sesion, UsuarioSesion } from './api';
import { completarConfig } from './defaults';

const ROLES: Rol[] = ['admin', 'editor', 'lector'];

/** Convierte Timestamps de Firestore a Date en todo el árbol del documento. */
function aDates<T>(v: unknown): T {
  if (v instanceof Timestamp) return v.toDate() as T;
  if (Array.isArray(v)) return v.map((x) => aDates(x)) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as DocumentData)) out[k] = aDates(x);
    return out as T;
  }
  return v as T;
}

function aOportunidad(id: string, d: DocumentData): Oportunidad {
  const o = aDates<Partial<Oportunidad>>(d);
  return {
    ...o,
    docId: o.docId ?? id,
    fuente: o.fuente ?? '',
    titulo: o.titulo ?? '(sin título)',
    organismo: o.organismo ?? '',
    pais: o.pais ?? null,
    tipo: o.tipo ?? null,
    url: o.url ?? '',
    publicado: o.publicado ?? null,
    cierre: o.cierre ?? null,
    fuentes: o.fuentes?.length ? o.fuentes : o.fuente ? [o.fuente] : [],
    detectado: o.detectado ?? null,
    relevancia: o.relevancia ?? 'sin_clasificar',
    puntaje: typeof o.puntaje === 'number' ? o.puntaje : null,
    estado: o.estado ?? 'nueva',
    historial: Array.isArray(o.historial) ? o.historial : [],
  } as Oportunidad;
}

export function configDesdeEnv(): FirebaseOptions | null {
  const env = import.meta.env;
  const cfg: FirebaseOptions = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  return cfg.apiKey && cfg.projectId && cfg.authDomain ? cfg : null;
}

export function crearFirebaseApi(opciones: FirebaseOptions): DataApi {
  const app = initializeApp(opciones);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'southamerica-east1');

  const llamar = async <I, O>(nombre: string, datos: I): Promise<O> => {
    const r = await httpsCallable<I, O>(functions, nombre)(datos);
    return r.data;
  };

  const usuarioDe = (u: User): UsuarioSesion => ({
    uid: u.uid,
    email: u.email ?? '',
    nombre: u.displayName ?? u.email ?? '',
    foto: u.photoURL ?? undefined,
  });

  return {
    modo: 'firebase',

    onSesion(cb) {
      let errorPendiente: string | undefined;
      let unsubPropio: (() => void) | null = null;
      let ultimoClaims = -1;
      let registrado = false;

      const evaluar = async (u: User, forzar: boolean) => {
        const res = await u.getIdTokenResult(forzar);
        const rol = ROLES.includes(res.claims.rol as Rol) ? (res.claims.rol as Rol) : null;
        if (!registrado) {
          registrado = true;
          try {
            await llamar<Record<string, never>, { rol: string | null }>('registrarIngreso', {});
          } catch (e) {
            console.warn('registrarIngreso falló', e);
          }
        }
        cb(rol ? { estado: 'ok', usuario: usuarioDe(u), rol } : { estado: 'sin_rol', usuario: usuarioDe(u) });
      };

      const unsubAuth = onAuthStateChanged(auth, async (u) => {
        unsubPropio?.();
        unsubPropio = null;
        ultimoClaims = -1;
        registrado = false;
        if (!u) {
          cb({ estado: 'anonimo', error: errorPendiente });
          errorPendiente = undefined;
          return;
        }
        if (!u.emailVerified || !esEmailDominio(u.email ?? '', DOMINIO)) {
          cb({ estado: 'dominio_invalido', usuario: usuarioDe(u) });
          errorPendiente = `Solo cuentas de ${DOMINIO}. Entraste con ${u.email ?? 'otra cuenta'}.`;
          await signOut(auth);
          return;
        }
        cb({ estado: 'cargando' });
        try {
          await evaluar(u, false);
        } catch (e) {
          cb({ estado: 'anonimo', error: (e as Error).message });
          return;
        }
        // Cuando un admin cambia el rol, la función actualiza claimsActualizados y refrescamos el token.
        unsubPropio = onSnapshot(
          doc(db, 'usuarios', u.uid),
          (snap) => {
            const ts = snap.get('claimsActualizados');
            const ms = ts instanceof Timestamp ? ts.toMillis() : 0;
            if (ultimoClaims === -1) {
              ultimoClaims = ms;
              return;
            }
            if (ms !== ultimoClaims) {
              ultimoClaims = ms;
              evaluar(u, true).catch((e) => console.warn(e));
            }
          },
          () => {
            /* sin permiso todavía: se reintenta en el próximo ingreso */
          },
        );
      });
      return () => {
        unsubPropio?.();
        unsubAuth();
      };
    },

    async ingresar() {
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ hd: DOMINIO, prompt: 'select_account' });
      await signInWithPopup(auth, p);
    },

    async salir() {
      await signOut(auth);
    },

    suscribirOportunidades(cb, onError) {
      return onSnapshot(
        collection(db, 'oportunidades'),
        (snap) => cb(snap.docs.map((d) => aOportunidad(d.id, d.data()))),
        (e) => onError(e),
      );
    },

    suscribirCorridas(cb) {
      let corridas: Corrida[] = [];
      let lock: { corridaId: string; inicio: Date | null } | null = null;
      const emitir = () => cb(corridas, lock);
      const u1 = onSnapshot(
        query(collection(db, 'corridas'), orderBy('inicio', 'desc'), limit(16)),
        (snap) => {
          corridas = snap.docs
            .filter((d) => d.id !== 'actual' && !d.get('lock'))
            .map((d) => {
              const c = aDates<Omit<Corrida, 'id'>>(d.data());
              return { ...c, fuentes: c.fuentes ?? {}, id: d.id };
            });
          emitir();
        },
        (e) => console.warn('corridas', e),
      );
      const u2 = onSnapshot(
        doc(db, 'corridas', 'actual'),
        (snap) => {
          if (!snap.exists()) lock = null;
          else {
            const d = aDates<{ corridaId: string; inicio: Date | null; expira?: Date | null }>(snap.data());
            const vencido = d.expira ? d.expira.getTime() < Date.now() : false;
            lock = vencido ? null : { corridaId: d.corridaId, inicio: d.inicio ?? null };
          }
          emitir();
        },
        () => undefined,
      );
      return () => {
        u1();
        u2();
      };
    },

    suscribirFuentes(cb) {
      return onSnapshot(
        collection(db, 'fuentes'),
        (snap) => {
          const porId = new Map(snap.docs.map((d) => [d.id, aDates<Partial<Fuente>>(d.data())]));
          const base: Fuente[] = FUENTES_BASE.map((f) => ({
            activa: true,
            metodo: 'http',
            ...f,
            ...(porId.get(f.id) ?? {}),
            id: f.id,
          }));
          const extra = [...porId.entries()]
            .filter(([id]) => !FUENTES_BASE.some((f) => f.id === id))
            .map(([id, d]) => ({ activa: false, metodo: 'manual', nombre: id, slug: id, paises: [], ...d, id }) as Fuente);
          cb([...base, ...extra]);
        },
        (e) => console.warn('fuentes', e),
      );
    },

    suscribirConfig(cb) {
      const partes: Record<string, object> = {};
      const emitir = () => cb(completarConfig(partes));
      const subs = (['perfil', 'busqueda', 'sistema'] as const).map((id) =>
        onSnapshot(
          doc(db, 'config', id),
          (snap) => {
            partes[id] = snap.exists() ? aDates<object>(snap.data()) : {};
            emitir();
          },
          (e) => console.warn(`config/${id}`, e),
        ),
      );
      return () => subs.forEach((u) => u());
    },

    suscribirUsuarios(cb) {
      return onSnapshot(
        collection(db, 'usuarios'),
        (snap) =>
          cb(
            snap.docs.map((d) => {
              const u = aDates<Partial<Usuario>>(d.data());
              return { ...u, uid: d.id, email: u.email ?? '', rol: u.rol ?? null } as Usuario;
            }),
          ),
        (e) => console.warn('usuarios', e),
      );
    },

    async cambiarEstado(op, cambio, autor) {
      const detalle =
        cambio.nuevo === 'descartada' && cambio.motivoDescarte
          ? `Motivo: ${cambio.motivoDescarte.codigo}${cambio.motivoDescarte.texto ? ` · ${cambio.motivoDescarte.texto}` : ''}`
          : undefined;
      await updateDoc(doc(db, 'oportunidades', op.docId), {
        estado: cambio.nuevo,
        estadoFecha: serverTimestamp(),
        motivoDescarte: cambio.nuevo === 'descartada' ? (cambio.motivoDescarte ?? null) : null,
        actualizado: serverTimestamp(),
        actualizadoPor: autor,
        historial: arrayUnion({
          tipo: 'estado',
          de: op.estado,
          a: cambio.nuevo,
          autor,
          fecha: Timestamp.now(),
          ...(detalle ? { detalle } : {}),
        }),
      });
    },

    async guardarNota(op, nota, autor) {
      await updateDoc(doc(db, 'oportunidades', op.docId), {
        nota,
        actualizado: serverTimestamp(),
        actualizadoPor: autor,
        historial: arrayUnion({ tipo: 'nota', de: null, a: nota.slice(0, 280), autor, fecha: Timestamp.now() }),
      });
    },

    async crearManual(d, autor) {
      const id = docIdManual(d.titulo);
      const etiqueta = CANALES_MANUALES.find((c) => c.clave === d.canal)?.etiqueta ?? 'Otro';
      await setDoc(doc(db, 'oportunidades', id), {
        docId: id,
        fuente: etiqueta,
        fuentes: [etiqueta],
        fuentesDetalle: [{ fuente: etiqueta, docId: id, url: d.url }],
        aliases: [],
        idOficial: null,
        titulo: d.titulo.trim(),
        organismo: d.organismo.trim(),
        pais: d.pais,
        tipo: 'otro',
        url: d.url.trim(),
        publicado: null,
        cierre: d.cierre ? Timestamp.fromDate(d.cierre) : null,
        monto: null,
        moneda: null,
        detectado: serverTimestamp(),
        detectadoCorrida: null,
        relevancia: 'media',
        puntaje: null,
        resumen: '',
        motivo: `Carga manual (${etiqueta})`,
        servicios: [],
        etapa: 'lista',
        estado: d.estado,
        estadoFecha: serverTimestamp(),
        motivoDescarte: null,
        nota: '',
        historial: [
          { tipo: 'alta', de: null, a: d.estado, autor, fecha: Timestamp.now(), detalle: `Carga manual (${etiqueta})` },
        ],
        manual: true,
        canal: d.canal,
        legacyId: null,
        orgId: ORG_ID,
        actualizado: serverTimestamp(),
        actualizadoPor: autor,
      });
      return id;
    },

    async guardarConfig(id, datos, autor) {
      const campos = Object.keys(datos);
      await setDoc(
        doc(db, 'config', id),
        { ...datos, version: increment(1), actualizado: serverTimestamp(), actualizadoPor: autor, orgId: ORG_ID },
        // mergeFields reemplaza cada campo completo (por ejemplo porFuente) en lugar de fusionar mapas.
        { mergeFields: [...campos, 'version', 'actualizado', 'actualizadoPor', 'orgId'] },
      );
    },

    async actualizarFuente(id, cambios, autor) {
      await setDoc(
        doc(db, 'fuentes', id),
        { ...cambios, actualizado: serverTimestamp(), actualizadoPor: autor, orgId: ORG_ID },
        { merge: true },
      );
    },

    async lanzarCorrida() {
      return llamar<Record<string, never>, { corridaId: string; ejecucion: string }>('lanzarCorrida', {});
    },

    async asignarRol(email, rol) {
      await llamar<{ email: string; rol: Rol | null }, { uid: string }>('asignarRol', { email: email.trim().toLowerCase(), rol });
    },
  };
}

export type { Sesion };
