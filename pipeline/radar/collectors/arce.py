"""Compras Estatales (ARCE): RSS OCDS mensual y detalle por release.

- RSS: `/ocds/rss/AAAA/MM` (se leen el mes actual y el anterior si la ventana lo cruza).
- Detalle: `/ocds/release/{id}` (paquete OCDS). Solo entran releases de llamado
  (`tender`, `tenderUpdate`, `tenderAmendment`); las adjudicaciones son de la fase 2.
- Incluye 18 intendencias y UTEC; las compras de UTEC quedan con UTEC como fuente propia.
"""

from __future__ import annotations

import re
from typing import Any

import feedparser

from ..http import ErrorFuente, Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import moneda_iso, numero, parse_fecha
from .base import Collector

BASE = "https://www.comprasestatales.gub.uy"
TAGS_LLAMADO = {"tender", "tenderUpdate", "tenderAmendment", "planning"}
_UTEC = re.compile(r"\bUTEC\b|universidad tecnol[oó]gica", re.I)
_ID_RELEASE = re.compile(r"/ocds/release/([^/?#]+)")


class Arce(Collector):
    fuente_id = "arce"

    def _meses(self) -> list[tuple[int, int]]:
        meses = []
        for f in (self.ctx.desde, self.ctx.ahora):
            par = (f.year, f.month)
            if par not in meses:
                meses.append(par)
        return meses

    def fetch(self, lector: Lector) -> dict[str, Any]:
        base = (self.ctx.config.get("url") or BASE).rstrip("/")
        base = base.split("/ocds")[0]
        rss: dict[str, str] = {}
        for anio, mes in self._meses():
            url = f"{base}/ocds/rss/{anio}/{mes:02d}"
            rss[url] = lector.get(url).texto
        releases: dict[str, Any] = {}
        errores: list[str] = []
        for xml in rss.values():
            for item in feedparser.parse(xml).entries:
                publicado = parse_fecha(item.get("published") or item.get("updated"), "Uruguay")
                if not self.en_ventana(publicado):
                    continue
                m = _ID_RELEASE.search(item.get("link", ""))
                if not m or m.group(1) in releases:
                    continue
                try:
                    releases[m.group(1)] = lector.get(f"{base}/ocds/release/{m.group(1)}").json()
                except (ErrorFuente, ValueError) as e:
                    errores.append(f"{m.group(1)}: {e}")
        if rss and not releases and errores:
            raise ErrorFuente(f"no se pudo leer ningún release de ARCE ({errores[0]})")
        return {"rss": rss, "releases": releases, "errores": errores}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos: dict[str, AvisoNormalizado] = {}
        for rel_id, paquete in crudo.get("releases", {}).items():
            for rel in paquete.get("releases", [paquete]) if isinstance(paquete, dict) else []:
                aviso = self._release(rel, rel_id, crudo_ref)
                if aviso:
                    avisos[aviso.docId] = aviso  # el último release del llamado gana (prórrogas)
        return list(avisos.values())

    def _release(self, rel: dict[str, Any], rel_id: str, crudo_ref: str) -> AvisoNormalizado | None:
        tags = set(rel.get("tag") or [])
        if tags and not tags & TAGS_LLAMADO:
            return None
        tender = rel.get("tender") or {}
        if not tender:
            return None
        id_llamado = str(tender.get("id") or rel.get("ocid", "").rsplit("-", 1)[-1] or rel_id)
        comprador = (rel.get("buyer") or {}).get("name") or ""
        if not comprador:
            for p in rel.get("parties") or []:
                if "buyer" in (p.get("roles") or []):
                    comprador = p.get("name", "")
        # En ARCE el título trae el tipo y número (“Licitación Abreviada 45/2026”) y la
        # descripción, el objeto. El título del radar es “tipo y número · objeto”.
        cabecera = (tender.get("title") or tender.get("procurementMethodDetails") or "").strip()
        objeto = (tender.get("description") or "").strip()
        titulo = f"{cabecera} · {objeto}" if cabecera and objeto and objeto != cabecera else cabecera or objeto
        m_num = re.search(r"\d+/\d{4}", cabecera)
        numero_llamado = m_num.group(0) if m_num else ""
        items = " · ".join(i.get("description", "") for i in tender.get("items") or [] if i.get("description"))
        valor = tender.get("value") or {}
        periodo = tender.get("tenderPeriod") or {}
        docs = tender.get("documents") or []
        url = next((d.get("url") for d in docs if d.get("url")), None) or (
            f"{BASE}/consultas/detalle/id/{id_llamado}"
        )
        es_utec = bool(_UTEC.search(comprador))
        return self.aviso(
            id_oficial=id_llamado,
            titulo=titulo,
            organismo=comprador,
            pais="Uruguay",
            url=url,
            crudo_ref=crudo_ref,
            texto=f"{objeto}\n{items}\n{tender.get('eligibilityCriteria') or ''}",
            publicado=rel.get("date") or periodo.get("startDate"),
            cierre=periodo.get("endDate"),
            monto=numero(valor.get("amount")),
            moneda=moneda_iso(valor.get("currency")),
            fuente="UTEC" if es_utec else None,
            referencias=[numero_llamado or "", rel.get("ocid", "")],
        )
