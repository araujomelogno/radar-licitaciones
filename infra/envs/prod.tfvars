# Ejemplo: copiá y ajustá los valores reales del proyecto de producción.
project_id = "equipos-radar-prod"
entorno    = "prod"

gestionar_firestore = true
habilitar_firebase  = true

emails_alertas = [
  "admin@equipos.com.uy",
]

billing_account = "XXXXXX-XXXXXX-XXXXXX"
presupuesto_usd = 40

ip_fija_habilitada = false

# En producción solo main y los tags v* pueden pedir credenciales del deployer.
github_ref_prefijos = ["refs/heads/main", "refs/tags/v"]

# Cuentas de Workspace del agente local (solo si hace falta, ver docs/despliegue.md).
agente_local_cuentas = []
