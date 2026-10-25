"""Normalización (RF-03): texto, fechas, países y monedas."""

from __future__ import annotations

import html
import re
import unicodedata
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from .modelos import ZONA_PAIS

LARGO_MAXIMO_TEXTO = 20_000

_ESPACIOS = re.compile(r"\s+")
_NO_SLUG = re.compile(r"[^a-z0-9]+")
_NO_ID = re.compile(r"[^A-Za-z0-9]+")


def limpiar_html(valor: str | None) -> str:
    """Saca etiquetas, entidades y espacios repetidos."""
    if not valor:
        return ""
    if "<" in valor and ">" in valor:
        valor = BeautifulSoup(valor, "lxml").get_text(" ")
    valor = html.unescape(valor)
    return _ESPACIOS.sub(" ", valor).strip()


def recortar(texto: str) -> tuple[str, int]:
    """Corta el texto en 20.000 caracteres y devuelve también el largo original."""
    return texto[:LARGO_MAXIMO_TEXTO], len(texto)


def sin_acentos(valor: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", valor) if not unicodedata.combining(c))


def plano(valor: str) -> str:
    """Minúsculas, sin acentos ni signos: para comparar y buscar keywords."""
    return _ESPACIOS.sub(" ", re.sub(r"[^a-z0-9ñ ]+", " ", sin_acentos(valor.lower()))).strip()


def slug(valor: str, largo: int = 60) -> str:
    s = _NO_SLUG.sub("-", sin_acentos(valor.lower())).strip("-")
    return s[:largo].rstrip("-") or "sin-titulo"


def doc_id(prefijo: str, id_oficial: str | None, titulo: str = "") -> str:
    """Slug de la fuente + ID del llamado, igual que en el radar actual (RF-04).

    Si la fuente no tiene ID, se usa un slug del título.
    """
    if id_oficial:
        limpio = _NO_ID.sub("-", id_oficial.strip()).strip("-")
        if limpio:
            return f"{prefijo}-{limpio}"
    return f"{prefijo}-{slug(titulo)}"


def zona(pais: str) -> ZoneInfo:
    return ZoneInfo(ZONA_PAIS.get(pais, "America/Montevideo"))


def parse_fecha(valor: str | datetime | date | None, pais: str = "Uruguay", *, cierre: bool = False,
                dayfirst: bool = True) -> datetime | None:
    """Convierte a datetime con zona.

    Un cierre sin hora se toma a las 23:59 hora local del organismo. Una fecha sin
    zona se interpreta en la hora local del país.
    """
    if valor is None or valor == "":
        return None
    tz = zona(pais)
    if isinstance(valor, datetime):
        dt = valor
        sin_hora = False
    elif isinstance(valor, date):
        dt = datetime.combine(valor, time(0, 0))
        sin_hora = True
    else:
        texto = limpiar_html(str(valor))
        if not texto:
            return None
        texto = _traducir_meses(re.sub(r"\(.*?\)", " ", texto))
        iso = re.match(r"^\d{4}-\d{2}-\d{2}", texto)
        try:
            dt = dateparser.parse(texto, dayfirst=dayfirst and not iso, fuzzy=True)
        except (ValueError, OverflowError):
            return None
        sin_hora = not re.search(r"\d{1,2}:\d{2}", texto) and not re.search(r"T\d{2}", texto)
    if sin_hora and cierre:
        dt = dt.replace(hour=23, minute=59, second=0, microsecond=0)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt


_MESES = {
    "enero": "January", "febrero": "February", "marzo": "March", "abril": "April",
    "mayo": "May", "junio": "June", "julio": "July", "agosto": "August",
    "septiembre": "September", "setiembre": "September", "octubre": "October",
    "noviembre": "November", "diciembre": "December",
    "ene": "Jan", "feb": "Feb", "mar": "Mar", "abr": "Apr", "may": "May", "jun": "Jun",
    "jul": "Jul", "ago": "Aug", "sep": "Sep", "set": "Sep", "oct": "Oct", "nov": "Nov", "dic": "Dec",
}
_PALABRA_MES = re.compile(r"\b(" + "|".join(sorted(_MESES, key=len, reverse=True)) + r")\b\.?", re.IGNORECASE)


def _traducir_meses(texto: str) -> str:
    texto = re.sub(r"\bde\b", " ", texto, flags=re.IGNORECASE)
    texto = re.sub(r"\b(hs?|horas)\b\.?", " ", texto, flags=re.IGNORECASE)
    return _PALABRA_MES.sub(lambda m: _MESES[m.group(1).lower()], texto)


_PAISES = {
    "Uruguay": ("uruguay", "uruguaya", "uruguayo", "montevideo"),
    "Paraguay": ("paraguay", "paraguaya", "paraguayo", "asuncion"),
}
_OTROS_PAISES = (
    "argentina", "brasil", "brazil", "chile", "bolivia", "peru", "ecuador", "colombia", "mexico",
    "guatemala", "honduras", "el salvador", "nicaragua", "costa rica", "panama", "venezuela",
    "republica dominicana", "dominican republic", "haiti", "jamaica", "cuba",
)


def paises_mencionados(*textos: str) -> list[str]:
    """Países que nombra un aviso, para la regla geográfica estricta."""
    p = " " + plano(" ".join(t for t in textos if t)) + " "
    encontrados = [pais for pais, claves in _PAISES.items() if any(f" {c} " in p for c in claves)]
    encontrados += [o for o in _OTROS_PAISES if f" {o} " in p]
    return encontrados


def pais_desde(*valores: str | None) -> str | None:
    """Uruguay o Paraguay a partir de un nombre o código de país."""
    for v in valores:
        if not v:
            continue
        x = plano(v)
        if x in ("uy", "ury", "uruguay") or "uruguay" in x:
            return "Uruguay"
        if x in ("py", "pry", "paraguay") or "paraguay" in x:
            return "Paraguay"
    return None


def moneda_iso(valor: str | None) -> str | None:
    if not valor:
        return None
    v = plano(valor)
    if v in ("uyu", "pesos uruguayos", "peso uruguayo", "uy", "$", "pesos") or "uruguay" in v:
        return "UYU"
    if v in ("usd", "us", "u s", "dolares", "dolar", "dolares americanos", "us dollar", "u s dollar"):
        return "USD"
    if v in ("pyg", "gs", "guaranies", "guarani", "g") or "guaran" in v:
        return "PYG"
    if v in ("eur", "euro", "euros"):
        return "EUR"
    return None


def numero(valor: str | float | int | None) -> float | None:
    """Monto en formato es-UY/es-PY (1.234.567,89) o en inglés (1,234,567.89)."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    s = re.sub(r"[^\d,.\-]", "", str(valor))
    if not s:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        partes = s.split(",")
        s = s.replace(",", ".") if len(partes) == 2 and len(partes[1]) <= 2 else s.replace(",", "")
    elif s.count(".") > 1 or re.search(r"\.\d{3}$", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def tipo_desde(texto: str) -> str:
    """Tipo de llamado a partir del título o del procedimiento."""
    p = plano(texto)
    if any(k in p for k in ("expresion de interes", "expresiones de interes", "expression of interest", "manifestacion de interes")):
        return "expresion_interes"
    if any(k in p for k in ("consultor individual", "consultoria individual", "individual consultant")):
        return "consultoria_individual"
    if any(k in p for k in ("consultoria", "consultora", "consulting", "consultant", "firma consultora")):
        return "consultoria_firma"
    if any(k in p for k in ("servicio", "services", "contratacion")):
        return "servicios"
    if any(k in p for k in ("aviso general", "general procurement notice")):
        return "aviso_general"
    return "otro"
