# ── Cloud Workflow de la corrida diaria (RF-01) ───────────────────────

resource "google_workflows_workflow" "corrida" {
  name            = local.workflow_name
  region          = var.region
  description     = "Corrida diaria del radar: collectors en paralelo, consolidación, prefiltro, clasificación y cierre."
  service_account = google_service_account.workflow.id
  call_log_level  = "LOG_ERRORS_ONLY"
  labels          = local.labels
  source_contents = file("${path.module}/../workflows/corrida.yaml")

  user_env_vars = {
    RADAR_FUENTES     = join(",", var.fuentes)
    RADAR_CONTROL_JOB = local.control_job
  }

  depends_on = [google_project_service.apis]
}

# ── Cloud Scheduler ───────────────────────────────────────────────────

# Corrida diaria a las 06:00 de Montevideo.
resource "google_cloud_scheduler_job" "corrida_diaria" {
  name        = "radar-corrida-diaria"
  region      = var.region
  description = "Dispara el workflow radar-corrida todos los días."
  schedule    = var.horario_corrida
  time_zone   = var.zona_horaria

  retry_config {
    retry_count          = 2
    min_backoff_duration = "60s"
  }

  http_target {
    http_method = "POST"
    uri         = "https://workflowexecutions.googleapis.com/v1/${google_workflows_workflow.corrida.id}/executions"
    body = base64encode(jsonencode({
      argument = jsonencode({ disparo = "programada" })
    }))
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_project_iam_member.scheduler]
}

# Chequeo de "no hubo corrida exitosa en 26 horas" (RF-12). El job escribe un log
# evento=sin_corrida_exitosa que dispara la alerta de Cloud Monitoring.
resource "google_cloud_scheduler_job" "verificar" {
  name        = "radar-verificar"
  region      = var.region
  description = "Verifica que haya una corrida exitosa en las últimas 26 horas."
  schedule    = var.horario_verificacion
  time_zone   = var.zona_horaria

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.control.name}:run"
    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [{ args = ["verificar"] }]
      }
    }))
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_verificar]
}

# Export semanal de Firestore a gs://<bucket>/exports/<fecha>/ (se conserva 8 semanas).
# Va por un workflow chico porque el prefijo tiene que cambiar en cada export: si se
# repitiera, cada semana pisaría a la anterior y la retención de 8 semanas no serviría.
resource "google_workflows_workflow" "export_firestore" {
  name            = "radar-export-firestore"
  region          = var.region
  description     = "Export de Firestore a Cloud Storage con un prefijo por fecha."
  service_account = google_service_account.workflow.id
  call_log_level  = "LOG_ERRORS_ONLY"
  labels          = local.labels
  source_contents = <<-YAML
    main:
      steps:
        - preparar:
            assign:
              - proyecto: $${sys.get_env("GOOGLE_CLOUD_PROJECT_ID")}
              - fecha: $${text.substring(time.format(sys.now(), "America/Montevideo"), 0, 10)}
        - exportar:
            call: googleapis.firestore.v1.projects.databases.exportDocuments
            args:
              name: $${"projects/" + proyecto + "/databases/(default)"}
              body:
                outputUriPrefix: $${"gs://${local.bucket_name}/exports/" + fecha}
            result: operacion
        - fin:
            return: $${operacion.name}
  YAML

  depends_on = [google_project_service.apis]
}

resource "google_cloud_scheduler_job" "export_firestore" {
  name        = "radar-export-firestore"
  region      = var.region
  description = "Export semanal de Firestore a Cloud Storage."
  schedule    = var.horario_export
  time_zone   = var.zona_horaria

  http_target {
    http_method = "POST"
    uri         = "https://workflowexecutions.googleapis.com/v1/${google_workflows_workflow.export_firestore.id}/executions"
    body        = base64encode(jsonencode({ argument = "{}" }))
    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [
    google_project_iam_member.scheduler,
    google_storage_bucket_iam_member.firestore_agent_export,
  ]
}
