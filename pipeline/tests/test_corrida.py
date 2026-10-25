"""Corrida completa con dobles en memoria: iniciar → collect → consolidar → prefiltrar → clasificar → cerrar."""

from __future__ import annotations

import copy
import json
from datetime import timedelta
from typing import Any

import pytest
from conftest import AHORA, LectorFalso, leer
from test_logica import SALIDA_OK, ModeloFalso

from radar import etapas
from radar.almacenamiento import Almacen
from radar.clasificacion.gemini import Respuesta
from radar.http import BloqueoAcceso
from radar.modelos import FUENTES
from radar.repositorio import _no_vencido
from radar.semilla import busqueda_inicial, fuentes_iniciales, perfil_inicial, sistema_inicial


class RepoMemoria:
    org_id = "equipos"

    def __init__(self) -> None:
        self.config_docs = {"perfil": perfil_inicial(), "busqueda": busqueda_inicial(), "sistema": sistema_inicial()}
        self.fuentes_docs = fuentes_iniciales()
        self.corridas: dict[str, dict[str, Any]] = {}
        self.ops: dict[str, dict[str, Any]] = {}
        self.usuarios = [{"email": "admin@equipos.com.uy", "rol": "admin"}]

    def config(self, nombre):
        return copy.deepcopy(self.config_docs[nombre])

    def fuentes(self):
        return copy.deepcopy(self.fuentes_docs)

    def fuente(self, fid):
        return copy.deepcopy(self.fuentes_docs.get(fid, {}))

    def actualizar_fuente(self, fid, cambios):
        self.fuentes_docs.setdefault(fid, {}).update(cambios)

    def admins(self):
        return [u["email"] for u in self.usuarios if u["rol"] == "admin"]

    def corrida(self, cid):
        return copy.deepcopy(self.corridas.get(cid, {}))

    def actualizar_corrida(self, cid, cambios):
        _merge(self.corridas.setdefault(cid, {}), cambios)

    def tomar_lock(self, cid, ahora):
        lock = self.corridas.get("actual")
        if lock and lock["corridaId"] != cid and _no_vencido(lock, ahora):
            return False, lock
        self.corridas["actual"] = {"lock": True, "corridaId": cid, "inicio": ahora, "expira": ahora + timedelta(hours=1)}
        return True, self.corridas["actual"]

    def lock(self):
        return self.corridas.get("actual", {})

    def liberar_lock(self, cid):
        if self.corridas.get("actual", {}).get("corridaId") == cid:
            del self.corridas["actual"]

    def corridas_recientes(self, limite=10):
        return [{"id": k, **v} for k, v in self.corridas.items() if k != "actual"][:limite]

    def candidatas_dedup(self, doc_ids, ahora):
        return copy.deepcopy(self.ops)

    def por_etapa(self, etapa):
        return [(k, copy.deepcopy(v)) for k, v in self.ops.items() if v.get("etapa") == etapa and not v.get("manual")]

    def descartes_recientes(self, limite=10):
        return [v for v in self.ops.values() if v.get("estado") == "descartada"][:limite]

    def detectadas_en(self, cid):
        return [{"docId": k, **v} for k, v in self.ops.items() if v.get("detectadoCorrida") == cid]

    def escribir_lote(self, operaciones):
        for accion, doc_id, datos in operaciones:
            if accion == "crear":
                self.ops[doc_id] = copy.deepcopy(datos)
            elif accion == "historial":
                self.ops[doc_id]["historial"] = [*self.ops[doc_id].get("historial", []), *datos["entradas"]]
            else:
                self.ops[doc_id].update(copy.deepcopy(datos))


def _merge(destino: dict, cambios: dict) -> None:
    for k, v in cambios.items():
        if isinstance(v, dict) and isinstance(destino.get(k), dict):
            _merge(destino[k], v)
        else:
            destino[k] = copy.deepcopy(v)


class ModeloPorTitulo:
    """Puntúa alto las encuestas y evaluaciones; bajo el resto."""

    nombre = "gemini-falso"

    def generar(self, sistema, usuario):
        dato = json.loads(usuario.split("<aviso>\n", 1)[1].rsplit("\n</aviso>", 1)[0])
        t = dato["titulo"].lower()
        puntaje = 85 if any(k in t for k in ("encuesta", "evaluación", "evaluation", "survey")) else 45
        return Respuesta(json.dumps({**SALIDA_OK, "puntaje": puntaje}), 3000, 250)


