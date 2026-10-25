# Radar de licitaciones · Equipos Consultores

Radar autónomo de licitaciones en Google Cloud + Firebase. Esta versión implementa la **fase 1** de la
[spec](specs/Spec%20·%20Fase%201%20Radar%20autónomo%20y%20configuración.md): recolección diaria de 10 fuentes de
Uruguay y Paraguay, deduplicación, prefiltro, clasificación con Gemini, app web con Oportunidades y Registro,
panel de configuración, acceso restringido a @equipos.com.uy con tres roles, migración, resumen por correo y
observabilidad.

- [Arquitectura y contratos de datos](docs/arquitectura.md)
- [Despliegue paso a paso](docs/despliegue.md)
- [PRD](docs/PRD%20·%20Radar%20de%20Licitaciones%20Equipos%20(GCP%20+%20Firebase).md)

## Estructura

| Carpeta | Qué hay | Stack |
| --- | --- | --- |
| [`pipeline/`](pipeline) | Collectors de las 10 fuentes, normalización, dedup, prefiltro, clasificación, cierre y correo, migración, agente local y herramientas | Python 3.12 en Cloud Run Jobs, Gemini por Vertex AI |
| [`workflows/`](workflows) | Orquestación de la corrida diaria | Cloud Workflows + Cloud Scheduler |
| [`functions/`](functions) | `registrarIngreso`, `asignarRol`, `lanzarCorrida` y auditoría de configuración | Cloud Functions (Firebase, TypeScript) |
| [`web/`](web) | App: Oportunidades, Registro y Configuración (Perfil, Búsqueda, Fuentes, Usuarios) | React + Vite en Firebase Hosting |
| [`firestore.rules`](firestore.rules) | Permisos por rol | Firestore Rules |
| [`infra/`](infra) | Todo lo de GCP: jobs, workflow, bucket, cuentas de servicio, alertas, presupuesto, IP fija opcional y WIF | Terraform |
| [`.github/workflows/`](.github/workflows) | CI (tests, reglas, set etiquetado) y deploy a staging y producción | GitHub Actions con Workload Identity Federation |

## Cómo corre

```
06:00 Cloud Scheduler → Workflow radar-corrida
   iniciar (lock) → 10 collectors en paralelo (2 reintentos c/u) → consolidar → prefiltrar → clasificar → cerrar
                                                                                         └→ correo a los admins
App web ⇄ Firestore en tiempo real · “Lanzar corrida” → Cloud Function → mismo workflow
```

Cada paso es idempotente y la corrida se degrada por partes: una fuente caída o un aviso que Gemini no pudo
clasificar no frenan el resto.

## Desarrollo local

```bash
# Pipeline
cd pipeline && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/pytest -q

# Cloud Functions y Firestore Rules (el segundo usa el emulador; necesita Java)
cd functions && npm ci && npm run build && npm test && npm run test:reglas

# App web en modo demo (datos en memoria, sin Firebase)
cd web && npm ci && VITE_DEMO=1 npm run dev
```

## Pendientes que dependen del equipo

- **Semana 1:** correr `radar-probar-acceso` desde Cloud Run, reemplazar los fixtures sintéticos de
  `pipeline/tests/fixtures` por respuestas reales y ajustar selectores; configurar `fuentes/bid.resourceId`;
  confirmar si la API de la DNCP pide token.
- **Semana 3:** cargar el set de 50 avisos etiquetados en `pipeline/eval/set_etiquetado.jsonl`.
- **Semana 5:** cargar el perfil de la firma desde el panel.
- Delegación de dominio de Gmail para el remitente del resumen (ver [despliegue](docs/despliegue.md)).
