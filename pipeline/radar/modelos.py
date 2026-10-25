"""Contratos de datos: AvisoNormalizado, fuentes, estados y salida del LLM.

Ver docs/arquitectura.md. Estos nombres son los mismos que usan la app web,
las Cloud Functions y las Firestore Rules.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Pais = Literal["Uruguay", "Paraguay"]
Tipo = Literal[
    "consultoria_firma",
    "consultoria_individual",
    "servicios",
    "expresion_interes",
    "aviso_general",
    "otro",
]
Moneda = Literal["UYU", "USD", "PYG", "EUR"]
Relevancia = Literal["alta", "media", "baja", "sin_clasificar"]
Metodo = Literal["http", "navegador", "agente_local", "manual"]

ESTADOS = (
    "nueva",
    "analizando",
    "postular",
    "presentada",
    "evaluacion",
    "ganada",
    "perdida",
    "descartada",
)
ESTADOS_CERRADOS = ("descartada", "ganada", "perdida")
ESTADOS_ANALIZANDO_O_MAS = ("analizando", "postular", "presentada", "evaluacion", "ganada", "perdida")

PAIS_ISO = {"Uruguay": "UY", "Paraguay": "PY"}
ZONA_PAIS = {"Uruguay": "America/Montevideo", "Paraguay": "America/Asuncion"}

_DOC_ID = re.compile(r"^[a-z0-9]+(-[A-Za-z0-9]+)+$")


@dataclass(frozen=True)
class Fuente:
    id: str
    nombre: str
    prefijo: str
    paises: tuple[str, ...]
    url: str


FUENTES: dict[str, Fuente] = {
    f.id: f
    for f in (
        Fuente("arce", "Compras Estatales", "ce", ("UY",), "https://www.comprasestatales.gub.uy/ocds/rss"),
        Fuente(
            "im",
            "Intendencia de Montevideo",
            "im",
            ("UY",),
            "https://www.montevideo.gub.uy/aplicacion/compras-vigentes",
        ),
        Fuente(
            "dncp",
            "DNCP Paraguay",
            "dncp",
            ("PY",),
            "https://www.contrataciones.gov.py/datos/api/v3/doc",
        ),
        Fuente("bm", "Banco Mundial", "bm", ("UY", "PY"), "https://search.worldbank.org/api/v2/procnotices"),
        Fuente("bid", "BID", "bid", ("UY", "PY"), "https://data.iadb.org/api/3/action/datastore_search"),
        Fuente("ungm", "UNGM", "ungm", ("UY", "PY"), "https://www.ungm.org/Public/Notice"),
        Fuente("cnd", "CND", "cnd", ("UY",), "https://llamados.cnd.org.uy/"),
        Fuente(
            "auci",
            "AUCI",
            "auci",
            ("UY",),
            "https://www.gub.uy/agencia-uruguaya-cooperacion-internacional/comunicacion/convocatorias",
        ),
        Fuente("fiap", "FIAP", "fiap", ("UY", "PY"), "https://www.fiap.gob.es/ofertas/"),
        Fuente("ceibal", "Ceibal", "ceibal", ("UY",), "https://compras.ceibal.edu.uy/convocatorias/feed"),
    )
}

# Orden de preferencia al fusionar duplicados: la fuente oficial gana.
PRIORIDAD_FUENTE = [
    "Compras Estatales",
    "UTEC",
    "Intendencia de Montevideo",
    "DNCP Paraguay",
    "Banco Mundial",
    "CND",
    "Ceibal",
    "UNGM",
    "AUCI",
    "FIAP",
    "BID",
    "LinkedIn",
    "DevelopmentAid",
]


def prioridad(fuente: str) -> int:
    try:
        return PRIORIDAD_FUENTE.index(fuente)
    except ValueError:
        return len(PRIORIDAD_FUENTE)


class AvisoNormalizado(BaseModel):
    """Lo que devuelve cada collector (contrato de la spec)."""

    docId: str
    fuente: str
    idOficial: str | None = None
    titulo: str
    organismo: str
    pais: Pais
    tipo: Tipo = "otro"
    url: str
    publicado: datetime | None = None
    cierre: datetime | None = None
    monto: float | None = None
    moneda: Moneda | None = None
    financiador: str | None = None
    idioma: Literal["es", "en", "pt"] | None = None
    texto: str = ""
    textoLargo: int = 0
    crudoRef: str
    admiteExtranjeras: bool | None = None
    # Para la deduplicación entre fuentes: número de llamado o de proyecto.
    referencias: list[str] = Field(default_factory=list)
    # Países que nombra el aviso (para la regla geográfica estricta del prefiltro).
    paisesMencionados: list[str] = Field(default_factory=list)

    @field_validator("docId")
    @classmethod
    def _doc_id_valido(cls, v: str) -> str:
        if not _DOC_ID.match(v):
            raise ValueError(f"docId inválido: {v!r}")
        return v

    @field_validator("publicado", "cierre")
    @classmethod
    def _con_zona(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("las fechas tienen que tener zona horaria")
        return v


class SalidaLLM(BaseModel):
    """Esquema JSON que se le exige a Gemini. Una salida que no cumple se descarta."""

    puntaje: int = Field(ge=0, le=100)
    resumen: str = Field(max_length=280)
    motivo: str = Field(max_length=160)
    servicios: list[
        Literal[
            "encuesta_hogares",
            "encuesta_opinion",
            "encuesta_satisfaccion",
            "investigacion_mercado",
            "evaluacion_impacto",
            "evaluacion_programa",
            "cualitativo",
            "linea_base",
            "relevamiento",
            "monitoreo_evaluacion",
            "diagnostico",
            "otro",
        ]
    ] = Field(max_length=8)
    esInvestigacion: bool
    confianza: Literal["alta", "media", "baja"]


def relevancia_de(puntaje: int | None, umbrales: dict[str, int]) -> Relevancia:
    if puntaje is None:
        return "sin_clasificar"
    if puntaje >= umbrales.get("alta", 70):
        return "alta"
    if puntaje >= umbrales.get("media", 40):
        return "media"
    return "baja"
