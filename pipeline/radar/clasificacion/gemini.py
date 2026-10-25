"""Cliente de Gemini por Vertex AI, con salida JSON con esquema y temperatura 0."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import ValidationError

from ..modelos import SalidaLLM
from . import prompt


@dataclass
class Respuesta:
    texto: str
    tokens_entrada: int = 0
    tokens_salida: int = 0


class Modelo(Protocol):
    nombre: str

    def generar(self, sistema: str, usuario: str) -> Respuesta: ...


class GeminiVertex:
    def __init__(self, nombre: str, proyecto: str, location: str = "global", timeout_s: int = 60) -> None:
        from google import genai
        from google.genai import types

        self.nombre = nombre
        self._types = types
        self._cliente = genai.Client(
            vertexai=True,
            project=proyecto,
            location=location,
            http_options=types.HttpOptions(timeout=timeout_s * 1000),
        )

    def generar(self, sistema: str, usuario: str) -> Respuesta:
        t = self._types
        r = self._cliente.models.generate_content(
            model=self.nombre,
            contents=usuario,
            config=t.GenerateContentConfig(
                system_instruction=sistema,
                temperature=0,
                response_mime_type="application/json",
                response_schema=prompt.ESQUEMA_RESPUESTA,
                max_output_tokens=800,
                # Sin herramientas: el modelo no puede buscar ni llamar a nada.
                tools=[],
            ),
        )
        uso = r.usage_metadata
        return Respuesta(
            texto=r.text or "",
            tokens_entrada=getattr(uso, "prompt_token_count", 0) or 0,
            tokens_salida=getattr(uso, "candidates_token_count", 0) or 0,
        )


@dataclass
class Resultado:
    salida: SalidaLLM | None
    intentos: int
    tokens_entrada: int
    tokens_salida: int
    error: str | None = None


def clasificar(modelo: Modelo, doc: dict[str, Any], perfil: dict[str, Any],
               descartes: list[dict[str, Any]], intentos: int = 2) -> Resultado:
    """Clasifica un aviso. Si el JSON es inválido o hay timeout, reintenta 1 vez."""
    sistema, usuario = prompt.armar(doc, perfil, descartes)
    tin = tout = 0
    error = None
    for i in range(1, intentos + 1):
        try:
            r = modelo.generar(sistema, usuario)
        except Exception as e:  # timeout, cuota, error del servicio
            error = f"{type(e).__name__}: {e}"[:300]
            continue
        tin += r.tokens_entrada
        tout += r.tokens_salida
        try:
            return Resultado(SalidaLLM.model_validate_json(r.texto), i, tin, tout)
        except ValidationError as e:
            error = f"salida fuera de esquema: {e.errors()[0].get('msg', '')}"[:300]
    return Resultado(None, intentos, tin, tout, error)


def costo_usd(tokens_entrada: int, tokens_salida: int, precios: dict[str, float]) -> float:
    return round(
        tokens_entrada / 1e6 * precios.get("entradaPorMillon", 0.25)
        + tokens_salida / 1e6 * precios.get("salidaPorMillon", 1.50),
        6,
    )
