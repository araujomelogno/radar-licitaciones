import type { DataApi } from './api';
import { crearDemoApi } from './demo';
import { configDesdeEnv, crearFirebaseApi } from './firebase';

export * from './api';

/** Modo demo si se pide explícitamente o si falta la configuración de Firebase. */
function crearApi(): DataApi {
  const cfg = configDesdeEnv();
  if (import.meta.env.VITE_DEMO === '1' || !cfg) return crearDemoApi();
  return crearFirebaseApi(cfg);
}

export const api: DataApi = crearApi();
