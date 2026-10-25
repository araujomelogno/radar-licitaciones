# Despliegue y operación · Fase 1

Guía para levantar el radar en Google Cloud desde cero, en dos entornos separados (staging y producción), y operarlo después. La arquitectura y los contratos de datos están en [arquitectura.md](arquitectura.md).

| Pieza | Dónde vive | Cómo se despliega |
| --- | --- | --- |
| Infraestructura (cuentas de servicio, bucket, Cloud Run Jobs, Workflows, Scheduler, alertas, presupuesto, WIF) | [`infra/`](../infra) | `terraform apply`, a mano, por entorno |
| Workflow de la corrida | [`workflows/corrida.yaml`](../workflows/corrida.yaml) | Terraform la primera vez; después GitHub Actions |
| Imagen del pipeline (collectors y control) | [`pipeline/`](../pipeline) | GitHub Actions |
| App web, Firestore Rules e índices, Cloud Functions | [`web/`](../web), [`functions/`](../functions) | GitHub Actions (`firebase deploy`) |

## 0. Requisitos

- Ser owner de una organización o carpeta de GCP con permiso para crear proyectos, y tener acceso a una cuenta de facturación (rol `billing.costsManager` para la alerta de presupuesto).
- Un admin de Google Workspace de equipos.com.uy, para la delegación de dominio de Gmail (paso 6).
- Herramientas locales: `gcloud`, Terraform 1.9 o superior, Node 22, Python 3.12 y `firebase-tools` (`npm i -g firebase-tools`).

## 1. Proyectos y estado de Terraform

Un proyecto por entorno. Así billing, permisos y datos quedan separados, y un error en staging no toca producción.

```bash
for ENT in staging prod; do
  P=equipos-radar-$ENT
  gcloud projects create $P --name="Radar licitaciones $ENT"
  gcloud billing projects link $P --billing-account=XXXXXX-XXXXXX-XXXXXX
  # Bucket del estado de Terraform (con versionado, por si hay que volver atrás)
  gcloud storage buckets create gs://$P-tfstate --project=$P --location=southamerica-east1 \
    --uniform-bucket-level-access
  gcloud storage buckets update gs://$P-tfstate --versioning
done
```

Si usás otros nombres, ajustá `infra/envs/<entorno>.tfvars` y `infra/envs/backend-<entorno>.hcl`.

## 2. Terraform

```bash
cd infra
gcloud auth application-default login

terraform init -backend-config=envs/backend-staging.hcl
terraform apply -var-file=envs/staging.tfvars
```

Para producción, lo mismo con `-reconfigure -backend-config=envs/backend-prod.hcl` y `-var-file=envs/prod.tfvars`.

Notas del primer `apply`:

- Los Cloud Run Jobs se crean con una imagen pública de ejemplo (`var.imagen`), porque la imagen del radar todavía no existe. El primer deploy de GitHub Actions las reemplaza por el digest real, y Terraform ignora ese cambio en los `apply` siguientes.
- `gestionar_firestore = true` crea la base `(default)` en `southamerica-east1`. Si ya la creaste desde la consola de Firebase, ponelo en `false` o importala:
  `terraform import 'google_firestore_database.default[0]' projects/<proyecto>/databases/(default)`.
- `habilitar_firebase = true` agrega Firebase al proyecto. Si ya lo hiciste desde la consola, ponelo en `false`.
- Si la habilitación de alguna API tarda en propagarse y el `apply` falla, volvé a correrlo.

Salidas útiles (`terraform output`):

| Salida | Para qué |
| --- | --- |
| `wif_provider` | Variable `GCP_WIF_PROVIDER` de GitHub |
| `cuentas_de_servicio.deployer` | Variable `GCP_DEPLOYER_SA` de GitHub |
| `cuentas_de_servicio.eval` | Variable `GCP_EVAL_SA` de GitHub (solo staging) |
| `cuentas_de_servicio.functions` | Cuenta de runtime de las Cloud Functions |
| `control_client_id` | Client ID para la delegación de dominio de Gmail (paso 6) |
| `ip_salida` | IP fija de los collectors, si `ip_fija_habilitada = true` |

