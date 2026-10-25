import { useCallback, useEffect, useState } from 'react';

export type Tema = 'light' | 'dark';
const CLAVE = 'radar-tema';

function temaSistema(): Tema {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

/** Tema efectivo: el elegido por el usuario o, si no eligió, el del sistema. */
export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => temaGuardado() ?? temaSistema());

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const cambio = () => {
      if (!temaGuardado()) setTema(temaSistema());
    };
    mq?.addEventListener?.('change', cambio);
    return () => mq?.removeEventListener?.('change', cambio);
  }, []);

  const alternar = useCallback(() => {
    setTema((t) => {
      const n: Tema = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(CLAVE, n);
      } catch {
        /* sin almacenamiento: el cambio dura la sesión */
      }
      document.documentElement.dataset.theme = n;
      return n;
    });
  }, []);

  return [tema, alternar];
}
