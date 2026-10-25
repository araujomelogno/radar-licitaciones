"""AUCI: convocatorias de gub.uy. Solo las marcadas “Vigente”; se excluyen becas."""

from __future__ import annotations

import re
from typing import Any

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import plano
from .base import Collector, fecha_tras, items_listado, sopa, texto_de

_DETALLE = re.compile(r"/comunicacion/(convocatorias|publicaciones|noticias)/[^/?#]+", re.I)


def _vigente(texto: str) -> bool:
    p = plano(texto)
    return "vigente" in p and "no vigente" not in p


def _beca(texto: str) -> bool:
    return bool(re.search(r"\bbecas?\b|\bscholarship", plano(texto)))


class Auci(Collector):
    fuente_id = "auci"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        listado = lector.get(self.url_base)
        detalles: dict[str, str] = {}
        for item in items_listado(listado.texto, listado.url, _DETALLE):
            if not _vigente(item["texto"]) or _beca(item["titulo"]):
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
            if item["url"] not in crudo.get("detalles", {}):
                continue
            if not _vigente(item["texto"]) or _beca(item["titulo"]):
                continue
            html = crudo["detalles"][item["url"]]
            doc = sopa(html) if html else None
            texto = texto_de((doc.find("main") or doc.body) if doc else None) or item["texto"]
            avisos.append(self.aviso(
                id_oficial=item["url"].rstrip("/").rsplit("/", 1)[-1],
                titulo=item["titulo"],
                organismo="Agencia Uruguaya de Cooperación Internacional",
                pais="Uruguay",
                url=item["url"],
                crudo_ref=crudo_ref,
                texto=texto,
                publicado=fecha_tras(("publicado", "fecha de publicación", "fecha de publicacion"), texto),
                cierre=fecha_tras(("cierre", "plazo", "fecha límite", "fecha limite", "hasta el"), texto),
            ))
        return avisos
