from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from radar.collectors import Contexto
from radar.http import Respuesta

FIXTURES = Path(__file__).parent / "fixtures"
TZ = ZoneInfo("America/Montevideo")
AHORA = datetime(2026, 10, 25, 12, 0, tzinfo=TZ)


def leer(ruta: str) -> str:
    return (FIXTURES / ruta).read_text(encoding="utf-8")


def leer_json(ruta: str) -> Any:
    return json.loads(leer(ruta))


@pytest.fixture
def ctx() -> Contexto:
    return Contexto(ahora=AHORA, ventana_dias=7)


class LectorFalso:
    """Responde con fixtures según la URL. Registra lo que se pidió."""

    def __init__(self, rutas: dict[str, str | Any]) -> None:
        self.rutas = rutas
        self.pedidos: list[str] = []

    def _buscar(self, url: str) -> Any:
        self.pedidos.append(url)
        for clave, valor in self.rutas.items():
            if clave in url:
                return valor
        raise AssertionError(f"URL no esperada en el test: {url}")

    def get(self, url: str, *, params: dict | None = None, headers: dict | None = None,
            encoding: str | None = None) -> Respuesta:
        clave = url + ("?" + "&".join(f"{k}={v}" for k, v in (params or {}).items()) if params else "")
        valor = self._buscar(clave)
        texto = valor if isinstance(valor, str) else json.dumps(valor)
        return Respuesta(url, 200, texto, texto.encode())

    def post(self, url: str, *, json: Any = None, data: Any = None, headers: dict | None = None) -> Respuesta:
        clave = url + "#" + str((json or {}).get("Description", ""))
        valor = self._buscar(clave)
        return Respuesta(url, 200, valor, valor.encode())

    def cerrar(self) -> None:
        pass
