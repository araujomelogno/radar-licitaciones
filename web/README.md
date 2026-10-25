# App web · Radar de Licitaciones

React 18 + Vite + TypeScript sobre Firebase (Auth con Google, Firestore en tiempo real y Cloud Functions callable). Sigue los contratos de [`docs/arquitectura.md`](../docs/arquitectura.md).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar VITE_FIREBASE_* del proyecto
npm run dev                  # http://localhost:5173
npm run dev:demo             # sin Firebase: datos de ejemplo en memoria
```

Si faltan las variables `VITE_FIREBASE_*`, la app arranca sola en **modo demo**. En modo demo:

- `?rol=admin|editor|lector|sin_rol|anonimo` elige con qué rol entrar (también hay un selector en la barra lateral).
- `?n=2000` agrega 2.000 oportunidades sintéticas para probar el rendimiento.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run build` | Typecheck y build de producción en `dist/` |
| `npm run typecheck` | Solo TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Tests unitarios (Vitest) de los helpers puros |

## Estructura

- `src/data/`: capa de acceso a datos. `api.ts` define la interfaz; `firebase.ts` la implementa con Firebase y `demo.ts` en memoria. La app solo usa `api` (de `src/data/index.ts`).
- `src/context/`: sesión y suscripciones en tiempo real (`Datos.tsx`), avisos (`Toasts.tsx`) y tema claro/oscuro (`tema.ts`).
- `src/pages/`: Oportunidades, Registro, Configuración (Perfil, Búsqueda, Fuentes, Usuarios) y las pantallas de acceso.
- `src/lib/`: tipos, constantes (estados, fuentes, motivos) y helpers puros (relevancia, fechas en hora de Montevideo, CSV).

## Notas

- Las rutas usan `BrowserRouter`: el hosting tiene que reescribir `**` a `/index.html`.
- La relevancia mostrada se deriva del `puntaje` con los umbrales de `config/busqueda`, así que cambiar un umbral no obliga a reclasificar. El lector no lee `config/*` y ve la relevancia guardada por el pipeline.
- Modo claro y oscuro: sigue al sistema hasta que el usuario elige uno con el botón de la barra lateral.
