"""CND: “otros llamados” y llamados a ofertas en línea (llamados.cnd.org.uy).

Solo llamados abiertos. El `docId` sale del número del llamado, igual que en el
radar actual: `cnd-llamado-13-2026`.
"""

from __future__ import annotations

import re
from typing import Any

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import plano, slug
from .base import Collector, fecha_tras, items_listado, sopa, texto_de

_DETALLE = re.compile(r"/(llamado|llamados|convocatoria|oferta)s?/[^/?#]+", re.I)
_NUMERO = re.compile(r"(llamado|licitaci[oó]n|compra|concurso)[^\d]{0,15}(\d{1,4})\s*/\s*(\d{4})", re.I)


class Cnd(Collector):
    fuente_id = "cnd"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        listado = lector.get(self.url_base)
        detalles: dict[str, str] = {}
        for item in items_listado(listado.texto, listado.url, _DETALLE):
            if _cerrado(item["texto"]):
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
            if item["url"] not in crudo.get("detalles", {}) or _cerrado(item["texto"]):
                continue
            html = crudo["detalles"][item["url"]]
            texto = texto_de(sopa(html).find("main") or sopa(html).body) if html else item["texto"]
            completo = f"{item['titulo']} {item['texto']} {texto}"
            m = _NUMERO.search(completo)
            id_oficial = slug(f"llamado {m.group(2)} {m.group(3)}") if m else None
            avisos.append(self.aviso(
                id_oficial=id_oficial,
                titulo=item["titulo"],
                organismo="Corporación Nacional para el Desarrollo",
                pais="Uruguay",
                url=item["url"],
                crudo_ref=crudo_ref,
                texto=texto,
                publicado=fecha_tras(("publicado", "publicación", "fecha de publicacion"), completo),
                cierre=fecha_tras(("cierre", "recepción de propuestas", "recepcion de propuestas",
                                   "fecha límite", "fecha limite", "apertura"), completo),
                referencias=[f"{m.group(2)}/{m.group(3)}"] if m else [],
            ))
        return avisos


def _cerrado(texto: str) -> bool:
    p = plano(texto)
    return any(k in p for k in ("cerrado", "finalizado", "adjudicado", "desierto"))
