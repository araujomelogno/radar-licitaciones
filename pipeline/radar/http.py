"""Acceso a los sitios: HTTP simple o navegador sin interfaz (RF-02, RF-13).

Reglas que cumplen los dos métodos:
- respetan robots.txt;
- como máximo 1 pedido por segundo por sitio;
- se identifican con un User-Agent propio;
- nunca inician sesión, completan formularios, aceptan cookies no esenciales ni se registran.
"""

from __future__ import annotations

import time
import urllib.robotparser
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx

from . import logs
from .ajustes import ajustes

INTERVALO_MINIMO = 1.0  # segundos entre pedidos al mismo sitio

_SENALES_BLOQUEO = (
    "access denied",
    "acceso denegado",
    "request blocked",
    "cf-chl",
    "captcha",
    "attention required",
    "are you a robot",
    "incapsula",
    "the requested url was rejected",
)


class ErrorFuente(Exception):
    """Falla al leer una fuente. La corrida sigue y la fuente queda en error."""


class BloqueoAcceso(ErrorFuente):
    """El sitio rechaza pedidos desde la nube: la fuente queda con “bloqueo de acceso”."""


class NoPermitidoPorRobots(ErrorFuente):
    pass


@dataclass
class Respuesta:
    url: str
    status: int
    texto: str
    contenido: bytes
    encoding: str | None = None

    def json(self) -> Any:
        import json

        return json.loads(self.texto)


class Lector(Protocol):
    def get(self, url: str, *, params: dict | None = None, headers: dict | None = None,
            encoding: str | None = None) -> Respuesta: ...

    def post(self, url: str, *, json: Any = None, data: Any = None, headers: dict | None = None) -> Respuesta: ...

    def cerrar(self) -> None: ...


@dataclass
class _Ritmo:
    ultimo: dict[str, float] = field(default_factory=dict)

    def esperar(self, host: str) -> None:
        ahora = time.monotonic()
        previo = self.ultimo.get(host)
        if previo is not None and ahora - previo < INTERVALO_MINIMO:
            time.sleep(INTERVALO_MINIMO - (ahora - previo))
        self.ultimo[host] = time.monotonic()


def _parece_bloqueo(status: int, cuerpo: str) -> bool:
    if status in (401, 403, 407, 429, 451):
        return True
    if status in (503, 520, 521, 522, 523, 524) or status < 400:
        muestra = cuerpo[:4000].lower()
        return any(s in muestra for s in _SENALES_BLOQUEO) and (status >= 400 or len(cuerpo) < 6000)
    return False


class LectorHttp:
    """Cliente HTTP educado. Sin cookies persistentes, sin login."""

    def __init__(self, timeout: float = 45.0, respetar_robots: bool = True) -> None:
        self.ua = ajustes().user_agent
        self.cliente = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": self.ua, "Accept-Language": "es-UY,es;q=0.9,en;q=0.6"},
        )
        self.ritmo = _Ritmo()
        self.respetar_robots = respetar_robots
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def _permitido(self, url: str) -> bool:
        if not self.respetar_robots:
            return True
        partes = urlsplit(url)
        base = f"{partes.scheme}://{partes.netloc}"
        if base not in self._robots:
            rp: urllib.robotparser.RobotFileParser | None = urllib.robotparser.RobotFileParser()
            try:
                self.ritmo.esperar(partes.netloc)
                r = self.cliente.get(f"{base}/robots.txt")
                if r.status_code >= 400:
                    rp = None  # sin robots.txt: todo permitido
                else:
                    rp.parse(r.text.splitlines())
            except httpx.HTTPError:
                rp = None
            self._robots[base] = rp
        rp = self._robots[base]
        return True if rp is None else rp.can_fetch(self.ua, url)

    def _pedir(self, metodo: str, url: str, **kw: Any) -> Respuesta:
        if not self._permitido(url):
            raise NoPermitidoPorRobots(f"robots.txt no permite leer {url}")
        encoding = kw.pop("encoding", None)
        host = urlsplit(url).netloc
        ultimo_error: Exception | None = None
        for intento in range(2):
            self.ritmo.esperar(host)
            try:
                r = self.cliente.request(metodo, url, **kw)
            except httpx.TimeoutException as e:
                ultimo_error = e
                continue
            except httpx.HTTPError as e:
                raise ErrorFuente(f"no se pudo conectar con {host}: {e}") from e
            if encoding:
                r.encoding = encoding
            texto = r.text
            if _parece_bloqueo(r.status_code, texto):
                raise BloqueoAcceso(f"bloqueo de acceso: {host} respondió {r.status_code}")
            if r.status_code >= 500 and intento == 0:
                ultimo_error = ErrorFuente(f"{host} respondió {r.status_code}")
                time.sleep(3)
                continue
            if r.status_code >= 400:
                raise ErrorFuente(f"{host} respondió {r.status_code} para {url}")
            return Respuesta(str(r.url), r.status_code, texto, r.content, r.encoding)
        raise ErrorFuente(f"sin respuesta de {host}: {ultimo_error}")

    def get(self, url: str, *, params: dict | None = None, headers: dict | None = None,
            encoding: str | None = None) -> Respuesta:
        return self._pedir("GET", url, params=params, headers=headers, encoding=encoding)

    def post(self, url: str, *, json: Any = None, data: Any = None, headers: dict | None = None) -> Respuesta:
        return self._pedir("POST", url, json=json, data=data, headers=headers)

    def cerrar(self) -> None:
        self.cliente.close()


