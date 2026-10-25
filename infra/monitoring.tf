# ── Observabilidad y alertas operativas (RF-12) ───────────────────────
# El pipeline escribe logs JSON con evento, corridaId y fuente. Las alertas avisan por
# correo a los admins de emails_alertas.

resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.emails_alertas)

  display_name = "Radar · ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }

  depends_on = [google_project_service.apis]
}

locals {
  canales_alerta = [for c in google_monitoring_notification_channel.email : c.id]
  filtro_jobs    = "resource.type=\"cloud_run_job\" AND resource.labels.job_name=~\"^radar-\""
}

# ── Métricas basadas en logs (para el tablero y para medir el 98% de corridas exitosas) ──

resource "google_logging_metric" "corrida_cerrada" {
  name        = "radar/corrida_cerrada"
  description = "Corridas cerradas, por estado (ok, parcial, error)."
  filter      = "${local.filtro_jobs} AND jsonPayload.evento=\"corrida_cerrada\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "estado"
      value_type = "STRING"
    }
  }

  label_extractors = {
    estado = "EXTRACT(jsonPayload.estado)"
  }
}

resource "google_logging_metric" "fuente_error" {
  name        = "radar/fuente_error"
  description = "Fuentes que agotaron sus reintentos o fallaron en una corrida."
  filter      = "(${local.filtro_jobs} OR resource.type=\"workflows.googleapis.com/Workflow\") AND jsonPayload.evento=\"fuente_error\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "fuente"
      value_type = "STRING"
    }
  }

  label_extractors = {
    fuente = "EXTRACT(jsonPayload.fuente)"
  }
}

# ── Alertas ──

# El workflow de la corrida terminó con error.
resource "google_monitoring_alert_policy" "workflow_fallo" {
  display_name = "Radar · la corrida diaria falló"
  combiner     = "OR"
  severity     = "ERROR"

  conditions {
    display_name = "Ejecución fallida de radar-corrida"
    condition_threshold {
      filter          = "resource.type=\"workflows.googleapis.com/Workflow\" AND resource.labels.workflow_id=\"${local.workflow_name}\" AND metric.type=\"workflows.googleapis.com/finished_execution_count\" AND metric.labels.status=\"FAILED\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "La ejecución del workflow `${local.workflow_name}` falló. Revisá la ejecución en Cloud Workflows y el documento `corridas/{id}` en Firestore. Si quedó el lock `corridas/actual`, vence solo a los 60 minutos."
  }

  notification_channels = local.canales_alerta
  user_labels           = local.labels

  depends_on = [google_project_service.apis]
}

# No hubo corrida exitosa en 26 horas (lo detecta el job radar-control verificar).
resource "google_monitoring_alert_policy" "sin_corrida_exitosa" {
  display_name = "Radar · sin corrida exitosa en 26 horas"
  combiner     = "OR"
  severity     = "CRITICAL"

  conditions {
    display_name = "Log evento=sin_corrida_exitosa"
    condition_matched_log {
      filter = "${local.filtro_jobs} AND jsonPayload.evento=\"sin_corrida_exitosa\""
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "86400s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "No hay ninguna corrida en estado ok o parcial en las últimas 26 horas. Revisá Cloud Scheduler (`radar-corrida-diaria`), las ejecuciones de `${local.workflow_name}` y la colección `corridas`."
  }

  notification_channels = local.canales_alerta
  user_labels           = local.labels

  depends_on = [google_project_service.apis]
}

# Una fuente trajo 0 avisos 3 días seguidos (lo detecta el cierre de la corrida).
resource "google_monitoring_alert_policy" "fuente_cero" {
  display_name = "Radar · una fuente trae 0 avisos 3 días seguidos"
  combiner     = "OR"
  severity     = "WARNING"

  conditions {
    display_name = "Log evento=fuente_cero_3_dias"
    condition_matched_log {
      filter = "${local.filtro_jobs} AND jsonPayload.evento=\"fuente_cero_3_dias\""
      label_extractors = {
        fuente = "EXTRACT(jsonPayload.fuente)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "86400s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "La fuente $${log.extracted_label.fuente} no trajo avisos en las últimas 3 corridas. Puede ser un scraper roto o un bloqueo de acceso: revisá la pestaña Fuentes del panel."
  }

  notification_channels = local.canales_alerta
  user_labels           = local.labels

  depends_on = [google_project_service.apis]
}

# Una fuente falló en la corrida (agotó sus reintentos o la bloquearon).
resource "google_monitoring_alert_policy" "fuente_error" {
  display_name = "Radar · una fuente falló en la corrida"
  combiner     = "OR"
  severity     = "WARNING"

  conditions {
    display_name = "Log evento=fuente_error"
    condition_matched_log {
      filter = "(${local.filtro_jobs} OR resource.type=\"workflows.googleapis.com/Workflow\") AND jsonPayload.evento=\"fuente_error\" AND severity>=ERROR"
      label_extractors = {
        fuente = "EXTRACT(jsonPayload.fuente)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "86400s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "La fuente $${log.extracted_label.fuente} falló en la corrida. El resto de la corrida siguió y la fuente quedó en rojo en el panel. Si el detalle dice \"bloqueo de acceso\", el admin puede pasarla a agente local o a carga manual."
  }

  notification_channels = local.canales_alerta
  user_labels           = local.labels

  depends_on = [google_project_service.apis]
}
