data "google_project" "this" {
  project_id = var.project_id
}

locals {
  org_id         = "equipos"
  bucket_name    = "${var.project_id}-radar"
  workflow_name  = "radar-corrida"
  control_job    = "radar-control"
  collector_jobs = { for f in var.fuentes : f => "radar-collector-${f}" }
  ar_repo        = "radar"
  imagen_base    = "${var.region}-docker.pkg.dev/${var.project_id}/${local.ar_repo}/radar-pipeline"

  labels = {
    app     = "radar-licitaciones"
    entorno = var.entorno
  }

  # Variables de entorno comunes a todos los jobs del pipeline.
  env_comun = {
    GOOGLE_CLOUD_PROJECT = var.project_id
    RADAR_ENV            = var.entorno
    RADAR_BUCKET         = local.bucket_name
    RADAR_ORG_ID         = local.org_id
    VERTEX_LOCATION      = "global"
    FIRESTORE_DATABASE   = "(default)"
  }

  apis = [
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "eventarc.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "gmail.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
    "workflowexecutions.googleapis.com",
    "workflows.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Firebase y Firestore ──────────────────────────────────────────────

resource "google_firebase_project" "this" {
  provider = google-beta
  count    = var.habilitar_firebase ? 1 : 0

  project    = var.project_id
  depends_on = [google_project_service.apis]
}

resource "google_firestore_database" "default" {
  count = var.gestionar_firestore ? 1 : 0

  project                 = var.project_id
  name                    = "(default)"
  location_id             = var.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.apis]
}
