"""Migración del radar actual (RF-11) y reglas de acceso de los collectors (RF-02, RF-13)."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from conftest import AHORA

from radar.http import BloqueoAcceso, LectorHttp, NoPermitidoPorRobots
from radar.migracion import mapear_oportunidad, migrar


def test_mapea_estados_notas_e_historial():
    viejo = {"titulo": "Encuesta de hogares", "organismo": "INE", "pais": "UY", "fuente": "Compras Estatales",
             "estado": "Vamos a postular", "estado_fecha": "2026-09-01", "nota": "Ana lo lleva",
             "relevancia": "alta", "cierre": "15/10/2026",
             "historial": [{"estado": "Analizando", "usuario": "ana@equipos.com.uy", "fecha": "2026-08-20"}]}
    doc, motivo = mapear_oportunidad("ce-1378357", viejo, "equipos", AHORA)
    assert motivo == ""
    assert doc["docId"] == doc["legacyId"] == "ce-1378357"
    assert doc["estado"] == "postular" and doc["nota"] == "Ana lo lleva" and doc["pais"] == "Uruguay"
    assert doc["estadoFecha"].date().isoformat() == "2026-09-01"
    assert doc["historial"][0]["autor"] == "ana@equipos.com.uy" and doc["historial"][-1]["tipo"] == "migracion"
    assert doc["etapa"] == "lista" and not doc["manual"]


def test_rechazos_explicados():
    assert mapear_oportunidad("a/b", {"titulo": "x"}, "equipos", AHORA) == (None, "doc_id inválido para Firestore")
    assert mapear_oportunidad("ce-1", {}, "equipos", AHORA) == (None, "sin título")
    assert mapear_oportunidad("ce-1", {"titulo": "x", "estado": "rarísimo"}, "equipos", AHORA)[1].startswith("estado desconocido")


def test_manual_por_canal():
    doc, _ = mapear_oportunidad("manual-1", {"titulo": "Llamado BID", "fuente": "BEO"}, "equipos", AHORA)
    assert doc["manual"] and doc["fuente"] == "BEO" and doc["canal"] == "BEO"


def test_migrar_informa_conteos(tmp_path):
    (tmp_path / "oportunidades.json").write_text(json.dumps({
        "ce-1": {"titulo": "Encuesta", "estado": "Nueva"},
        "ce-2": {"estado": "Nueva"},
    }), encoding="utf-8")
    (tmp_path / "competidores.jsonl").write_text('{"id": "210000000011", "nombre": "Firma X"}\n', encoding="utf-8")
    informe = migrar(tmp_path, None, "equipos", simular=True)
    assert informe["oportunidades"]["leidos"] == 2 and informe["oportunidades"]["importados"] == 1
    assert informe["oportunidades"]["rechazos"] == [{"id": "ce-2", "motivo": "sin título"}]
    assert informe["competidores"]["importados"] == 1


@respx.mock
def test_respeta_robots_txt():
    respx.get("https://sitio.uy/robots.txt").mock(return_value=httpx.Response(200, text="User-agent: *\nDisallow: /privado"))
    respx.get("https://sitio.uy/publico").mock(return_value=httpx.Response(200, text="ok"))
    lector = LectorHttp()
    lector.ritmo.esperar = lambda host: None
    assert lector.get("https://sitio.uy/publico").texto == "ok"
    with pytest.raises(NoPermitidoPorRobots):
        lector.get("https://sitio.uy/privado/x")


@respx.mock
def test_detecta_bloqueo_de_acceso_y_se_identifica():
    respx.get("https://bloquea.uy/robots.txt").mock(return_value=httpx.Response(404))
    ruta = respx.get("https://bloquea.uy/lista").mock(return_value=httpx.Response(403, text="Access denied"))
    lector = LectorHttp()
    lector.ritmo.esperar = lambda host: None
    with pytest.raises(BloqueoAcceso, match="bloqueo de acceso"):
        lector.get("https://bloquea.uy/lista")
    assert ruta.calls[0].request.headers["User-Agent"].startswith("RadarEquipos/")
