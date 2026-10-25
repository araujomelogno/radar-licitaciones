# Ejemplo: copiá y ajustá los valores reales del proyecto de staging.
project_id = "equipos-radar-staging"
entorno    = "staging"

# Si Firebase ya creó la base Firestore, ponelo en false e importala o dejala fuera de Terraform.
gestionar_firestore = true
habilitar_firebase  = true

emails_alertas = [
  "admin@equipos.com.uy",
]

# Cuenta de facturación para la alerta de presupuesto (vacío = sin alerta en staging).
billing_account = ""
presupuesto_usd = 40

# Plan B de RF-13: activalo solo si la prueba de la semana 1 muestra bloqueos.
ip_fija_habilitada = false

# En staging cualquier ref del repo puede desplegar o correr la evaluación (incluye PRs).
github_ref_prefijos = []

# Cuentas de Workspace del agente local (solo si hace falta, ver docs/despliegue.md).
agente_local_cuentas = []