RUTAS = {
    "/ocds/rss/": leer("arce/rss.xml"),
    "/ocds/release/llamado-1378357": leer("arce/llamado-1378357.json"),
    "/ocds/release/llamado-1379001": leer("arce/llamado-1379001.json"),
    "/ocds/release/adjudicacion-1300000": leer("arce/adjudicacion-1300000.json"),
    "detalle?id=D197177": leer("im/D197177.html"),
    "compras-vigentes": leer("im/listado.html"),
    "search/processes": leer("dncp/procesos.json"),
    "project_ctry_name_exact=Uruguay": leer("bm/uruguay.json"),
    "project_ctry_name_exact=Paraguay": leer("bm/paraguay.json"),
    "q=Uruguay": leer("bid/uruguay.json"),
    "q=Paraguay": leer("bid/paraguay.json"),
    "#Uruguay": leer("ungm/uruguay.html"),
    "#Paraguay": "",
    "llamado-13-2026": leer("cnd/llamado-13-2026.html"),
    "cnd.org.uy/": leer("cnd/listado.html"),
    "consultoria-evaluacion-final-proyecto": leer("auci/consultoria-evaluacion-final-proyecto.html"),
    "comunicacion/convocatorias": leer("auci/listado.html"),
    "estudio-cohesion-social-paraguay": leer("fiap/estudio-cohesion-social-paraguay.html"),
    "asistencia-tecnica-colombia": leer("fiap/asistencia-tecnica-colombia.html"),
    "/ofertas/": leer("fiap/listado.html"),
    "ceibal": leer("ceibal/feed.xml"),
}


@pytest.fixture
def servicios(tmp_path):
    repo = RepoMemoria()
    repo.fuentes_docs["bid"]["resourceId"] = "abc"
    correos = []
    s = etapas.Servicios(
        repo=repo,  # type: ignore[arg-type]
        almacen=Almacen(bucket="", raiz_local=str(tmp_path)),
        crear_modelo=lambda nombre: ModeloPorTitulo(),
        crear_lector=lambda metodo: LectorFalso(RUTAS),
        enviar_correo=lambda cid, corrida, cero: correos.append((cid, corrida, cero)),
        reloj=lambda: AHORA,
    )
    s.correos = correos  # type: ignore[attr-defined]
    return s


def correr(s, cid="20261025-060000-programada", saltear=()):
    assert etapas.iniciar(s, cid, "programada", "exec-1") == 0
    for fid in FUENTES:
        if fid not in saltear:
            etapas.recolectar(s, fid, cid)
    for etapa in (etapas.consolidar, etapas.prefiltrar, etapas.clasificar_pendientes):
        assert etapa(s, cid) == 0
    assert etapas.cerrar(s, cid) == 0
    return cid


def test_corrida_completa(servicios):
    s = servicios
    cid = correr(s)
    ops = s.repo.ops
    # dedup: DNCP y BID son el mismo llamado de Paraguay → un solo documento, con la DNCP como fuente oficial
    assert "dncp-445566" in ops and "bid-PR-L1170-P010" not in ops
    assert ops["dncp-445566"]["fuentes"] == ["DNCP Paraguay", "BID"]
    assert ops["ce-1378357"]["relevancia"] == "alta" and ops["ce-1378357"]["etapa"] == "lista"
    assert ops["ce-1378357"]["clasificacion"]["promptVersion"] == "v1"
    corrida = s.repo.corridas[cid]
    assert corrida["estado"] == "ok" and corrida["cerrada"] and "actual" not in s.repo.corridas
    assert corrida["llm"]["tokensEntrada"] > 0 and corrida["llm"]["costoUsd"] > 0
    assert s.repo.fuentes_docs["arce"]["ultimaCorrida"]["estado"] == "ok"
    assert len(s.correos) == 1 and corrida["resumenEnviado"]


