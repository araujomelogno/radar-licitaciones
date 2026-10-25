"""Interfaz común de los collectors: fetch → parse → AvisoNormalizado[] (RF-02).

Agregar una fuente en la fase 2 es agregar un módulo con una subclase de
`Collector` y registrarla en `collectors/__init__.py`.

`fetch` solo descarga y devuelve un dict serializable (el crudo). `parse` solo
transforma el crudo en avisos, sin red, así se puede reprocesar desde Cloud
Storage y testear con fixtures.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, Tag

from ..http import Lector
from ..modelos import FUENTES, AvisoNormalizado, Fuente
from ..normalizacion import (
    doc_id,
    limpiar_html,
    paises_mencionados,
    parse_fecha,
    recortar,
    tipo_desde,
)

TZ_UY = ZoneInfo("America/Montevideo")


@dataclass
class Contexto:
    """Lo que necesita un collector para correr."""

    ahora: datetime
    ventana_dias: int = 7
    config: dict[str, Any] = field(default_factory=dict)  # documento fuentes/{id}
    dncp_token: str = ""

    @property
    def desde(self) -> datetime:
        return self.ahora - timedelta(days=self.ventana_dias)


class Collector(ABC):
    fuente_id: str = ""

    def __init__(self, ctx: Contexto) -> None:
        self.ctx = ctx

    @property
    def fuente(self) -> Fuente:
        return FUENTES[self.fuente_id]

    @property
    def url_base(self) -> str:
        return self.ctx.config.get("url") or self.fuente.url

    @abstractmethod
    def fetch(self, lector: Lector) -> dict[str, Any]:
        """Descarga lo necesario y devuelve el crudo (serializable a JSON)."""

    @abstractmethod
    def parse(self, crudo: dict[str, Any], crudo_ref: str) -> list[AvisoNormalizado]:
        """Convierte el crudo en avisos normalizados. Sin acceso a la red."""

    # ── ayudas comunes ──

    def en_ventana(self, fecha: datetime | None) -> bool:
        """Sin fecha de publicación se acepta: la dedup evita duplicados."""
        return fecha is None or fecha >= self.ctx.desde

    def aviso(
        self,
        *,
        id_oficial: str | None,
        titulo: str,
        organismo: str,
        pais: str,
        url: str,
        crudo_ref: str,
        texto: str = "",
        publicado: Any = None,
        cierre: Any = None,
        tipo: str | None = None,
        monto: float | None = None,
        moneda: str | None = None,
        financiador: str | None = None,
        idioma: str | None = None,
        fuente: str | None = None,
        referencias: list[str] | None = None,
        admite_extranjeras: bool | None = None,
        prefijo: str | None = None,
    ) -> AvisoNormalizado:
        titulo = limpiar_html(titulo)
        texto_limpio, largo = recortar(limpiar_html(texto))
        pub = publicado if isinstance(publicado, datetime) or publicado is None else parse_fecha(publicado, pais)
        cie = cierre if isinstance(cierre, datetime) or cierre is None else parse_fecha(cierre, pais, cierre=True)
        if isinstance(pub, datetime) and pub.tzinfo is None:
            pub = parse_fecha(pub, pais)
        if isinstance(cie, datetime) and cie.tzinfo is None:
            cie = parse_fecha(cie, pais, cierre=True)
        return AvisoNormalizado(
            docId=doc_id(prefijo or self.fuente.prefijo, id_oficial, titulo),
            fuente=fuente or self.fuente.nombre,
            idOficial=id_oficial or None,
            titulo=titulo,
            organismo=limpiar_html(organismo) or self.fuente.nombre,
            pais=pais,  # type: ignore[arg-type]
            tipo=tipo or tipo_desde(f"{titulo} {texto_limpio[:400]}"),  # type: ignore[arg-type]
            url=url,
            publicado=pub,
            cierre=cie,
            monto=monto,
            moneda=moneda,  # type: ignore[arg-type]
            financiador=financiador,
            idioma=idioma or detectar_idioma(f"{titulo} {texto_limpio[:600]}"),  # type: ignore[arg-type]
            texto=texto_limpio,
            textoLargo=largo,
            crudoRef=crudo_ref,
            admiteExtranjeras=admite_extranjeras,
            referencias=[r for r in (referencias or []) if r],
            paisesMencionados=paises_mencionados(titulo, texto_limpio, organismo),
        )


_EN = re.compile(r"\b(the|and|of|for|services|consultant|consulting|survey|evaluation|request)\b", re.I)
_PT = re.compile(r"\b(serviços|avaliação|pesquisa|contratação|não|ção)\b", re.I)
_ES = re.compile(r"\b(el|la|los|las|de|para|servicios|consultoría|encuesta|evaluación|llamado)\b", re.I)


def detectar_idioma(texto: str) -> str:
    es, en, pt = len(_ES.findall(texto)), len(_EN.findall(texto)), len(_PT.findall(texto))
    if pt > es and pt > en:
        return "pt"
    return "en" if en > es else "es"


def sopa(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def texto_de(nodo: Tag | None) -> str:
    return limpiar_html(nodo.get_text(" ")) if nodo else ""


def absoluta(base: str, href: str | None) -> str:
    return urljoin(base, href or "")


_FECHA = re.compile(r"(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:\s+\d{1,2}:\d{2})?|\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)")


def fecha_tras(etiquetas: tuple[str, ...], texto: str) -> str | None:
    """Primera fecha que aparece después de alguna de las etiquetas (“Cierre:”, “Apertura”…)."""
    bajo = texto.lower()
    for e in etiquetas:
        i = bajo.find(e)
        if i >= 0:
            m = _FECHA.search(texto, i)
            if m and m.start() - i < 80:
                return m.group(1)
    return None


_CONTENEDORES = ("tr", "article", "li")
_CLASES_CONTENEDOR = ("views-row", "card", "item", "oferta", "llamado", "convocatoria", "noticia", "resultado")


def contenedor(enlace: Tag) -> Tag:
    """El bloque (fila, tarjeta, artículo) que contiene un enlace de un listado."""
    for padre in enlace.parents:
        if not isinstance(padre, Tag) or padre.name in ("body", "html"):
            break
        clases = " ".join(padre.get("class") or []).lower()
        if padre.name in _CONTENEDORES or any(c in clases for c in _CLASES_CONTENEDOR):
            return padre
    return enlace.parent if isinstance(enlace.parent, Tag) else enlace


def items_listado(html: str, base: str, patron_href: re.Pattern[str]) -> list[dict[str, str]]:
    """Enlaces de un listado cuyo href cumple el patrón, con el texto de su bloque."""
    vistos: set[str] = set()
    items = []
    for a in sopa(html).find_all("a", href=True):
        href = a["href"]
        if not patron_href.search(href):
            continue
        url = absoluta(base, href)
        if url in vistos:
            continue
        vistos.add(url)
        bloque = contenedor(a)
        titulo = texto_de(a) or texto_de(bloque.find(["h2", "h3", "h4"]))
        items.append({"url": url, "titulo": titulo, "texto": texto_de(bloque)})
    return items
