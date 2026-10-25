"""UNGM (ONU): listado público de avisos, buscado por país.

Solo entran filas con país beneficiario Uruguay o Paraguay. Se usa el mismo
pedido que hace la página pública del listado (sin login). Si los términos de
uso de UNGM no permiten la lectura automatizada (pregunta abierta), la fuente
pasa a carga manual desde el panel.
"""

from __future__ import annotations

from typing import Any

from ..http import Lector
from ..modelos import AvisoNormalizado
from ..normalizacion import pais_desde
from .base import Collector, absoluta, sopa, texto_de

BASE = "https://www.ungm.org"
BUSQUEDA = f"{BASE}/Public/Notice/Search"


class Ungm(Collector):
    fuente_id = "ungm"

    def fetch(self, lector: Lector) -> dict[str, Any]:
        paginas: dict[str, str] = {}
        for pais in ("Uruguay", "Paraguay"):
            cuerpo = {
                "PageIndex": 0,
                "PageSize": 100,
                "Title": "",
                "Description": pais,
                "Reference": "",
                "PublishedFrom": self.ctx.desde.strftime("%d-%b-%Y"),
                "PublishedTo": "",
                "DeadlineFrom": self.ctx.ahora.strftime("%d-%b-%Y"),
                "DeadlineTo": "",
                "Countries": [],
                "Agencies": [],
                "UNSPSCs": [],
                "NoticeTypes": [],
                "SortField": "DatePublished",
                "SortAscending": False,
                "isPicker": False,
                "NoticeTASStatus": [],
                "IsSustainable": False,
            }
            r = lector.post(BUSQUEDA, json=cuerpo, headers={"X-Requested-With": "XMLHttpRequest"})
            paginas[pais] = r.texto
        return {"paginas": paginas}

    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        avisos: dict[str, AvisoNormalizado] = {}
        for html in crudo.get("paginas", {}).values():
            for fila in sopa(html).select("[data-noticeid]"):
                celdas = [texto_de(c) for c in fila.select(".tableCell, td")]
                if len(celdas) < 7:
                    continue
                titulo, cierre, publicado, agencia, tipo, referencia, paises = celdas[:7]
                pais = pais_desde(paises)
                if not pais:
                    continue  # solo país beneficiario Uruguay o Paraguay
                enlace = fila.find("a", href=True)
                n = fila["data-noticeid"]
                aviso = self.aviso(
                    id_oficial=str(n),
                    titulo=f"{tipo} · {titulo}" if tipo else titulo,
                    organismo=agencia,
                    pais=pais,
                    url=absoluta(BASE, enlace["href"] if enlace else f"/Public/Notice/{n}"),
                    crudo_ref=crudo_ref,
                    texto=f"{titulo}\nAgencia: {agencia}\nPaís beneficiario: {paises}\nReferencia: {referencia}",
                    publicado=publicado,
                    cierre=cierre,
                    tipo="expresion_interes" if "interest" in tipo.lower() or "interés" in tipo.lower() else None,
                    financiador="ONU",
                    referencias=[referencia],
                )
                avisos[aviso.docId] = aviso
        return list(avisos.values())
