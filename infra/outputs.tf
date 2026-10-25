output "bucket" {
  description = "Bucket de crudos, normalizados y exports (RADAR_BUCKET)."
  value       = google_storage_bucket.radar.name
}

output "imagen_base" {
  description = "Ruta de la imagen del pipeline en Artifact Registry (sin tag)."
  value       = local.imagen_base
}

output "workflow" {
  description = "Nombre completo del workflow de la corrida (para lanzarCorrida)."
  value       = google_workflows_workflow.corrida.id
}

output "cuentas_de_servicio" {
  description = "Cuentas de servicio por componente."
  value = {
    collectors = google_service_account.collectors.email
    control    = google_service_account.control.email
    workflow   = google_service_account.workflow.email
    scheduler  = google_service_account.scheduler.email
    functions  = google_service_account.functions.email
    deployer   = google_service_account.deployer.email
    eval       = google_service_account.eval.email
  }
}

output "control_client_id" {
  description = "Client ID de radar-control: es el que se autoriza en Google Workspace para la delegación de dominio con el scope gmail.send."
  value       = google_service_account.control.unique_id
}

output "wif_provider" {
  description = "Valor para la variable GCP_WIF_PROVIDER del entorno de GitHub."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "ip_salida" {
  description = "IP fija de salida de los collectors (solo con ip_fija_habilitada = true)."
  value       = var.ip_fija_habilitada ? google_compute_address.salida[0].address : null
}
