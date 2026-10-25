# ── Bucket de datos: crudos, normalizados y exports de Firestore ──────

resource "google_storage_bucket" "radar" {
  name                        = local.bucket_name
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels

  # Respuestas crudas de cada fuente: 30 días (RF-02).
  lifecycle_rule {
    condition {
      age            = 30
      matches_prefix = ["raw/"]
    }
    action {
      type = "Delete"
    }
  }

  # Avisos normalizados que pasan de los collectors a la consolidación: 30 días.
  lifecycle_rule {
    condition {
      age            = 30
      matches_prefix = ["normalizados/"]
    }
    action {
      type = "Delete"
    }
  }

  # Export semanal de Firestore: 8 semanas.
  lifecycle_rule {
    condition {
      age            = 56
      matches_prefix = ["exports/"]
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Artifact Registry ─────────────────────────────────────────────────

resource "google_artifact_registry_repository" "radar" {
  location      = var.region
  repository_id = local.ar_repo
  description   = "Imágenes del pipeline del radar de licitaciones"
  format        = "DOCKER"
  labels        = local.labels

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "conservar-ultimas-10"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "borrar-viejas"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 días
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Secret Manager ────────────────────────────────────────────────────

# Token de la API de la DNCP (si la API pide registro). El valor real se carga a mano:
#   printf '%s' "$TOKEN" | gcloud secrets versions add DNCP_API_TOKEN --data-file=-
# La versión inicial vale "ninguno": el collector de la DNCP la trata como "sin token".
resource "google_secret_manager_secret" "dncp_token" {
  secret_id = "DNCP_API_TOKEN"
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "dncp_token_inicial" {
  secret      = google_secret_manager_secret.dncp_token.id
  secret_data = "ninguno"

  lifecycle {
    ignore_changes = [secret_data]
  }
}
