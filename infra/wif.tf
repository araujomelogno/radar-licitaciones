# Workload Identity Federation para GitHub Actions: el deploy no usa claves descargadas.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Identidades de GitHub Actions del repo ${var.github_repo}"

  depends_on = [google_project_service.apis]
}

locals {
  condicion_repo = "assertion.repository == \"${var.github_repo}\""
  condicion_refs = length(var.github_ref_prefijos) == 0 ? "" : format(
    " && (%s)",
    join(" || ", [for p in var.github_ref_prefijos : "assertion.ref.startsWith(\"${p}\")"])
  )
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
    "attribute.event_name" = "assertion.event_name"
  }

  # Solo este repositorio (y, si se configuran, solo esas refs) puede pedir credenciales.
  attribute_condition = "${local.condicion_repo}${local.condicion_refs}"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

locals {
  principal_repo = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.principal_repo
}

resource "google_service_account_iam_member" "eval_wif" {
  service_account_id = google_service_account.eval.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.principal_repo
}
