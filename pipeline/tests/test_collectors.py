"""Cada collector: fetch (con un lector falso) → parse → AvisoNormalizado[]."""

from __future__ import annotations

from datetime import datetime

from conftest import AHORA, LectorFalso, leer, leer_json

from radar.collectors import COLLECTORS, Contexto
from radar.collectors.arce import Arce
from radar.collectors.auci import Auci
from radar.collectors.bid import Bid
from radar.collectors.bm import BancoMundial
from radar.collectors.ceibal import Ceibal
from radar.collectors.cnd import Cnd
from radar.collectors.dncp import Dncp
from radar.collectors.fiap import Fiap
from radar.collectors.im import IntendenciaMontevideo
from radar.collectors.ungm import Ungm
from radar.modelos import FUENTES


def correr(collector, lector):
    crudo = collector.fetch(lector)
    return collector.parse(crudo, "gs://bucket/raw/x/2026-10-25.json")


def test_registro_tiene_las_10_fuentes():
    assert set(COLLECTORS) == set(FUENTES) == {"arce", "im", "dncp", "bm", "bid", "ungm", "cnd", "auci", "fiap", "ceibal"}


def test_arce(ctx):
    lector = LectorFalso({
        "/ocds/rss/": leer("arce/rss.xml"),
        "/ocds/release/llamado-1378357": leer("arce/llamado-1378357.json"),
        "/ocds/release/llamado-1379001": leer("arce/llamado-1379001.json"),
        "/ocds/release/adjudicacion-1300000": leer("arce/adjudicacion-1300000.json"),
    })
    avisos = {a.docId: a for a in correr(Arce(ctx), lector)}
    assert set(avisos) == {"ce-1378357", "ce-1379001"}  # sin adjudicaciones ni avisos fuera de ventana
    a = avisos["ce-1378357"]
    assert a.fuente == "Compras Estatales"
    assert a.titulo.startswith("Licitación Abreviada 45/2026 · Contratación de una firma consultora")
    assert a.organismo == "Ministerio de Desarrollo Social"
    assert a.pais == "Uruguay" and a.moneda == "UYU" and a.monto == 4_500_000
    assert a.cierre.isoformat() == "2026-11-14T14:00:00-03:00"
    assert a.crudoRef.startswith("gs://")
    assert "45/2026" in a.referencias
    utec = avisos["ce-1379001"]
    assert utec.fuente == "UTEC"
    # cierre sin hora: 23:59 hora local del organismo
    assert utec.cierre.isoformat() == "2026-11-05T23:59:00-03:00"
    assert not any("llamado-1200000" in p for p in lector.pedidos)


def test_intendencia_montevideo(ctx):
    lector = LectorFalso({
        "detalle?id=D197177": leer("im/D197177.html"),
        "compras-vigentes": leer("im/listado.html"),
    })
    avisos = correr(IntendenciaMontevideo(ctx), lector)
    assert [a.docId for a in avisos] == ["im-D197177"]  # las luminarias quedan afuera por rubro
    a = avisos[0]
    assert a.organismo == "Intendencia de Montevideo — Movilidad"
    assert a.cierre.isoformat() == "2026-11-10T11:00:00-03:00"
    assert a.monto == 1_200_000 and a.moneda == "UYU"


def test_dncp(ctx):
    lector = LectorFalso({"search/processes": leer("dncp/procesos.json")})
    avisos = correr(Dncp(ctx), lector)
    assert [a.docId for a in avisos] == ["dncp-445566"]  # el cancelado no entra
    a = avisos[0]
    assert a.pais == "Paraguay" and a.moneda == "PYG" and a.monto == 850_000_000
    assert a.financiador == "BID"
    assert a.admiteExtranjeras is True
    assert a.cierre.isoformat() == "2026-11-20T10:00:00-03:00"


def test_dncp_usa_token_si_hay():
    vistos = {}

    class Lector(LectorFalso):
        def get(self, url, *, params=None, headers=None, encoding=None):
            vistos.update(headers or {})
            return super().get(url, params=params, headers=headers, encoding=encoding)

    Dncp(Contexto(ahora=AHORA, dncp_token="secreto")).fetch(Lector({"search/processes": {"records": []}}))
    assert vistos["Authorization"] == "Bearer secreto"


