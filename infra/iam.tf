# Una cuenta de servicio por componente, con permisos mínimos (requisito de seguridad P0).

resource "google_service_account" "collectors" {
  account_id   = "radar-collectors"
  display_name = "Radar · collectors (Cloud Run Jobs por fuente)"
}

resource "google_service_account" "control" {
  account_id   = "radar-control"
  display_name = "Radar · control del pipeline (iniciar, consolidar, prefiltrar, clasificar, cerrar)"
}

resource "google_service_account" "workflow" {
  account_id   = "radar-workflow"
  display_name = "Radar · Cloud Workflow de la corrida"
}

resource "google_service_account" "scheduler" {
  account_id   = "radar-scheduler"
  display_name = "Radar · Cloud Scheduler (corrida, verificación y export)"
}

resource "google_service_account" "functions" {
  account_id   = "radar-functions"
  display_name = "Radar · Cloud Functions (lanzarCorrida, asignarRol, registrarIngreso, auditarCambios)"
}

resource "google_service_account" "deployer" {
  account_id   = "radar-deployer"
  display_name = "Radar · deploy desde GitHub Actions (WIF)"
}

resource "google_service_account" "eval" {
  account_id   = "radar-eval"
  display_name = "Radar · evaluación del set etiquetado en CI (solo Vertex AI)"
}

locals {
  bucket_raw_prefix  = "projects/_/buckets/${local.bucket_name}/objects/raw/"
  bucket_norm_prefix = "projects/_/buckets/${local.bucket_name}/objects/normalizados/"
}

# ── Collectors ────────────────────────────────────────────────────────
# Leen fuentes/ y config/ en Firestore, escriben raw/ y normalizados/ en el bucket
# y leen el token de la DNCP.

resource "google_project_iam_member" "collectors" {
  for_each = toset([
    "roles/datastore.user",
    "roles/logging.logWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.collectors.member
}

resource "google_storage_bucket_iam_member" "collectors_objetos" {
  bucket = google_storage_bucket.radar.name
  role   = "roles/storage.objectAdmin"
  member = google_service_account.collectors.member

  condition {
    title       = "solo-raw-y-normalizados"
    description = "Los collectors solo escriben bajo raw/ y normalizados/"
    expression  = "resource.name.startsWith(\"${local.bucket_raw_prefix}\") || resource.name.startsWith(\"${local.bucket_norm_prefix}\")"
  }
}

resource "google_secret_manager_secret_iam_member" "collectors_dncp" {
  secret_id = google_secret_manager_secret.dncp_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.collectors.member
}

# ── Control ───────────────────────────────────────────────────────────
# Firestore, bucket completo (lee normalizados y crudos para reprocesar), Vertex AI,
# y firma de JWT sobre sí misma para la delegación de dominio de Gmail.

resource "google_project_iam_member" "control" {
  for_each = toset([
    "roles/datastore.user",
    "roles/aiplatform.user",
    "roles/logging.logWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.control.member
}

resource "google_storage_bucket_iam_member" "control_objetos" {
  bucket = google_storage_bucket.radar.name
  role   = "roles/storage.objectAdmin"
  member = google_service_account.control.member
}

resource "google_service_account_iam_member" "control_firma_propia" {
  service_account_id = google_service_account.control.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.control.member
}

# ── Workflow ──────────────────────────────────────────────────────────
# Ejecuta los jobs con argumentos propios, lee corridas/actual para saber si iniciar
# rechazó la corrida por el lock, y lanza el export semanal de Firestore.

resource "google_project_iam_member" "workflow" {
  for_each = toset([
    "roles/run.jobsExecutorWithOverrides",
    "roles/run.viewer",
    "roles/datastore.viewer",
    "roles/datastore.importExportAdmin",
    "roles/logging.logWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.workflow.member
}

# ── Scheduler ─────────────────────────────────────────────────────────

resource "google_project_iam_member" "scheduler" {
  for_each = toset([
    "roles/workflows.invoker",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.scheduler.member
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_verificar" {
  name     = google_cloud_run_v2_job.control.name
  location = var.region
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = google_service_account.scheduler.member
}

resource "google_storage_bucket_iam_member" "workflow_export_bucket" {
  bucket = google_storage_bucket.radar.name
  role   = "roles/storage.legacyBucketReader"
  member = google_service_account.workflow.member
}

# El agente de servicio de Firestore es quien escribe el export en el bucket.
resource "google_project_service_identity" "firestore" {
  provider = google-beta
  project  = var.project_id
  service  = "firestore.googleapis.com"
}

resource "google_storage_bucket_iam_member" "firestore_agent_export" {
  bucket = google_storage_bucket.radar.name
  role   = "roles/storage.admin"
  member = google_project_service_identity.firestore.member
}

# ── Cloud Functions ───────────────────────────────────────────────────
# lanzarCorrida inicia el workflow; asignarRol maneja usuarios de Auth y custom claims;
# auditarCambios es un trigger de Firestore (Eventarc → Cloud Run).

resource "google_project_iam_member" "functions" {
  for_each = toset([
    "roles/workflows.invoker",
    "roles/datastore.user",
    "roles/firebaseauth.admin",
    "roles/logging.logWriter",
    "roles/eventarc.eventReceiver",
    "roles/run.invoker",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.functions.member
}

# ── Evaluación en CI ──────────────────────────────────────────────────

resource "google_project_iam_member" "eval" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/serviceusage.serviceUsageConsumer",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.eval.member
}

# ── Deployer (GitHub Actions) ─────────────────────────────────────────
# Publica la imagen, actualiza los jobs y el workflow, y hace firebase deploy
# (hosting, reglas, índices y functions).

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/run.admin", # firebase deploy deja invocables las callable (setIamPolicy en Cloud Run)
    "roles/workflows.editor",
    "roles/firebase.admin",
    "roles/cloudfunctions.developer",
    "roles/cloudbuild.builds.editor",
    "roles/datastore.indexAdmin",
    "roles/firebaserules.admin",
    "roles/secretmanager.viewer",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/eventarc.developer",
  ])
  project = var.project_id
  role    = each.value
  member  = google_service_account.deployer.member
}

# actAs sobre las cuentas de runtime que el deploy asigna (jobs, workflow, functions)
# y sobre la cuenta por defecto de Compute que usa Cloud Build para compilar las functions.
resource "google_service_account_iam_member" "deployer_act_as" {
  for_each = {
    collectors = google_service_account.collectors.name
    control    = google_service_account.control.name
    workflow   = google_service_account.workflow.name
    functions  = google_service_account.functions.name
    compute    = "projects/${var.project_id}/serviceAccounts/${data.google_project.this.number}-compute@developer.gserviceaccount.com"
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member

  depends_on = [google_project_service.apis]
}

# Firebase CLI intenta dar este rol al desplegar triggers de Firestore (v2) y desde CI
# no puede cambiar la política del proyecto, así que se otorga acá.
resource "google_project_service_identity" "pubsub" {
  provider = google-beta
  project  = var.project_id
  service  = "pubsub.googleapis.com"
}

resource "google_project_iam_member" "pubsub_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = google_project_service_identity.pubsub.member
}

# ── Agente local (plan B de RF-13) ────────────────────────────────────
# El equipo de la oficina corre los collectors con método agente_local usando una cuenta
# de Workspace dedicada que impersona a radar-collectors (sin claves de servicio).
resource "google_service_account_iam_member" "agente_local" {
  for_each = toset(var.agente_local_cuentas)

  service_account_id = google_service_account.collectors.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}
