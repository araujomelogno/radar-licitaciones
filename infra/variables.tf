variable "project_id" {
  description = "ID del proyecto GCP del entorno (uno por entorno: staging y prod)."
  type        = string
}

variable "entorno" {
  description = "Nombre del entorno. Se pasa al pipeline como RADAR_ENV."
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.entorno)
    error_message = "entorno debe ser staging o prod."
  }
}

variable "region" {
  description = "Región de Cloud Run, Workflows, Firestore y el bucket."
  type        = string
  default     = "southamerica-east1"
}

variable "zona_horaria" {
  description = "Zona horaria de los schedulers."
  type        = string
  default     = "America/Montevideo"
}

variable "horario_corrida" {
  description = "Cron de la corrida diaria (en zona_horaria)."
  type        = string
  default     = "0 6 * * *"
}

variable "horario_verificacion" {
  description = "Cron del chequeo de 'sin corrida exitosa en 26 horas'."
  type        = string
  default     = "30 8 * * *"
}

variable "horario_export" {
  description = "Cron del export semanal de Firestore a Cloud Storage."
  type        = string
  default     = "0 3 * * 0"
}

variable "imagen" {
  description = <<-EOT
    Imagen inicial de los Cloud Run Jobs. Terraform solo la usa al crear los jobs:
    el deploy de GitHub Actions la actualiza al digest nuevo y Terraform ignora ese cambio.
    Por defecto es una imagen pública de ejemplo para poder crear los jobs antes del primer build.
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job:latest"
}

variable "fuentes" {
  description = "IDs de las fuentes con collector propio (un Cloud Run Job por fuente)."
  type        = list(string)
  default     = ["arce", "im", "dncp", "bm", "bid", "ungm", "cnd", "auci", "fiap", "ceibal"]
}

variable "gestionar_firestore" {
  description = "Crear la base Firestore (default) desde Terraform. Ponelo en false si ya la creó Firebase."
  type        = bool
  default     = true
}

variable "habilitar_firebase" {
  description = "Habilitar Firebase en el proyecto desde Terraform (google_firebase_project)."
  type        = bool
  default     = true
}

variable "emails_alertas" {
  description = "Correos de los admins que reciben las alertas de Cloud Monitoring y del presupuesto."
  type        = list(string)
  default     = []
}

variable "billing_account" {
  description = "ID de la cuenta de facturación (XXXXXX-XXXXXX-XXXXXX) para la alerta de presupuesto. Vacío = sin alerta."
  type        = string
  default     = ""
}

variable "presupuesto_usd" {
  description = "Monto mensual de la alerta de presupuesto, en USD."
  type        = number
  default     = 40
}

variable "ip_fija_habilitada" {
  description = "Sacar el tráfico de los collectors por Cloud NAT con una IP fija (plan B de RF-13, ~US$ 4-5/mes)."
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "Repositorio de GitHub autorizado a desplegar por Workload Identity Federation."
  type        = string
  default     = "araujomelogno/radar-licitaciones"
}

variable "github_ref_prefijos" {
  description = <<-EOT
    Prefijos de ref de git que pueden pedir credenciales por WIF (vacío = cualquier ref del repo).
    En prod conviene limitarlo, por ejemplo a ["refs/heads/main", "refs/tags/v"].
  EOT
  type        = list(string)
  default     = []
}

variable "agente_local_cuentas" {
  description = <<-EOT
    Cuentas de Google Workspace (por ejemplo "user:radar-agente@equipos.com.uy") que el agente local
    de la oficina usa para impersonar a radar-collectors sin claves descargadas (plan B de RF-13).
  EOT
  type        = list(string)
  default     = []
}
