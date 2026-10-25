"""Ajustes del proceso, leídos de variables de entorno.

Los secretos (por ejemplo el token de la DNCP) llegan como variables de entorno
montadas desde Secret Manager por Cloud Run; nunca están en el código.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Ajustes:
    proyecto: str
    entorno: str
    bucket: str
    org_id: str
    vertex_location: str
    sa_email: str
    firestore_database: str
    dncp_token: str
    user_agent: str
    datos_locales: str

    @property
    def es_local(self) -> bool:
        """Sin bucket configurado se escribe en disco (tests y desarrollo)."""
        return not self.bucket


@lru_cache(maxsize=1)
def ajustes() -> Ajustes:
    return Ajustes(
        proyecto=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
        entorno=os.getenv("RADAR_ENV", "dev"),
        bucket=os.getenv("RADAR_BUCKET", ""),
        org_id=os.getenv("RADAR_ORG_ID", "equipos"),
        vertex_location=os.getenv("VERTEX_LOCATION", "global"),
        sa_email=os.getenv("RADAR_SA_EMAIL", ""),
        firestore_database=os.getenv("FIRESTORE_DATABASE", "(default)"),
        dncp_token=os.getenv("DNCP_API_TOKEN", ""),
        user_agent=os.getenv(
            "RADAR_USER_AGENT",
            "RadarEquipos/1.0 (+https://www.equipos.com.uy; radar@equipos.com.uy)",
        ),
        datos_locales=os.getenv("RADAR_DATOS_LOCALES", ".datos"),
    )
