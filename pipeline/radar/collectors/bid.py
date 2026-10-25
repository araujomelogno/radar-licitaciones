"""BID: avisos de proyectos del datastore de data.iadb.org (API CKAN `datastore_search`).

Lo que llega por BEO se carga a mano. Si el dataset trae país, tipo de aviso y
cierre como campos es una pregunta abierta de la semana 1, así que los nombres
de campo se buscan entre varios candidatos y el `resource_id` se configura en
`fuentes/bid.resourceId`.
"""

from __future__ import annotations

from typing import Any

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import moneda_iso, numero, pais_desde, parse_fecha, plano
from .base import Collector

API = "https://data.iadb.org/api/3/action/datastore_search"

CAMPOS = {
    "id": ("notice_id", "id", "_id", "procurement_id"),
    "titulo": ("notice_title", "title", "titulo", "description", "procurement_description"),
    "pais": ("country", "country_name", "pais", "project_country"),
    "tipo": ("notice_type", "type", "tipo_aviso", "procurement_type"),
    "publicado": ("publication_date", "published_date", "notice_date", "fecha_publicacion"),
    "cierre": ("deadline", "deadline_date", "closing_date", "fecha_cierre", "submission_deadline"),
    "proyecto": ("project_number", "project_id", "operation_number"),
    "organismo": ("executing_agency", "agency", "borrower", "organismo"),
    "url": ("url", "notice_url", "link", "document_url"),
    "monto": ("amount", "estimated_amount", "monto"),
    "moneda": ("currency", "moneda"),
}


def _campo(fila: dict[str, Any], clave: str) -> Any:
    for c in CAMPOS[clave]:
        if fila.get(c) not in (None, ""):
            return fila[c]
    return None


class Bid(Collector):
    fuente_id = "bid"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        resource_id = self.ctx.config.get("resourceId")
        if not resource_id:
            raise ErrorFuente("falta configurar fuentes/bid.resourceId (dataset de avisos del BID)")
        url = self.ctx.config.get("url") or API
        respuestas = {}
        for pais in ("Uruguay", "Paraguay"):
            r = lector.get(url, params={"resource_id": resource_id, "q": pais, "limit": 500,
                                        "sort": "_id desc"})
            datos = r.json()
            if not datos.get("success", True):
                raise ErrorFuente(f"data.iadb.org respondió error: {datos.get('error')}")
            respuestas[pais] = datos
        return {"respuestas": respuestas}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos: dict[str, AvisoNormalizado] = {}
        for datos in crudo.get("respuestas", {}).values():
            for fila in (datos.get("result") or {}).get("records") or []:
                pais = pais_desde(str(_campo(fila, "pais") or ""))
                if not pais:
                    continue
                publicado = parse_fecha(_campo(fila, "publicado"), pais, dayfirst=False)
                if not self.en_ventana(publicado):
                    continue
                tipo_txt = str(_campo(fila, "tipo") or "")
                proyecto = str(_campo(fila, "proyecto") or "")
                id_aviso = str(_campo(fila, "id") or "")
                titulo = " · ".join(x for x in (tipo_txt, str(_campo(fila, "titulo") or "")) if x)
                aviso = self.aviso(
                    id_oficial=id_aviso,
                    titulo=titulo,
                    organismo=str(_campo(fila, "organismo") or f"Proyecto BID {proyecto}"),
                    pais=pais,
                    url=str(_campo(fila, "url") or f"https://www.iadb.org/es/project/{proyecto}"),
                    crudo_ref=crudo_ref,
                    texto=" \n".join(f"{k}: {v}" for k, v in fila.items() if isinstance(v, str) and len(v) > 2),
                    publicado=publicado,
                    cierre=parse_fecha(_campo(fila, "cierre"), pais, cierre=True, dayfirst=False),
                    tipo="expresion_interes" if "interes" in plano(tipo_txt) or "interest" in plano(tipo_txt) else None,
                    monto=numero(_campo(fila, "monto")),
                    moneda=moneda_iso(str(_campo(fila, "moneda") or "")),
                    financiador="BID",
                    referencias=[proyecto],
                )
                avisos[aviso.docId] = aviso
        return list(avisos.values())