## 3. Firebase: app web y acceso con Google

En la [consola de Firebase](https://console.firebase.google.com/), para cada proyecto:

1. **Configuración del proyecto → Tus apps → Agregar app web.** Copiá los valores de `firebaseConfig`: van a las variables `VITE_FIREBASE_*` de GitHub (paso 4).
2. **Authentication → Método de acceso → Google → Habilitar.** Como correo de soporte, una cuenta de equipos.com.uy.
3. **Authentication → Configuración → Dominios autorizados:** dejá el dominio de Hosting (`<proyecto>.web.app`) y agregá el dominio propio si lo hay.
4. El acceso queda restringido a @equipos.com.uy en tres capas: la app pide cuentas del dominio, las Cloud Functions (`registrarIngreso`, `asignarRol`) rechazan otros dominios, y las Firestore Rules exigen email verificado de @equipos.com.uy más un rol en los *custom claims*. Una cuenta de Gmail puede autenticarse, pero no lee ningún dato.

## 4. GitHub: entornos y variables

En **Settings → Environments**, creá `staging` y `production`. En `production`, agregá revisores obligatorios si querés aprobar cada deploy a mano.

Variables de cada entorno (**Environment variables**, no hacen falta *secrets* porque no hay claves):

| Variable | Valor |
| --- | --- |
| `GCP_PROJECT_ID` | ID del proyecto del entorno |
| `GCP_WIF_PROVIDER` | Salida `wif_provider` |
| `GCP_DEPLOYER_SA` | Salida `cuentas_de_servicio.deployer` |
| `FIREBASE_PROJECT` | ID del proyecto (el mismo que `GCP_PROJECT_ID`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | De la app web del paso 3 |
| `GCP_EVAL_SA` (solo staging) | Salida `cuentas_de_servicio.eval` |

La `apiKey` de Firebase no es un secreto: identifica el proyecto y la seguridad la dan Auth y las Rules.

Flujo de deploy ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)):

- Push a `main` → **staging**.
- Tag `v*` (por ejemplo `v1.0.0`) → **producción**.
- *Run workflow* manual → el entorno que elijas.

Cada deploy construye la imagen del pipeline, actualiza los 12 Cloud Run Jobs al digest nuevo, publica el workflow y hace `firebase deploy` de Hosting, Rules, índices y Functions. [`ci.yml`](../.github/workflows/ci.yml) corre en cada PR: tests y lint del pipeline, las functions y la app, `terraform validate`, y el set de 50 avisos etiquetados cuando cambia el prompt.

## 5. Primer deploy

Hacé push a `main` (o corré *Deploy* a mano con `staging`). Al terminar:

- `gcloud run jobs list --region southamerica-east1` muestra los jobs con la imagen `radar-pipeline@sha256:…`.
- La app responde en `https://<proyecto>.web.app`.

## 6. Correo resumen: delegación de dominio de Gmail

El resumen de cada corrida (RF-14) sale por Gmail API desde una casilla real del dominio, por ejemplo `radar@equipos.com.uy`. La cuenta de servicio `radar-control` firma el JWT con IAM Credentials (sin claves descargadas) e impersona a esa casilla.

