# Arquitectura y contratos · Fase 1

Este documento fija las decisiones de implementación de la [spec de la fase 1](../specs/Spec%20·%20Fase%201%20Radar%20autónomo%20y%20configuración.md). Todo lo que no está acá vale como está en la spec y el PRD.

## Vista general

```
Cloud Scheduler (06:00 America/Montevideo)          App web (Firebase Hosting, React + Vite)
        │                                                  │  lee Firestore en tiempo real
        ▼                                                  │  llama a Cloud Functions (callable)
Cloud Workflow  radar-corrida  ◄── lanzarCorrida (Function, solo admin)
  1. iniciar      (Cloud Run Job radar-control: toma el lock corridas/actual)
  2. collectors   (10 Cloud Run Jobs radar-collector-<fuente>, en paralelo, 2 reintentos con backoff)
  3. consolidar   (radar-control: normalización + dedup + upsert en oportunidades)
  4. prefiltrar   (radar-control: reglas deterministas de config/busqueda)
  5. clasificar   (radar-control: Gemini 3.1 Flash-Lite por Vertex AI)
  6. cerrar       (radar-control: estado de fuentes, alertas, correo resumen, libera el lock)
        │
        ▼
Firestore (southamerica-east1)  ·  Cloud Storage (raw/ 30 días, normalizados/, exports/ 8 semanas)
```

- **Pipeline:** Python 3.12, paquete `radar` en [`pipeline/`](../pipeline). Una sola imagen de contenedor; cada Cloud Run Job cambia el comando (`python -m radar.cli collect --fuente arce`, `python -m radar.cli consolidar ...`).
- **Functions:** TypeScript, Firebase Functions v2 en [`functions/`](../functions), región `southamerica-east1`.
- **App:** React + Vite + TypeScript en [`web/`](../web).
- **Infra:** Terraform en [`infra/`](../infra), Workflow en [`workflows/corrida.yaml`](../workflows/corrida.yaml), CI/CD en [`.github/workflows/`](../.github/workflows).

## Identificadores

`orgId` = `"equipos"` en todos los documentos.

### Fuentes (`fuentes/{id}`)

| id | `nombre` (valor de `fuente`) | prefijo de `docId` | países | método inicial |
| --- | --- | --- | --- | --- |
| `arce` | Compras Estatales | `ce-` | UY | `http` |
| `im` | Intendencia de Montevideo | `im-` | UY | `http` |
| `dncp` | DNCP Paraguay | `dncp-` | PY | `http` |
| `bm` | Banco Mundial | `bm-` | UY, PY | `http` |
| `bid` | BID | `bid-` | UY, PY | `http` |
| `ungm` | UNGM | `ungm-` | UY, PY | `http` |
| `cnd` | CND | `cnd-` | UY | `http` |
| `auci` | AUCI | `auci-` | UY | `http` |
| `fiap` | FIAP | `fiap-` | UY, PY | `http` |
| `ceibal` | Ceibal | `ceibal-` | UY | `http` |

Las compras de UTEC que llegan por ARCE quedan con `fuente: "UTEC"` y prefijo `ce-`. Los llamados manuales usan `fuente` = etiqueta del canal (`BEO`, `CAF`, `Correo`, `Contacto`, `Otro`) y `docId` = `manual-<slug>-<6 hex>`.

Prioridad de fuente oficial al fusionar (menor gana): Compras Estatales, UTEC, Intendencia de Montevideo, DNCP Paraguay, Banco Mundial, CND, Ceibal, UNGM, AUCI, FIAP, BID, LinkedIn, DevelopmentAid. En Paraguay la DNCP gana sobre el BID por este mismo orden.

### Estados (`estado`)

| clave | etiqueta |
| --- | --- |
| `nueva` | Nueva |
| `analizando` | Analizando |
| `postular` | Vamos a postular |
| `presentada` | Nos presentamos |
| `evaluacion` | En evaluación |
| `ganada` | Ganada |
| `perdida` | Perdida |
| `descartada` | Descartada |

“Analizando o más” = `analizando`, `postular`, `presentada`, `evaluacion`, `ganada`, `perdida`.

Motivos de descarte (`motivoDescarte.codigo`): `fuera_rubro`, `monto`, `pais`, `requisitos`, `plazo`, `otro` (con `motivoDescarte.texto` obligatorio).

### Relevancia (`relevancia`)

`alta` | `media` | `baja` | `sin_clasificar`. Se deriva de `puntaje` con `config/busqueda.umbrales` (por defecto `alta: 70`, `media: 40`). La app recalcula la relevancia mostrada con los umbrales vigentes, así que cambiar un umbral no obliga a reclasificar.

Una oportunidad está **abierta** si `cierre` es nulo o futuro, y su `estado` no es `descartada`, `ganada` ni `perdida`.

## Colecciones

### `oportunidades/{docId}`

Campos de `AvisoNormalizado` (ver la spec) más:

