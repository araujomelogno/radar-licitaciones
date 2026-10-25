# Plan B de RF-13: IP fija de salida para los collectors con Cloud NAT.
# Solo se crea con ip_fija_habilitada = true (~US$ 4-5/mes). Los jobs salen por
# Direct VPC egress con todo el tráfico, así que la fuente ve siempre la misma IP.

resource "google_compute_network" "radar" {
  count                   = var.ip_fija_habilitada ? 1 : 0
  name                    = "radar-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "radar" {
  count                    = var.ip_fija_habilitada ? 1 : 0
  name                     = "radar-collectors"
  region                   = var.region
  network                  = google_compute_network.radar[0].id
  ip_cidr_range            = "10.10.0.0/26"
  private_ip_google_access = true
}

resource "google_compute_router" "radar" {
  count   = var.ip_fija_habilitada ? 1 : 0
  name    = "radar-router"
  region  = var.region
  network = google_compute_network.radar[0].id
}

resource "google_compute_address" "salida" {
  count        = var.ip_fija_habilitada ? 1 : 0
  name         = "radar-ip-salida"
  region       = var.region
  address_type = "EXTERNAL"
  labels       = local.labels
}

resource "google_compute_router_nat" "radar" {
  count                              = var.ip_fija_habilitada ? 1 : 0
  name                               = "radar-nat"
  region                             = var.region
  router                             = google_compute_router.radar[0].name
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [google_compute_address.salida[0].self_link]
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.radar[0].id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
