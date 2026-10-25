import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Sesion } from '../data';
import type { Config, Corrida, Fuente, Oportunidad, Rol, Umbrales, Usuario } from '../lib/tipos';

interface Datos {
  sesion: Sesion;
  rol: Rol | null;
  email: string;
  puedeEditar: boolean;
  esAdmin: boolean;
  oportunidades: Oportunidad[] | null;
  errorOportunidades: string | null;
  corridas: Corrida[];
  lock: { corridaId: string; inicio: Date | null } | null;
  ultimaCorrida: Corrida | null;
  fuentes: Fuente[];
  config: Config | null;
  /** null para el lector, que no lee config/*: se usa la relevancia guardada. */
  umbrales: Umbrales | null;
  usuarios: Usuario[];
}

const Ctx = createContext<Datos | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'cargando' });
  const [oportunidades, setOportunidades] = useState<Oportunidad[] | null>(null);
  const [errorOportunidades, setErrorOportunidades] = useState<string | null>(null);
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [lock, setLock] = useState<Datos['lock']>(null);
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  useEffect(() => api.onSesion(setSesion), []);

  const rol = sesion.estado === 'ok' ? sesion.rol : null;

  // Las suscripciones dependen del rol: sin rol no se lee nada.
  useEffect(() => {
    if (!rol) {
      setOportunidades(null);
      return;
    }
    const subs = [
      api.suscribirOportunidades(
        (o) => {
          setOportunidades(o);
          setErrorOportunidades(null);
        },
        (e) => setErrorOportunidades(e.message),
      ),
      api.suscribirCorridas((c, l) => {
        setCorridas(c);
        setLock(l);
      }),
      api.suscribirFuentes(setFuentes),
    ];
    if (rol !== 'lector') subs.push(api.suscribirConfig(setConfig));
    else setConfig(null);
    if (rol === 'admin') subs.push(api.suscribirUsuarios(setUsuarios));
    return () => subs.forEach((u) => u());
  }, [rol]);

  const valor = useMemo<Datos>(() => {
    // La más reciente (incluida una en curso): sus avisos nuevos llevan su corridaId.
    const ultimaCorrida = corridas[0] ?? null;
    return {
      sesion,
      rol,
      email: sesion.estado === 'ok' || sesion.estado === 'sin_rol' ? sesion.usuario.email : '',
      puedeEditar: rol === 'admin' || rol === 'editor',
      esAdmin: rol === 'admin',
      oportunidades,
      errorOportunidades,
      corridas,
      lock,
      ultimaCorrida,
      fuentes,
      config,
      umbrales: config?.busqueda.umbrales ?? null,
      usuarios,
    };
  }, [sesion, rol, oportunidades, errorOportunidades, corridas, lock, fuentes, config, usuarios]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDatos(): Datos {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDatos fuera de DatosProvider');
  return v;
}