def test_repetir_la_corrida_el_mismo_dia_es_idempotente(servicios):
    s = servicios
    cid = correr(s)
    s.repo.ops["ce-1378357"].update({"estado": "analizando", "nota": "lo mira Ana"})
    antes = copy.deepcopy(s.repo.ops)
    correr(s, cid)
    assert set(s.repo.ops) == set(antes)
    assert s.repo.ops["ce-1378357"]["estado"] == "analizando" and s.repo.ops["ce-1378357"]["nota"] == "lo mira Ana"
    assert s.repo.ops["ce-1378357"]["historial"] == antes["ce-1378357"]["historial"]
    assert len(s.correos) == 1  # el resumen no se manda dos veces


def test_una_fuente_caida_no_frena_la_corrida(servicios):
    s = servicios

    def lector(metodo):
        class Bloqueado(LectorFalso):
            def get(self, url, **kw):
                if "ungm" in url:
                    raise BloqueoAcceso("bloqueo de acceso: www.ungm.org respondió 403")
                return super().get(url, **kw)

            def post(self, url, **kw):
                raise BloqueoAcceso("bloqueo de acceso: www.ungm.org respondió 403")

        return Bloqueado(RUTAS)

    s.crear_lector = lector
    cid = correr(s, saltear=("cnd",))  # cnd: el collector ni terminó
    corrida = s.repo.corridas[cid]
    assert corrida["estado"] == "parcial"
    assert corrida["fuentes"]["ungm"]["estado"] == "bloqueo"
    assert corrida["fuentes"]["cnd"]["estado"] == "error"
    assert s.repo.fuentes_docs["ungm"]["ultimaCorrida"]["error"].startswith("bloqueo de acceso")
    assert "ce-1378357" in s.repo.ops


def test_fuente_apagada_se_omite_y_gemini_caido_deja_sin_clasificar(servicios):
    s = servicios
    s.repo.fuentes_docs["fiap"]["activa"] = False
    s.crear_modelo = lambda nombre: ModeloFalso([TimeoutError("timeout")] * 100)
    cid = correr(s)
    assert s.repo.corridas[cid]["fuentes"]["fiap"]["estado"] == "omitida"
    assert s.repo.corridas[cid]["estado"] == "ok"
    pendiente = s.repo.ops["ce-1378357"]
    assert pendiente["relevancia"] == "sin_clasificar" and pendiente["etapa"] == "clasificar"
    # en la corrida siguiente se reintenta
    s.crear_modelo = lambda nombre: ModeloPorTitulo()
    etapas.clasificar_pendientes(s, "otra")
    assert s.repo.ops["ce-1378357"]["relevancia"] == "alta"


def test_lock_rechaza_una_segunda_corrida(servicios):
    s = servicios
    assert etapas.iniciar(s, "c-uno", "programada") == 0
    assert etapas.iniciar(s, "c-dos", "manual") == etapas.EXIT_LOCK
    assert etapas.iniciar(s, "c-uno", "programada") == 0  # la misma corrida puede reintentar
    etapas.cerrar(s, "c-uno", fallo="clasificar: prueba")
    assert s.repo.corridas["c-uno"]["estado"] == "error"
    assert etapas.iniciar(s, "c-dos", "manual") == 0


def test_cero_avisos_tres_dias_seguidos(servicios, capsys):
    s = servicios
    s.repo.fuentes_docs["auci"]["ceroConsecutivos"] = 2
    s.crear_lector = lambda metodo: LectorFalso({**RUTAS, "comunicacion/convocatorias": "<html></html>"})
    correr(s)
    assert s.repo.fuentes_docs["auci"]["ceroConsecutivos"] == 3
    assert '"evento": "fuente_cero_3_dias"' in capsys.readouterr().out


def test_agente_local(servicios):
    s = servicios
    s.repo.fuentes_docs["ceibal"]["metodo"] = "agente_local"
    from radar.herramientas import agente

    assert agente(s) == 0
    cid = correr(s)
    assert s.repo.corridas[cid]["fuentes"]["ceibal"]["metodo"] == "agente_local"
    assert s.repo.corridas[cid]["fuentes"]["ceibal"]["estado"] == "ok"
    assert "ceibal-8812" in s.repo.ops


def test_verificar(servicios, capsys):
    s = servicios
    etapas.verificar(s)
    assert "sin_corrida_exitosa" in capsys.readouterr().out
    correr(s)
    etapas.verificar(s)
    assert "verificar_ok" in capsys.readouterr().out
