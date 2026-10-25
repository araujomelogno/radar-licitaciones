"""FIAP (ex FIIAPP): página de ofertas de fiap.gob.es.

Solo ofertas vigentes con trabajo en Uruguay o Paraguay: la oferta tiene que
nombrar a alguno de los dos países (regla geográfica estricta).
"""

from __future__ import annotations

import re
from typing import Any

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import moneda_iso, numero, paises_mencionados, plano
from .base import Collector, fecha_tras, items_listado, sopa, texto_de

_DETALLE = re.compile(r"/ofertas?/[^/?#]+", re.I)


class Fiap(Collector):
    fuente_id = "fiap"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        listado = lector.get(self.url_base)
        detalles: dict[str, str] = {}
        for item in items_listado(listado.texto, listado.url, _DETALLE):
            if _cerrada(item["texto"]):
                continue
            try:
                detalles[item["url"]] = lector.get(item["url"]).texto
            except ErrorFuente:
                detalles[item["url"]] = ""
        return {"listado": {"url": listado.url, "html": listado.texto}, "detalles": detalles}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        listado = crudo.get("listado") or {}
        avisos = []
        for item in items_listado(listado.get("html", ""), listado.get("url", self.url_base), _DETALLE):
            html = crudo.get("detalles", {}).get(item["url"])
            if html is None or _cerrada(item["texto"]):
                continue
            doc = sopa(html) if html else None
            texto = texto_de((doc.find("main") or doc.body) if doc else None) or item["texto"]
            paises = [p for p in paises_mencionados(item["titulo"], texto) if p in ("Uruguay", "Paraguay")]
            if not paises:
                continue
            m_monto = re.search(r"(?:presupuesto|importe)[^\d]{0,40}([\d.,]{4,})\s*(€|eur|euros)?", texto, re.I)
            avisos.append(self.aviso(
                id_oficial=item["url"].rstrip("/").rsplit("/", 1)[-1],
                titulo=item["titulo"],
                organismo="FIAP · Fundación Internacional y para Iberoamérica de Administración y Políticas Públicas",
                pais=paises[0],
                url=item["url"],
                crudo_ref=crudo_ref,
                texto=texto,
                publicado=fecha_tras(("publicación", "publicacion", "fecha de publicación"), texto),
                cierre=fecha_tras(("fecha límite", "fecha limite", "plazo de presentación", "plazo de presentacion",
                                   "cierre"), texto),
                monto=numero(m_monto.group(1)) if m_monto else None,
                moneda=moneda_iso("EUR") if m_monto else None,
                financiador="UE" if "union europea" in plano(texto) or "eurosocial" in plano(texto) else "FIAP",
            ))
        return avisos


def _cerrada(texto: str) -> bool:
    p = plano(texto)
    return any(k in p for k in ("cerrada", "cerrado", "finalizada", "adjudicada", "resuelta"))
