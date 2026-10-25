# ── Collectors: un Cloud Run Job por fuente ───────────────────────────
# El workflow los ejecuta con argumentos propios (--corrida-id) y maneja los reintentos
# con espera creciente, por eso max_retries = 0.

resource "google_cloud_run_v2_job" "collector" {
  for_each = local.collector_jobs

  name                = each.value
  location            = var.region
  deletion_protection = false
  labels              = merge(local.labels, { componente = "collector", fuente = each.key })

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.collectors.email
      timeout         = "900s"
      max_retries     = 0

      containers {
        image   = var.imagen
        command = ["python", "-m", "radar.cli"]
        args    = ["collect", "--fuente", each.key]

        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi" # Playwright necesita margen para Chromium.
          }
        }

        dynamic "env" {
          for_each = merge(local.env_comun, { RADAR_SA_EMAIL = google_service_account.collectors.email })
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = each.key == "dncp" ? [1] : []
          content {
            name = "DNCP_API_TOKEN"
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.dncp_token.secret_id
                version = "latest"
              }
            }
          }
        }
      }

      # Plan B de RF-13: salida por Cloud NAT con IP fija.
      dynamic "vpc_access" {
        for_each = var.ip_fija_habilitada ? [1] : []
        content {
          egress = "ALL_TRAFFIC"
          network_interfaces {
            network    = google_compute_network.radar[0].id
            subnetwork = google_compute_subnetwork.radar[0].id
          }
        }
      }
    }
  }

  lifecycle {
    # La imagen la actualiza el deploy de GitHub Actions al digest de cada build.
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.collectors_dncp,
    google_secret_manager_secret_version.dncp_token_inicial,
  ]
}

# ── Control: iniciar, consolidar, prefiltrar, clasificar, cerrar, marcar-fuente, verificar ──
# Un solo job; cada ejecución sobreescribe los argumentos.

resource "google_cloud_run_v2_job" "control" {
  name                = local.control_job
  location            = var.region
  deletion_protection = false
  labels              = merge(local.labels, { componente = "control" })

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.control.email
      timeout         = "900s"
      max_retries     = 0

      containers {
        image   = var.imagen
        command = ["python", "-m", "radar.cli"]
        args    = ["verificar"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        dynamic "env" {
          for_each = merge(local.env_comun, { RADAR_SA_EMAIL = google_service_account.control.email })
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_service.apis]
}

# ── Prueba de acceso desde la nube (semana 1, RF-13) ─────────────────
# Se ejecuta a mano: gcloud run jobs execute radar-probar-acceso --region southamerica-east1
# Usa la misma red que los collectors, así que con ip_fija_habilitada prueba también la IP fija.

resource "google_cloud_run_v2_job" "probar_acceso" {
  name                = "radar-probar-acceso"
  location            = var.region
  deletion_protection = false
  labels              = merge(local.labels, { componente = "probar-acceso" })

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.collectors.email
      timeout         = "1800s"
      max_retries     = 0

      containers {
        image   = var.imagen
        command = ["python", "-m", "radar.cli"]
        args    = ["probar-acceso"]

        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi"
          }
        }

        dynamic "env" {
          for_each = merge(local.env_comun, { RADAR_SA_EMAIL = google_service_account.collectors.email })
          content {
            name  = env.key
            value = env.value
          }
        }
      }

      dynamic "vpc_access" {
        for_each = var.ip_fija_habilitada ? [1] : []
        content {
          egress = "ALL_TRAFFIC"
          network_interfaces {
            network    = google_compute_network.radar[0].id
            subnetwork = google_compute_subnetwork.radar[0].id
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_service.apis]
}
