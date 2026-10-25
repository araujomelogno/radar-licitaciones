"""Configuración inicial: keywords semilla, exclusiones y rúbrica del PRD.

`python -m radar.cli seed` la escribe en Firestore solo si los documentos no
existen (no pisa lo que haya editado un admin).
"""

from __future__ import annotations

from typing import Any

from .modelos import FUENTES

KEYWORDS_INCLUIR = [
    "encuesta", "encuestas", "sondeo", "opinión pública", "investigación de mercado", "investigación social",
    "investigación cualitativa", "investigación cuantitativa", "estudio cualitativo", "estudio cuantitativo",
    "estudio de mercado", "grupo focal", "grupos focales", "focus group", "línea de base", "linea base",
    "evaluación de impacto", "evaluación de resultados", "evaluación de programa", "evaluación del programa",
    "evaluación de medio término", "evaluación de medio termino", "evaluación final", "evaluación intermedia",
    "evaluación externa", "evaluación de procesos", "satisfacción de usuarios", "satisfacción de clientes",
    "satisfacción ciudadana", "satisfacción de beneficiarios", "satisfacción de pacientes",
    "percepción ciudadana", "percepción social", "relevamiento de datos", "relevamiento de hogares",
    "relevamiento de necesidades", "monitoreo y evaluación", "diagnóstico social", "diagnóstico territorial",
    "diagnóstico participativo", "mapeo de actores", "estudio de imagen", "estudio de clima",
    "estudio de demanda", "estudio de caracterización", "clima laboral", "clima organizacional",
    "entrevistas en profundidad", "censo", "trabajo de campo", "levantamiento de datos",
    # inglés y portugués (multilaterales)
    "survey", "household survey", "baseline", "impact evaluation", "evaluation", "focus groups",
    "public opinion", "market research", "data collection", "monitoring and evaluation", "pesquisa",
    "avaliação de impacto", "linha de base",
]

# Exclusiones por palabra o frase: se buscan en el título y el comienzo del texto.
EXCLUIR = [
    "encuesta de precios", "topografía", "topográfico", "geotecnia", "geotécnico", "medidor", "medidores",
    "estudio de suelos", "estudios de suelos", "estudio de saneamiento", "proyecto ejecutivo", "factibilidad de infraestructura",
    "impacto ambiental", "evaluación de impacto ambiental", "diagnóstico médico", "diagnósticos médicos",
    "llamado a encuestadores", "contratación de encuestadores", "ingeniería de detalle",
    "estudios de ingeniería", "environmental impact",
]

# Exclusiones temáticas (rubro): se buscan solo en el título y no aplican si el
# título nombra además un servicio de investigación (por ejemplo “evaluación del programa de obras”).
EXCLUIR_RUBROS = [
    "obra", "obras", "construcción", "suministro", "suministros", "adquisición de equipos", "equipamiento",
    "mantenimiento", "insumos médicos", "medicamentos", "reactivos", "vehículos", "mobiliario",
    "repuestos", "works", "goods", "supply of", "equipment", "saneamiento", "beca", "becas",
    "fondos para empresas", "fondo concursable", "contratación de personal", "pasantía", "pasantías",
]


def busqueda_inicial() -> dict[str, Any]:
    return {
        "incluir": KEYWORDS_INCLUIR,
        "excluir": EXCLUIR,
        "excluirRubros": EXCLUIR_RUBROS,
        "porFuente": {},
        "umbrales": {"alta": 70, "media": 40},
        "ventanaDias": 7,
        "version": 1,
    }


def perfil_inicial() -> dict[str, Any]:
    return {
        "servicios": [
            "Encuestas de hogares y de opinión pública",
            "Investigación de mercado",
            "Estudios cualitativos (grupos focales, entrevistas en profundidad)",
            "Líneas de base y evaluaciones de impacto, de resultados y de procesos",
            "Estudios de satisfacción de usuarios, clientes y ciudadanos",
            "Monitoreo y evaluación de programas",
        ],
        "sectores": ["Desarrollo social", "Salud", "Educación", "Empleo", "Gobierno", "Cooperación internacional"],
        "antecedentes": [],
        "paises": ["Uruguay", "Paraguay"],
        "rangoMonto": {"min": None, "max": None, "moneda": "USD"},
        "version": 1,
    }


def sistema_inicial() -> dict[str, Any]:
    return {
        "modelo": "gemini-3.1-flash-lite",
        "promptVersion": "v1",
        "appUrl": "",
        "remitente": "",
        "destinatariosExtra": [],
        "precios": {"entradaPorMillon": 0.25, "salidaPorMillon": 1.50},
        "version": 1,
    }


def fuentes_iniciales() -> dict[str, dict[str, Any]]:
    return {
        f.id: {
            "nombre": f.nombre,
            "slug": f.prefijo,
            "paises": list(f.paises),
            "activa": True,
            "metodo": "http",
            "url": f.url,
            "ultimaCorrida": None,
            "ceroConsecutivos": 0,
            "pruebaAcceso": None,
        }
        for f in FUENTES.values()
    }
