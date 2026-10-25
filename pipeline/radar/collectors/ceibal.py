"""Ceibal: feed RSS de convocatorias abiertas (compras.ceibal.edu.uy).

Entran estudios, evaluaciones y consultorías; quedan afuera equipamiento,
cursos y libros.
"""

from __future__ import annotations

import re
from typing import Any

import feedparser

from ..http import Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import plano
from .base import Collector, fecha_tras

_FUERA = ("equipamiento", "equipos informaticos", "adquisicion de", "suministro", "curso", "cursos",
          "capacitacion docente", "libro", "libros", "licencias", "laptops", "tablets", "mobiliario")
_DENTRO = ("estudio", "evaluacion", "consultoria", "encuesta", "investigacion", "relevamiento",
           "linea de base", "diagnostico", "monitoreo")
_NUMERO = re.compile(r"(\d+)(?:/\d{4})?")


def _relevante(titulo: str, resumen: str) -> bool:
    p = plano(f"{titulo} {resumen}")
    pt = plano(titulo)
    if any(re.search(rf"\b{f}\b", pt) for f in _FUERA) and not any(d in pt for d in _DENTRO):
        return False
    return any(d in p for d in _DENTRO)


class Ceibal(Collector):
    fuente_id = "ceibal"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        r = lector.get(self.url_base)
        return {"feed": {"url": r.url, "xml": r.texto}}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos = []
        for e in feedparser.parse((crudo.get("feed") or {}).get("xml", "")).entries:
            titulo = e.get("title", "")
            resumen = e.get("summary", "") or e.get("description", "")
            if not _relevante(titulo, resumen):
                continue
            guid = e.get("id") or e.get("link", "")
            m = re.search(r"[?&](?:p|id)=(\d+)", guid) or re.search(r"/(\d+)/?$", guid) or _NUMERO.search(titulo)
            aviso = self.aviso(
                id_oficial=m.group(1) if m else None,
                titulo=titulo,
                organismo="Ceibal",
                pais="Uruguay",
                url=e.get("link", ""),
                crudo_ref=crudo_ref,
                texto=resumen,
                publicado=e.get("published") or e.get("updated"),
                cierre=fecha_tras(("cierre", "recepción de ofertas", "recepcion de ofertas", "apertura",
                                   "fecha límite", "fecha limite"), resumen),
            )
            if self.en_ventana(aviso.publicado) or aviso.cierre is None or aviso.cierre >= self.ctx.ahora:
                avisos.append(aviso)
        return avisos
