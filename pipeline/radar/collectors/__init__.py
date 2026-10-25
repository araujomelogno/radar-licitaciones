"""Registro de collectors. Para sumar una fuente: un módulo nuevo y una línea acá."""

from __future__ import annotations

from .arce import Arce
from .auci import Auci
from .base import Collector, Contexto
from .bid import Bid
from .bm import BancoMundial
from .ceibal import Ceibal
from .cnd import Cnd
from .dncp import Dncp
from .fiap import Fiap
from .im import IntendenciaMontevideo
from .ungm import Ungm

COLLECTORS: dict[str, type[Collector]] = {
    c.fuente_id: c
    for c in (Arce, IntendenciaMontevideo, Dncp, BancoMundial, Bid, Ungm, Cnd, Auci, Fiap, Ceibal)
}

__all__ = ["COLLECTORS", "Collector", "Contexto"]
