"""Prefiltro determinista (RF-05), antes del LLM.

Reglas, en orden:
1. Geográfica estricta: Uruguay o Paraguay. Un estudio multipaís entra solo si los nombra.
2. Exclusiones por palabra (“encuesta de precios”, topografía, geotecnia, medidor…).
3. Exclusiones temáticas (obras, suministros, equipamiento…), en el título.
4. Pasa al LLM si tiene al menos una keyword o si es una consultoría de firma.

Lo descartado queda “baja” con motivo `prefiltro: <regla>`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .normalizacion import plano

PAISES_RADAR = ("Uruguay", "Paraguay")
_LARGO_TEXTO_EXCLUSIONES = 600


@dataclass(frozen=True)
class Resultado:
    paso: bool
    regla: str | None = None

    @property
    def motivo(self) -> str:
        return f"prefiltro: {self.regla}" if self.regla else ""


@lru_cache(maxsize=4096)
def _patron(frase: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![a-z0-9]){re.escape(plano(frase))}(?![a-z0-9])")


def contiene(texto_plano: str, frase: str) -> bool:
    return bool(plano(frase)) and bool(_patron(frase).search(texto_plano))


def primera(texto_plano: str, frases: list[str]) -> str | None:
    return next((f for f in frases if contiene(texto_plano, f)), None)


def evaluar(doc: dict[str, Any], busqueda: dict[str, Any], perfil: dict[str, Any] | None = None,
            fuente_id: str | None = None) -> Resultado:
    perfil = perfil or {}
    paises = [p for p in perfil.get("paises") or PAISES_RADAR if p in PAISES_RADAR] or list(PAISES_RADAR)

    # 1. Regla geográfica estricta
    if doc.get("pais") not in paises:
        return Resultado(False, f"país fuera de alcance ({doc.get('pais')})")
    mencionados = doc.get("paisesMencionados") or []
    otros = [p for p in mencionados if p not in PAISES_RADAR]
    if otros and not any(p in mencionados for p in paises):
        return Resultado(False, "multipaís sin Uruguay ni Paraguay")

    titulo = plano(doc.get("titulo", ""))
    texto = plano(doc.get("texto", ""))
    inicio = f"{titulo} {texto[:_LARGO_TEXTO_EXCLUSIONES]}"
    por_fuente = (busqueda.get("porFuente") or {}).get(fuente_id or "", {}) if fuente_id else {}
    incluir = [*(busqueda.get("incluir") or []), *(por_fuente.get("incluir") or [])]
    excluir = [*(busqueda.get("excluir") or []), *(por_fuente.get("excluir") or [])]

    # 2. Exclusiones por palabra
    palabra = primera(inicio, excluir)
    if palabra:
        return Resultado(False, f'palabra excluida "{palabra}"')

    # 3. Exclusiones temáticas, solo en el título y si no nombra un servicio de investigación
    rubro = primera(titulo, busqueda.get("excluirRubros") or [])
    if rubro and not primera(titulo, incluir):
        return Resultado(False, f'rubro excluido "{rubro}"')

    # 4. Keywords o consultoría de firma
    if primera(f"{titulo} {texto}", incluir) or doc.get("tipo") == "consultoria_firma":
        return Resultado(True)
    return Resultado(False, "sin keywords")


def fuente_id_de(doc: dict[str, Any]) -> str | None:
    from .modelos import FUENTES

    prefijo = str(doc.get("docId", "")).split("-", 1)[0]
    return next((f.id for f in FUENTES.values() if f.prefijo == prefijo), None)