class LectorNavegador(LectorHttp):
    """Navegador sin interfaz (Playwright/Chromium) para sitios que no responden a HTTP simple.

    Solo navega y lee: no hace clic en banners de cookies, no completa formularios
    ni inicia sesión. Los POST (APIs JSON) siguen por HTTP desde el contexto del navegador.
    """

    def __init__(self, timeout: float = 60.0) -> None:
        super().__init__(timeout=timeout)
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as e:  # pragma: no cover - depende de la imagen
            raise ErrorFuente("el método navegador necesita playwright instalado") from e
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        self._ctx = self._browser.new_context(user_agent=self.ua, locale="es-UY")
        self._timeout_ms = int(timeout * 1000)

    def get(self, url: str, *, params: dict | None = None, headers: dict | None = None,
            encoding: str | None = None) -> Respuesta:
        if params:
            url = str(httpx.URL(url, params=params))
        if not self._permitido(url):
            raise NoPermitidoPorRobots(f"robots.txt no permite leer {url}")
        self.ritmo.esperar(urlsplit(url).netloc)
        pagina = self._ctx.new_page()
        try:
            r = pagina.goto(url, wait_until="networkidle", timeout=self._timeout_ms)
            status = r.status if r else 0
            tipo = (r.headers.get("content-type") or "") if r is not None else ""
            if r is not None and ("json" in tipo or "xml" in tipo):
                cuerpo = r.body()
                texto = cuerpo.decode(encoding or "utf-8", errors="replace")
            else:
                texto = pagina.content()
                cuerpo = texto.encode("utf-8")
        finally:
            pagina.close()
        if _parece_bloqueo(status, texto):
            raise BloqueoAcceso(f"bloqueo de acceso (navegador): {urlsplit(url).netloc} respondió {status}")
        if status >= 400:
            raise ErrorFuente(f"{urlsplit(url).netloc} respondió {status}")
        return Respuesta(url, status, texto, cuerpo, encoding)

    def post(self, url: str, *, json: Any = None, data: Any = None, headers: dict | None = None) -> Respuesta:
        if not self._permitido(url):
            raise NoPermitidoPorRobots(f"robots.txt no permite leer {url}")
        self.ritmo.esperar(urlsplit(url).netloc)
        r = self._ctx.request.post(url, data=json if json is not None else data, headers=headers,
                                   timeout=self._timeout_ms)
        texto = r.text()
        if _parece_bloqueo(r.status, texto):
            raise BloqueoAcceso(f"bloqueo de acceso (navegador): {urlsplit(url).netloc} respondió {r.status}")
        if r.status >= 400:
            raise ErrorFuente(f"{urlsplit(url).netloc} respondió {r.status}")
        return Respuesta(url, r.status, texto, r.body())

    def cerrar(self) -> None:
        try:
            self._ctx.close()
            self._browser.close()
            self._pw.stop()
        finally:
            super().cerrar()


def lector_para(metodo: str) -> Lector:
    if metodo == "navegador":
        logs.info("usando navegador sin interfaz")
        return LectorNavegador()
    return LectorHttp()
