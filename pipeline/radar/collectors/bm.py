"""Banco Mundial: API JSON `procnotices` filtrada por país (`project_ctry_name_exact`).

Expresiones de interés e invitaciones a ofertar de los últimos N días, para
Uruguay y Paraguay.
"""

from __future__ import annotations

from typing import Any

from ..http import Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import parse_fecha, plano
from .base import Collector

API = "https://search.worldbank.org/api/v2/procnotices"
CAMPOS = (
    "id,bid_description,project_ctry_name,project_name,project_id,notice_type,notice_status,"
    "submission_deadline_date,submission_deadline_time,noticedate,procurement_method_name,"
    "contact_organization,bid_reference_no,notice_text,notice_lang_name"
)
TIPOS = ("expression of interest", "invitation for bids", "invitation for prequalification",
         "request for proposals", "invitation to bid")


class BancoMundial(Collector):
    fuente_id = "bm"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        url = self.ctx.config.get("url") or API
        respuestas = {}
        for pais in ("Uruguay", "Paraguay"):
            r = lector.get(url, params={
                "format": "json",
                "fl": CAMPOS,
                "project_ctry_name_exact": pais,
                "srt": "noticedate",
                "order": "desc",
                "rows": 100,
                "os": 0,
            })
            respuestas[pais] = r.json()
        return {"respuestas": respuestas}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos = []
        for pais, datos in crudo.get("respuestas", {}).items():
            notas = datos.get("procnotices") or []
            if isinstance(notas, dict):
                notas = list(notas.values())
            for n in notas:
                if not any(t in plano(n.get("notice_type", "")) for t in TIPOS):
                    continue
                publicado = parse_fecha(n.get("noticedate"), pais, dayfirst=False)
                if not self.en_ventana(publicado):
                    continue
                if plano(n.get("notice_status", "")) in ("cancelled", "canceled"):
                    continue
                cierre_txt = " ".join(x for x in (n.get("submission_deadline_date"), n.get("submission_deadline_time")) if x)
                id_bm = n.get("id", "")
                titulo = " · ".join(x for x in (n.get("notice_type"), n.get("bid_description") or n.get("project_name")) if x)
                idioma = {"english": "en", "spanish": "es", "portuguese": "pt"}.get(plano(n.get("notice_lang_name", "")))
                avisos.append(self.aviso(
                    id_oficial=id_bm,
                    titulo=titulo,
                    organismo=n.get("contact_organization") or f"Proyecto {n.get('project_id', '')}".strip(),
                    pais=pais,
                    url=f"https://projects.worldbank.org/en/projects-operations/procurement-detail/{id_bm}",
                    crudo_ref=crudo_ref,
                    texto=f"{n.get('project_name', '')}\n{n.get('notice_text', '')}",
                    publicado=publicado,
                    cierre=parse_fecha(cierre_txt, pais, cierre=True, dayfirst=False),
                    tipo="expresion_interes" if "interest" in plano(n.get("notice_type", "")) else None,
                    financiador="Banco Mundial",
                    idioma=idioma,
                    referencias=[n.get("project_id", ""), n.get("bid_reference_no", "")],
                ))
        return avisos
