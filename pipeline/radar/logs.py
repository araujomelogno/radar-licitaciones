"""Logs estructurados para Cloud Logging.

Cloud Run toma cada línea JSON de stdout como una entrada estructurada: `severity`
y `message` son campos especiales, el resto queda en `jsonPayload`. Todas las
líneas llevan el `corridaId` de la corrida en curso, y las que disparan alertas
llevan además `evento` (ver infra/monitoring).
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from typing import Any

_contexto: dict[str, Any] = {}


def contexto(**campos: Any) -> None:
    """Agrega campos a todas las líneas siguientes (por ejemplo corridaId y fuente)."""
    _contexto.update({k: v for k, v in campos.items() if v is not None})


def _emitir(severidad: str, mensaje: str, campos: dict[str, Any]) -> None:
    linea = {
        "severity": severidad,
        "message": mensaje,
        "time": datetime.now(UTC).isoformat(),
        **_contexto,
        **campos,
    }
    print(json.dumps(linea, ensure_ascii=False, default=str), file=sys.stdout, flush=True)


def info(mensaje: str, **campos: Any) -> None:
    _emitir("INFO", mensaje, campos)


def aviso(mensaje: str, **campos: Any) -> None:
    _emitir("WARNING", mensaje, campos)


def error(mensaje: str, **campos: Any) -> None:
    _emitir("ERROR", mensaje, campos)