1. Creá la casilla remitente en Google Workspace (o elegí una existente).
2. En la [consola de administración](https://admin.google.com/): **Seguridad → Acceso y control de datos → Controles de API → Delegación de todo el dominio → Agregar nuevo**.
   - **ID de cliente:** la salida `control_client_id`.
   - **Permisos de OAuth:** `https://www.googleapis.com/auth/gmail.send`
3. En el panel del radar (o en `config/sistema`), poné la casilla en `remitente` y, si hace falta, sumá destinatarios en `destinatariosExtra` (por ejemplo, el editor que hoy recibe el resumen). Los admins lo reciben siempre.

La delegación puede tardar unos minutos en propagarse. Si el correo falla, la corrida igual termina y el error queda en el log con `evento=resumen_error`.

## 7. Primer admin, configuración inicial y migración

Estos comandos corren desde tu máquina, con tus credenciales de Google (necesitás `roles/firebaseauth.admin` y `roles/datastore.user` en el proyecto).

```bash
cd pipeline
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=equipos-radar-staging RADAR_BUCKET=equipos-radar-staging-radar RADAR_ORG_ID=equipos

# 1. Primer admin: setea el custom claim rol=admin y crea usuarios/{uid}.
python -m radar.cli bootstrap-admin --email nombre@equipos.com.uy

# 2. Configuración inicial: perfil, búsqueda (keywords semilla del PRD, exclusiones y umbrales),
#    sistema y las 10 fuentes. No pisa lo que ya exista.
python -m radar.cli seed

# 3. Migración del radar actual (RF-11): idempotente, se puede repetir.
python -m radar.cli migrar --export /ruta/al/export
```

El admin tiene que cerrar sesión y volver a entrar para que la app tome el rol nuevo. A partir de ahí, los demás usuarios se dan de alta desde la pestaña **Usuarios** del panel.

`migrar` informa cuántos registros leyó, importó y rechazó, y por qué. El criterio de salida exige 0 rechazos sin explicar.

## 8. Semana 1: prueba de acceso desde la nube (RF-13)

```bash
gcloud run jobs execute radar-probar-acceso --region southamerica-east1 --wait
```

Prueba cada fuente con HTTP simple y con navegador sin interfaz (Playwright) desde Cloud Run, y guarda el resultado en `fuentes/{id}.pruebaAcceso`. Se ve en la pestaña **Fuentes** del panel.

Si una fuente rechaza el pedido, se resuelve en este orden:

### 8.1 IP fija de salida (Cloud NAT, ~US$ 4–5/mes)

```bash
# en infra/envs/<entorno>.tfvars
ip_fija_habilitada = true
```

```bash
terraform apply -var-file=envs/<entorno>.tfvars
terraform output ip_salida
gcloud run jobs execute radar-probar-acceso --region southamerica-east1 --wait
```

Los collectors y el job de prueba pasan a salir por Direct VPC egress con todo el tráfico por la IP fija. Si el sitio acepta la IP (o la agrega a una lista blanca a pedido), listo.

### 8.2 Agente local en la oficina

Para fuentes que bloquean cualquier IP de nube. Corre en un equipo de la oficina siempre prendido, nunca en la computadora personal de alguien.

1. Creá una cuenta de Workspace dedicada, por ejemplo `radar-agente@equipos.com.uy`, y sumala en `agente_local_cuentas = ["user:radar-agente@equipos.com.uy"]`. `terraform apply` le da permiso para impersonar a `radar-collectors`, así que no hay claves descargadas.
2. En el equipo de la oficina:

   ```bash
   git clone https://github.com/araujomelogno/radar-licitaciones && cd radar-licitaciones/pipeline
   python3.12 -m venv .venv && source .venv/bin/activate
   pip install -e . && playwright install --with-deps chromium
   gcloud auth application-default login \
     --impersonate-service-account=radar-collectors@<proyecto>.iam.gserviceaccount.com
   ```

3. En el panel, pasá la fuente a método **agente local**. Desde ese momento, el collector de la nube la omite.
4. Programá el agente antes de la corrida de las 06:00, por ejemplo con un timer de systemd:

   ```ini
   # /etc/systemd/system/radar-agente.service
   [Service]
   Type=oneshot
   User=radar
   WorkingDirectory=/opt/radar-licitaciones/pipeline
   Environment=GOOGLE_CLOUD_PROJECT=equipos-radar-prod RADAR_BUCKET=equipos-radar-prod-radar RADAR_ORG_ID=equipos RADAR_ENV=prod
   ExecStart=/opt/radar-licitaciones/pipeline/.venv/bin/python -m radar.cli agente

   # /etc/systemd/system/radar-agente.timer
   [Timer]
   OnCalendar=*-*-* 05:30:00 America/Montevideo
   Persistent=true
   [Install]
   WantedBy=timers.target
   ```

   `python -m radar.cli agente` corre solo los collectors con método `agente_local` y deja sus avisos para que la corrida de las 06:00 los consolide.

### 8.3 Carga manual

Si nada de lo anterior funciona, pasá la fuente a método **manual** en el panel. El collector la omite y los llamados se cargan desde **Registro → Nuevo llamado**.

En ningún caso un collector inicia sesión, completa formularios, acepta cookies no esenciales ni se registra en un portal.

## 9. Staging y producción

| | Staging | Producción |
| --- | --- | --- |
| Proyecto | `equipos-radar-staging` | `equipos-radar-prod` |
| Deploy | Cada push a `main` | Tags `v*` o manual, con aprobación del entorno `production` |
| WIF | Cualquier ref del repo (incluye la evaluación en PRs) | Solo `refs/heads/main` y `refs/tags/v*` (`github_ref_prefijos`) |
| Corrida diaria | Sí, a las 06:00. Podés apagarla con `gcloud scheduler jobs pause radar-corrida-diaria --location southamerica-east1` | Sí, a las 06:00 |
| Resumen por correo | A los admins de staging (conviene poner solo al equipo de desarrollo) | A los admins y `destinatariosExtra` |
| Alerta de presupuesto | Opcional (`billing_account = ""`) | US$ 40/mes |

Los datos no se comparten entre entornos. Para probar con datos reales en staging, corré `migrar` también ahí.

## 10. Operación diaria

### Corrida manual

Desde el panel (**Fuentes → Lanzar corrida**), que llama a la Cloud Function `lanzarCorrida`. También por consola, para diagnóstico:

```bash
gcloud workflows run radar-corrida --location southamerica-east1 --data='{"disparo":"manual"}'
```

Si ya hay una corrida en curso, el pedido se rechaza (“ya hay una corrida en curso, empezó a las HH:MM”). El lock `corridas/actual` vence solo a los 60 minutos si una corrida murió sin cerrarlo.

### Ver qué pasó

- **Panel → Fuentes:** última corrida de cada fuente, avisos leídos y nuevos, último error.
- **Firestore → `corridas/{id}`:** inicio, fin, estado y conteos por fuente, tokens y costo del LLM.
- **Cloud Workflows → radar-corrida → Ejecuciones:** paso a paso de cada corrida.
- **Cloud Logging:** todos los logs llevan `corridaId`. Por ejemplo:
  `resource.type="cloud_run_job" AND jsonPayload.corridaId="20261025-060000-programada"`.

### Alertas (Cloud Monitoring, por correo a `emails_alertas`)

| Alerta | Cuándo |
| --- | --- |
| La corrida diaria falló | El workflow `radar-corrida` terminó con error |
| Sin corrida exitosa en 26 horas | El chequeo diario de las 08:30 (`radar-control verificar`, disparado por el scheduler `radar-verificar`) no encuentra una corrida ok o parcial |
| Una fuente trae 0 avisos 3 días seguidos | El cierre de la corrida lo detecta |
| Una fuente falló en la corrida | Una fuente agotó sus 2 reintentos o la bloquearon |
| Presupuesto | 50%, 90% y 100% de US$ 40/mes, y si el pronóstico supera el 100% |

### Respaldos

Cloud Scheduler lanza el workflow `radar-export-firestore` los domingos a las 03:00 y exporta Firestore a `gs://<proyecto>-radar/exports/<fecha>/`. Se conservan 8 semanas. Para restaurar:

```bash
gcloud firestore import gs://<proyecto>-radar/exports/<fecha>
```

Los crudos de cada fuente (`raw/`) y los normalizados (`normalizados/`) se borran solos a los 30 días.

## 11. Costos

La estimación de la spec es de US$ 5–15 por mes, con un techo de ~US$ 30 si hace falta la IP fija. Lo que más pesa es Gemini (~US$ 4/mes con el prefiltro). Cada corrida guarda en `corridas/{id}.llm` los tokens y el costo estimado, así que el gasto del LLM se puede seguir sin esperar la factura. La alerta de presupuesto en US$ 40/mes está desde el primer día.

Para bajar costos, si hiciera falta:

- Dejar `ip_fija_habilitada = false` mientras ninguna fuente la necesite.
- Pasar la clasificación diaria a modo *batch* de Gemini (cuesta la mitad).
- Pausar la corrida diaria de staging cuando no se esté probando nada.
