"""DNCP Paraguay: API v3 de datos abiertos (OCDS).

Convocatorias abiertas de los últimos N días, con monto (en guaraníes),
procedimiento y financiamiento. Si la API pide token (pregunta abierta de la
semana 1), se usa `DNCP_API_TOKEN` de Secret Manager.
"""

from __future__ import annotations

import re
from typing import Any

from ..http import Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import moneda_iso, numero, plano
from .base import Collector

BASE = "https://www.contrataciones.gov.py"
POR_PAGINA = 100
MAX_PAGINAS = 20


class Dncp(Collector):
    fuente_id = "dncp"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        base = (self.ctx.config.get("url") or f"{BASE}/datos/api/v3/doc").rstrip("/")
        headers = {"Accept": "application/json"}
        if self.ctx.dncp_token:
            headers["Authorization"] = f"Bearer {self.ctx.dncp_token}"
        paginas = []
        for pagina in range(1, MAX_PAGINAS + 1):
            r = lector.get(
                f"{base}/search/processes",
                params={
                    "fecha_desde": self.ctx.desde.date().isoformat(),
                    "fecha_hasta": self.ctx.ahora.date().isoformat(),
                    "tipo_fecha": "publicacion_llamado",
                    "etapa": "convocatoria",
                    "page": pagina,
                    "items_per_page": POR_PAGINA,
                },
                headers=headers,
            )
            datos = r.json()
            paginas.append(datos)
            registros = datos.get("records") or datos.get("results") or []
            total_paginas = (datos.get("pagination") or {}).get("total_pages") or 1
            if not registros or pagina >= total_paginas:
                break
        return {"paginas": paginas}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos: dict[str, AvisoNormalizado] = {}
        for datos in crudo.get("paginas", []):
            for registro in datos.get("records") or datos.get("results") or []:
                rel = registro.get("compiledRelease") or registro.get("release") or registro
                aviso = self._release(rel, crudo_ref)
                if aviso:
                    avisos[aviso.docId] = aviso
        return list(avisos.values())

    def _release(self, rel: dict[str, Any], crudo_ref: str) -> AvisoNormalizado | None:
        tender = rel.get("tender") or {}
        if not tender:
            return None
        estado = plano(tender.get("status") or "active")
        if estado in ("cancelled", "unsuccessful", "complete"):
            return None
        id_llamado = str(tender.get("id") or rel.get("ocid", "").rsplit("-", 1)[-1])
        comprador = (rel.get("buyer") or {}).get("name") or (tender.get("procuringEntity") or {}).get("name", "")
        procedimiento = tender.get("procurementMethodDetails") or ""
        titulo = " · ".join(x for x in (f"{procedimiento} {id_llamado}".strip(), tender.get("title") or "") if x)
        valor = tender.get("value") or {}
        financiador = self._financiador(rel)
        criterios = f"{tender.get('eligibilityCriteria') or ''} {tender.get('description') or ''}"
        return self.aviso(
            id_oficial=id_llamado,
            titulo=titulo,
            organismo=comprador,
            pais="Paraguay",
            url=f"{BASE}/licitaciones/convocatoria/{id_llamado}.html",
            crudo_ref=crudo_ref,
            texto=f"{tender.get('description') or ''}\n"
            + " · ".join(i.get("description", "") for i in tender.get("items") or [])
            + f"\nFinanciamiento: {financiador or 'no informado'}",
            publicado=(tender.get("tenderPeriod") or {}).get("startDate") or rel.get("date"),
            cierre=(tender.get("tenderPeriod") or {}).get("endDate"),
            monto=numero(valor.get("amount")),
            moneda=moneda_iso(valor.get("currency")) or "PYG",
            financiador=financiador,
            admite_extranjeras=_admite_extranjeras(criterios),
            referencias=[rel.get("ocid", ""), (rel.get("planning") or {}).get("identifier", "")],
        )

    @staticmethod
    def _financiador(rel: dict[str, Any]) -> str | None:
        fuentes = []
        for b in ((rel.get("planning") or {}).get("budget") or {}).get("budgetBreakdown") or []:
            nombre = (b.get("sourceParty") or {}).get("name") or b.get("description")
            if nombre:
                fuentes.append(nombre)
        texto = " ".join(fuentes)
        for siglas, nombre in (("BID", "BID"), ("Interamericano", "BID"), ("BIRF", "Banco Mundial"),
                               ("Banco Mundial", "Banco Mundial"), ("CAF", "CAF"), ("FONPLATA", "FONPLATA"),
                               ("Unión Europea", "UE")):
            if siglas.lower() in texto.lower():
                return nombre
        return fuentes[0] if fuentes else None


def _admite_extranjeras(texto: str) -> bool | None:
    p = plano(texto)
    if not p:
        return None
    if re.search(r"no (se )?(admite|aceptan?|permite)n? (firmas|empresas|oferentes)? ?extranjer", p):
        return False
    if re.search(r"(firmas|empresas|oferentes) extranjer", p) or "consorcio internacional" in p:
        return True
    return None
