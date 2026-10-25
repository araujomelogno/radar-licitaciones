"""Intendencia de Montevideo: cartelera SIAB de compras vigentes.

La IM no publica en Compras Estatales. Se lee la vista de compras vigentes y el
detalle de cada compra (páginas en windows-1252), filtrando por rubro. El
organismo lleva el departamento o servicio que compra.

La URL de la vista y los rubros aceptados se configuran en `fuentes/im`
(`url`, `rubros`). Los selectores se validan contra la página real en la
semana 1 (prueba de acceso).
"""

from __future__ import annotations

import re
from typing import Any

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import moneda_iso, numero, plano
from .base import Collector, absoluta, fecha_tras, sopa, texto_de

ENCODING = "windows-1252"
_ID = re.compile(r"\b([A-Z]{1,3}\d{5,7})\b")
RUBROS_POR_DEFECTO = ("servicio", "consultor", "estudio", "investigacion", "encuesta", "evaluacion")


class IntendenciaMontevideo(Collector):
    fuente_id = "im"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        listado = lector.get(self.url_base, encoding=ENCODING)
        filas = self._filas(listado.texto, listado.url)
        detalles: dict[str, str] = {}
        for fila in filas:
            if not self._rubro_aceptado(fila["rubro"] + " " + fila["objeto"]):
                continue
            try:
                detalles[fila["id"]] = lector.get(fila["url"], encoding=ENCODING).texto
            except ErrorFuente:
                detalles[fila["id"]] = ""
        return {"listado": {"url": listado.url, "html": listado.texto}, "detalles": detalles}

    def _rubro_aceptado(self, texto: str) -> bool:
        rubros = self.ctx.config.get("rubros") or RUBROS_POR_DEFECTO
        p = plano(texto)
        return any(plano(r) in p for r in rubros)

    def _filas(self, html: str, base: str) -> list[dict[str, str]]:
        doc = sopa(html)
        filas = []
        for tr in doc.select("table tr"):
            celdas = tr.find_all("td")
            enlace = tr.find("a", href=True)
            if len(celdas) < 3 or not enlace:
                continue
            textos = [texto_de(c) for c in celdas]
            m = _ID.search(" ".join(textos)) or _ID.search(enlace["href"])
            if not m:
                continue
            filas.append({
                "id": m.group(1),
                "url": absoluta(base, enlace["href"]),
                "numero": textos[0],
                "objeto": textos[1] if len(textos) > 1 else "",
                "rubro": textos[2] if len(textos) > 2 else "",
                "apertura": textos[3] if len(textos) > 3 else "",
                "fila": " | ".join(textos),
            })
        return filas

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        listado = crudo.get("listado") or {}
        avisos = []
        for fila in self._filas(listado.get("html", ""), listado.get("url", self.url_base)):
            if fila["id"] not in crudo.get("detalles", {}):
                continue
            detalle_html = crudo["detalles"][fila["id"]]
            detalle = sopa(detalle_html) if detalle_html else None
            texto = texto_de(detalle.body if detalle and detalle.body else detalle) if detalle else fila["fila"]
            dependencia = ""
            if detalle:
                for linea in detalle.get_text("\n").splitlines():
                    m = re.match(r"\s*(?:Departamento|Divisi[oó]n|Servicio|Unidad)\s*:\s*(.{3,80})", linea)
                    if m:
                        dependencia = m.group(1).strip(" .-")
                        break
            organismo = "Intendencia de Montevideo" + (f" — {dependencia}" if dependencia else "")
            cierre = fecha_tras(("apertura", "recepción de ofertas", "recepcion de ofertas", "cierre"), texto) or fila["apertura"]
            m_monto = re.search(r"(?:monto|presupuesto)[^\d$]{0,30}(U\$S|USD|\$)?\s*([\d.,]{4,})", texto, re.I)
            avisos.append(self.aviso(
                id_oficial=fila["id"],
                titulo=f"{fila['numero']} · {fila['objeto']}" if fila["numero"] != fila["id"] else fila["objeto"],
                organismo=organismo,
                pais="Uruguay",
                url=fila["url"],
                crudo_ref=crudo_ref,
                texto=texto,
                cierre=cierre,
                monto=numero(m_monto.group(2)) if m_monto else None,
                moneda=(moneda_iso("USD") if m_monto and m_monto.group(1) in ("U$S", "USD") else "UYU") if m_monto else None,
                referencias=[fila["numero"]],
            ))
        return avisos
