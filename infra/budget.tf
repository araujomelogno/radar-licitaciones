# Alerta de presupuesto en Cloud Billing por US$ 40/mes (RF-12).
# Quien corre terraform necesita roles/billing.costsManager en la cuenta de facturación.

resource "google_billing_budget" "radar" {
  count = var.billing_account == "" ? 0 : 1

  billing_account = var.billing_account
  display_name    = "Radar de licitaciones · ${var.entorno}"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.presupuesto_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    # Cloud Billing acepta hasta 5 canales.
    monitoring_notification_channels = slice(local.canales_alerta, 0, min(5, length(local.canales_alerta)))
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.apis]
}