| Campo | Tipo | Nota |
| --- | --- | --- |
| `fuentes` | string[] | Nombres de todas las fuentes donde apareció |
| `fuentesDetalle` | `{fuente, docId, url}[]` | Una entrada por fuente |
| `aliases` | string[] | `docId` de avisos fusionados en este documento |
| `detectado` | timestamp | Primera vez que lo vio el radar (o alta manual) |
| `detectadoCorrida` | string | `corridaId` de la corrida que lo detectó (“nuevas en la última corrida”) |
| `vistoCorrida` | string | Última corrida que lo vio |
| `actualizado` | timestamp | |
| `textoLargo` | number | Largo original del texto antes de cortar a 20.000 |
| `etapa` | `prefiltro` \| `clasificar` \| `lista` | Paso pendiente del pipeline |
| `relevancia` | enum | ver arriba |
| `puntaje` | number \| null | 0–100 |
| `resumen`, `motivo` | string | |
| `servicios` | string[] | |
| `clasificacion` | `{modelo, promptVersion, fecha, confianza, esInvestigacion, intentos}` | |
| `prefiltro` | `{paso: boolean, regla: string \| null}` | |
| `estado` | enum | |
| `estadoFecha` | timestamp | |
| `motivoDescarte` | `{codigo, texto}` \| null | |
| `nota` | string | |
| `historial` | `{tipo, de, a, autor, fecha, detalle?}[]` | `tipo`: `alta`, `estado`, `cierre`, `nota`, `fusion`, `migracion` |
| `manual` | boolean | Los manuales no se reclasifican ni se tocan en las corridas |
| `canal` | string \| null | Solo manuales: `BEO`, `CAF`, `correo`, `contacto`, `otro` |
| `admiteExtranjeras` | boolean \| null | Paraguay |
| `legacyId` | string \| null | |
| `actualizadoPor` | string | email |

El historial se agrega con `arrayUnion`: si dos editores cambian el mismo llamado a la vez, gana el último valor de `estado` y las dos entradas quedan en el historial.

### `config/*`

- `config/perfil`: `servicios[]`, `sectores[]`, `antecedentes[{titulo, cliente, anio, monto, moneda}]`, `paises[]`, `rangoMonto{min, max, moneda}`, `version`, `actualizado`, `actualizadoPor`.
- `config/busqueda`: `incluir[]`, `excluir[]` (exclusiones por palabra), `excluirRubros[]` (exclusiones temáticas), `porFuente{<fuenteId>: {incluir[], excluir[]}}`, `umbrales{alta, media}`, `ventanaDias`, `version`, `actualizado`, `actualizadoPor`. Listas sin duplicados y hasta 200 elementos.
- `config/sistema`: `modelo`, `promptVersion`, `appUrl`, `remitente`, `destinatariosExtra[]`, `precios{entradaPorMillon, salidaPorMillon}`, `version`.

Cada guardado desde el panel sube `version` (con `increment(1)`) y escribe `actualizadoPor`. La Cloud Function `auditarCambios` deja la entrada en `auditoria`.

### `fuentes/{id}`

`nombre`, `slug`, `paises[]`, `activa`, `metodo` (`http` | `navegador` | `agente_local` | `manual`), `url`, `ultimaCorrida{corridaId, inicio, fin, estado, leidos, nuevos, actualizados, error}`, `ceroConsecutivos`, `pruebaAcceso{http, navegador, fecha, detalle}`, `orgId`.

`ultimaCorrida.estado`: `ok`, `error`, `bloqueo` (“bloqueo de acceso”), `omitida` (apagada, agente local o manual).

### `corridas/{id}` y `corridas/actual`

- `id` = `AAAAMMDD-HHMMSS-<programada|manual>` (hora de Montevideo).
- `inicio`, `fin`, `estado` (`en_curso` | `ok` | `parcial` | `error`), `disparo`, `solicitadoPor`, `ejecucion` (nombre de la ejecución del workflow), `configVersion{perfil, busqueda}`, `fuentes{<id>: {estado, leidos, nuevos, actualizados, error}}`, `totales{leidos, nuevos, actualizados, fusionados, prefiltrados, clasificados, sinClasificar}`, `llm{llamadas, tokensEntrada, tokensSalida, costoUsd}`.
- `corridas/actual` es el lock: `{corridaId, inicio, expira, lock: true}`. Se borra al cerrar. Un lock vencido (más de 60 minutos) se ignora.

### `usuarios/{uid}` y `auditoria/{id}`

- `usuarios/{uid}`: `email`, `nombre`, `foto`, `rol` (`admin` | `editor` | `lector` | null), `creado`, `ultimoAcceso`, `claimsActualizados`, `orgId`. El usuario puede leer su propio documento (para refrescar el token cuando cambia su rol).
- `auditoria/{id}`: `fecha`, `autor`, `coleccion`, `docId`, `accion`, `cambios{campo: {de, a}}`, `version`, `orgId`.

### Reservadas

`competidores`, `adjudicaciones`, `propuestas`, `contactos` y `postulaciones` existen en el esquema y la migración las importa, pero la fase 1 no las muestra.

## Custom claims

`{ rol: 'admin' | 'editor' | 'lector', orgId: 'equipos' }`. Las Firestore Rules exigen además `email_verified` y un email `@equipos.com.uy`.

## Cloud Functions (callable, `southamerica-east1`)

| Nombre | Quién | Entrada | Salida |
| --- | --- | --- | --- |
| `registrarIngreso` | cualquier cuenta @equipos.com.uy verificada | `{}` | `{rol: string \| null}`. Crea o actualiza `usuarios/{uid}` |
| `asignarRol` | admin | `{email, rol: 'admin' \| 'editor' \| 'lector' \| null}` | `{uid}`. Crea el usuario en Auth si no existe, setea claims y `usuarios/{uid}` |
| `lanzarCorrida` | admin | `{}` | `{corridaId, ejecucion}`. Error `failed-precondition` con “ya hay una corrida en curso, empezó a las HH:MM” |
| `auditarCambios` | trigger | escrituras en `config/{id}` y `fuentes/{id}` | Escribe `auditoria` |

## Correo resumen

Gmail API con delegación de dominio desde la cuenta de servicio del pipeline, firmando el JWT con IAM Credentials (sin claves descargadas). Remitente: `config/sistema.remitente`. Destinatarios: usuarios con rol admin más `config/sistema.destinatariosExtra`.