def test_banco_mundial(ctx):
    lector = LectorFalso({
        "project_ctry_name_exact=Uruguay": leer("bm/uruguay.json"),
        "project_ctry_name_exact=Paraguay": leer("bm/paraguay.json"),
    })
    avisos = correr(BancoMundial(ctx), lector)
    assert [a.docId for a in avisos] == ["bm-OP00473712"]  # la adjudicación no entra
    a = avisos[0]
    assert a.tipo == "expresion_interes"
    assert a.idioma == "en"
    assert a.cierre.isoformat() == "2026-11-10T17:00:00+00:00"
    assert "P178901" in a.referencias
    assert "<p>" not in a.texto


def test_bid(ctx):
    ctx.config = {"resourceId": "abc"}
    lector = LectorFalso({"q=Uruguay": leer("bid/uruguay.json"), "q=Paraguay": leer("bid/paraguay.json")})
    avisos = {a.docId: a for a in correr(Bid(ctx), lector)}
    assert set(avisos) == {"bid-UR-L1180-P003", "bid-PR-L1170-P010"}  # Argentina queda afuera
    assert avisos["bid-PR-L1170-P010"].pais == "Paraguay"
    assert avisos["bid-UR-L1180-P003"].tipo == "expresion_interes"


def test_bid_sin_resource_id_falla_con_mensaje(ctx):
    import pytest

    from radar.http import ErrorFuente

    with pytest.raises(ErrorFuente, match="resourceId"):
        Bid(ctx).fetch(LectorFalso({}))


def test_ungm(ctx):
    lector = LectorFalso({"#Uruguay": leer("ungm/uruguay.html"), "#Paraguay": leer("ungm/paraguay.html")})
    avisos = correr(Ungm(ctx), lector)
    assert [a.docId for a in avisos] == ["ungm-255001"]  # Chile queda afuera
    a = avisos[0]
    assert a.organismo == "UNFPA"
    assert a.cierre.date().isoformat() == "2026-11-14"
    assert a.url == "https://www.ungm.org/Public/Notice/255001"


def test_cnd(ctx):
    lector = LectorFalso({"llamado-13-2026": leer("cnd/llamado-13-2026.html"), "cnd.org.uy/": leer("cnd/listado.html")})
    avisos = correr(Cnd(ctx), lector)
    assert [a.docId for a in avisos] == ["cnd-llamado-13-2026"]
    assert avisos[0].cierre.isoformat() == "2026-11-07T15:00:00-03:00"


def test_auci(ctx):
    lector = LectorFalso({
        "consultoria-evaluacion-final-proyecto": leer("auci/consultoria-evaluacion-final-proyecto.html"),
        "convocatorias": leer("auci/listado.html"),
    })
    avisos = correr(Auci(ctx), lector)
    assert [a.docId for a in avisos] == ["auci-consultoria-evaluacion-final-proyecto"]  # sin becas ni no vigentes
    assert avisos[0].cierre.date().isoformat() == "2026-11-05"


def test_fiap(ctx):
    lector = LectorFalso({
        "estudio-cohesion-social-paraguay": leer("fiap/estudio-cohesion-social-paraguay.html"),
        "asistencia-tecnica-colombia": leer("fiap/asistencia-tecnica-colombia.html"),
        "/ofertas/": leer("fiap/listado.html"),
    })
    avisos = correr(Fiap(ctx), lector)
    assert [a.docId for a in avisos] == ["fiap-estudio-cohesion-social-paraguay"]
    a = avisos[0]
    assert a.pais == "Paraguay" and a.moneda == "EUR" and a.monto == 45_000
    assert a.financiador == "UE"


def test_ceibal(ctx):
    avisos = correr(Ceibal(ctx), LectorFalso({"ceibal": leer("ceibal/feed.xml")}))
    assert [a.docId for a in avisos] == ["ceibal-8812"]  # sin laptops ni cursos
    assert avisos[0].cierre.isoformat() == "2026-11-12T11:00:00-03:00"


def test_parse_no_usa_la_red(ctx):
    """El crudo guardado alcanza para reprocesar: parse no necesita lector."""
    crudo = {"respuestas": {"Uruguay": leer_json("bm/uruguay.json"), "Paraguay": {"procnotices": []}}}
    avisos = BancoMundial(ctx).parse(crudo, "ref")
    assert len(avisos) == 1 and isinstance(avisos[0].publicado, datetime)
