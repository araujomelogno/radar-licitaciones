import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tipo = 'ok' | 'err' | 'info';
interface Toast {
  id: number;
  msg: string;
  tipo: Tipo;
}

const Ctx = createContext<(msg: string, tipo?: Tipo) => void>(() => undefined);

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, tipo: Tipo = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'err' ? 6000 : 3600);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            <span aria-hidden>{t.tipo === 'ok' ? '✓' : t.tipo === 'err' ? '!' : 'i'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
