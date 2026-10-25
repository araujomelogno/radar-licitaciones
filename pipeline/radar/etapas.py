"""Etapas de la corrida diaria (RF-01). Cada una es idempotente.

iniciar → collect (una por fuente, en paralelo) → consolidar → prefiltrar → clasificar → cerrar

Las etapas solo usan los métodos de `Repositorio` y `Almacen`, así se pueden
testear con dobles en memoria.
"""

from __future__ import annotations

import traceback
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from . import dedup, logs, prefiltro
from .ajustes import ajustes
from .almacenamiento import Almacen
from .clasificacion import PROMPT_VERSION, Modelo, clasificar, costo_usd
from .collectors import COLLECTORS, Contexto
from .http import BloqueoAcceso, ErrorFuente, Lector, lector_para
from .modelos import FUENTES, AvisoNormalizado, relevancia_de
from .repositorio import Repositorio

TZ = ZoneInfo("America/Montevideo")
ESTADOS_FALLA = ("error", "bloqueo")
HORAS_SIN_CORRIDA = 26
DIAS_CERO_ALERTA = 3

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_LOCK = 3


def ahora() -> datetime:
    return datetime.now(UTC)


def fecha_local(dt: datetime | None = None) -> str:
    return (dt or ahora()).astimezone(TZ).strftime("%Y-%m-%d")


def nuevo_corrida_id(disparo: str, dt: datetime | None = None) -> str:
    return f"{(dt or ahora()).astimezone(TZ).strftime('%Y%m%d-%H%M%S')}-{disparo}"


@dataclass
class Servicios:
    repo: Repositorio
    almacen: Almacen
    crear_modelo: Callable[[str], Modelo] | None = None
    crear_lector: Callable[[str], Lector] = field(default=lector_para)
    enviar_correo: Callable[..., None] | None = None
    reloj: Callable[[], datetime] = field(default=ahora)


# ── 1. iniciar ────────────────────────────────────────────────────────────────

def iniciar(s: Servicios, corrida_id: str, disparo: str, ejecucion: str = "", solicitado_por: str = "") -> int:
    t = s.reloj()
    tomado, lock = s.repo.tomar_lock(corrida_id, t)
    if not tomado:
        inicio = lock.get("inicio")
        hora = inicio.astimezone(TZ).strftime("%H:%M") if isinstance(inicio, datetime) else "?"
        logs.aviso(f"ya hay una corrida en curso, empezó a las {hora}", evento="corrida_rechazada",
                   corridaEnCurso=lock.get("corridaId"))
        return EXIT_LOCK
    previa = s.repo.corrida(corrida_id)
    perfil = s.repo.config("perfil")
    busqueda = s.repo.config("busqueda")
    s.repo.actualizar_corrida(corrida_id, {
        "inicio": previa.get("inicio") or lock.get("inicio") or t,
        "fin": None,
        "estado": "en_curso",
        "disparo": disparo,
        "solicitadoPor": solicitado_por or previa.get("solicitadoPor") or None,
        "ejecucion": ejecucion or previa.get("ejecucion") or None,
        "configVersion": {"perfil": perfil.get("version", 0), "busqueda": busqueda.get("version", 0)},
    })
    logs.info("corrida iniciada", evento="corrida_iniciada", disparo=disparo)
    return EXIT_OK


# ── 2. collect ────────────────────────────────────────────────────────────────

def _resultado_fuente(s: Servicios, corrida_id: str, fuente_id: str, datos: dict[str, Any]) -> None:
    s.repo.actualizar_corrida(corrida_id, {"fuentes": {fuente_id: datos}})


def recolectar(s: Servicios, fuente_id: str, corrida_id: str) -> int:
    logs.contexto(fuente=fuente_id)
    if fuente_id not in COLLECTORS:
        logs.error(f"fuente desconocida: {fuente_id}")
        return EXIT_ERROR
    cfg = {**_config_fuente_defecto(fuente_id), **s.repo.fuente(fuente_id)}
    t = s.reloj()
    if not cfg.get("activa", True) or cfg.get("metodo") in ("agente_local", "manual"):
        motivo = "apagada" if not cfg.get("activa", True) else f"método {cfg.get('metodo')}"
        _resultado_fuente(s, corrida_id, fuente_id, {"estado": "omitida", "detalle": motivo, "leidos": 0})
        logs.info(f"fuente omitida ({motivo})")
        return EXIT_OK

    busqueda = s.repo.config("busqueda")
    ctx = Contexto(ahora=t, ventana_dias=int(cfg.get("ventanaDias") or busqueda.get("ventanaDias") or 7),
                   config=cfg, dncp_token=_token_dncp())
    collector = COLLECTORS[fuente_id](ctx)
    inicio = s.reloj()
    lector = None
    try:
        lector = s.crear_lector(cfg.get("metodo") or "http")
        crudo = collector.fetch(lector)
        ref = s.almacen.escribir(Almacen.ruta_crudo(fuente_id, fecha_local(t)), crudo)
        avisos = collector.parse(crudo, ref)
        s.almacen.guardar_avisos(Almacen.ruta_normalizados(corrida_id, fuente_id), avisos)
    except BloqueoAcceso as e:
        _falla_fuente(s, corrida_id, fuente_id, "bloqueo", str(e), inicio)
        return EXIT_ERROR
    except Exception as e:  # ErrorFuente o un error de parseo: la fuente queda en error
        detalle = str(e) if isinstance(e, ErrorFuente) else f"{type(e).__name__}: {e}"
        _falla_fuente(s, corrida_id, fuente_id, "error", detalle[:500], inicio, traceback.format_exc())
        return EXIT_ERROR
    finally:
        if lector is not None:
            lector.cerrar()
    _resultado_fuente(s, corrida_id, fuente_id, {
        "estado": "ok", "leidos": len(avisos), "inicio": inicio, "fin": s.reloj(), "error": None,
        "metodo": cfg.get("metodo") or "http",
    })
    logs.info(f"{len(avisos)} avisos leídos", evento="fuente_ok", leidos=len(avisos))
    return EXIT_OK


def _falla_fuente(s: Servicios, corrida_id: str, fuente_id: str, estado: str, detalle: str,
                  inicio: datetime, traza: str = "") -> None:
    _resultado_fuente(s, corrida_id, fuente_id, {
        "estado": estado, "leidos": 0, "inicio": inicio, "fin": s.reloj(), "error": detalle,
    })
    logs.error(detalle, evento="fuente_error", estadoFuente=estado, traza=traza[-2000:] or None)


def marcar_fuente(s: Servicios, corrida_id: str, fuente_id: str, estado: str, detalle: str) -> int:
    """La usa el workflow cuando un collector agotó sus reintentos sin poder registrar su falla."""
    previo = (s.repo.corrida(corrida_id).get("fuentes") or {}).get(fuente_id) or {}
    if previo.get("estado") in ESTADOS_FALLA:
        estado = previo["estado"]  # conserva “bloqueo”, que es más específico
        detalle = previo.get("error") or detalle
    _resultado_fuente(s, corrida_id, fuente_id, {**previo, "estado": estado, "error": detalle[:500],
                                                  "reintentosAgotados": True})
    logs.error(f"{fuente_id}: {detalle}", evento="fuente_error", fuente=fuente_id)
    return EXIT_OK


def _token_dncp() -> str:
    token = ajustes().dncp_token.strip()
    return "" if token.lower() in ("", "ninguno", "none") else token


def _config_fuente_defecto(fuente_id: str) -> dict[str, Any]:
    f = FUENTES[fuente_id]
    return {"nombre": f.nombre, "activa": True, "metodo": "http", "url": f.url}


# ── 3. consolidar ─────────────────────────────────────────────────────────────

def _avisos_de_la_corrida(s: Servicios, corrida_id: str, t: datetime) -> tuple[list[tuple[str, AvisoNormalizado]], dict[str, int]]:
    avisos: list[tuple[str, AvisoNormalizado]] = []
    del_agente: dict[str, int] = {}
    for ruta in s.almacen.listar(f"normalizados/{corrida_id}/"):
        fid = ruta.rsplit("/", 1)[-1].removesuffix(".json")
        avisos += [(fid, a) for a in s.almacen.leer_avisos(ruta)]
    for ruta in s.almacen.listar(f"normalizados/agente/{fecha_local(t)}/"):
        fid = ruta.rsplit("/", 1)[-1].removesuffix(".json")
        if any(f == fid for f, _ in avisos):
            continue  # la nube ya la leyó en esta corrida
        leidos = s.almacen.leer_avisos(ruta)
        avisos += [(fid, a) for a in leidos]
        del_agente[fid] = len(leidos)
    return avisos, del_agente


def consolidar(s: Servicios, corrida_id: str) -> int:
    t = s.reloj()
    avisos, del_agente = _avisos_de_la_corrida(s, corrida_id, t)
    existentes = s.repo.candidatas_dedup([a.docId for _, a in avisos], t)
    plan = dedup.consolidar(avisos, existentes, corrida_id, t, s.repo.org_id)

    operaciones: list[tuple[str, str, dict[str, Any]]] = []
    operaciones += [("crear", k, v) for k, v in plan.crear.items()]
    operaciones += [("actualizar", k, v) for k, v in plan.actualizar.items()]
    operaciones += [("historial", k, {"entradas": v}) for k, v in plan.historial.items()]
    s.repo.escribir_lote(operaciones)

    fuentes_corrida: dict[str, Any] = {}
    for fid, c in plan.conteos.items():
        datos: dict[str, Any] = {"nuevos": c["nuevos"], "actualizados": c["actualizados"],
                                 "fusionados": c["fusionados"], "leidos": c["leidos"]}
        if fid in del_agente:
            datos.update({"estado": "ok", "metodo": "agente_local", "error": None})
        fuentes_corrida[fid] = datos
    for fid, n in del_agente.items():
        if n == 0:
            fuentes_corrida[fid] = {"estado": "ok", "metodo": "agente_local", "leidos": 0, "nuevos": 0,
                                    "actualizados": 0, "fusionados": 0, "error": None}
    totales = Counter()
    for c in plan.conteos.values():
        totales.update(c)
    s.repo.actualizar_corrida(corrida_id, {"fuentes": fuentes_corrida, "totales": dict(totales)})
    logs.info("consolidación terminada", evento="consolidar", **{k: int(v) for k, v in totales.items()})
    return EXIT_OK


# ── 4. prefiltrar ─────────────────────────────────────────────────────────────

def prefiltrar(s: Servicios, corrida_id: str) -> int:
    busqueda = s.repo.config("busqueda")
    perfil = s.repo.config("perfil")
    t = s.reloj()
    cambios: list[tuple[str, str, dict[str, Any]]] = []
    descartados = pasan = 0
    for doc_id, doc in s.repo.por_etapa("prefiltro"):
        r = prefiltro.evaluar({**doc, "docId": doc_id}, busqueda, perfil, prefiltro.fuente_id_de({"docId": doc_id}))
        if r.paso:
            pasan += 1
            cambios.append(("actualizar", doc_id, {"prefiltro": {"paso": True, "regla": None}, "etapa": "clasificar"}))
        else:
            descartados += 1
            cambios.append(("actualizar", doc_id, {
                "prefiltro": {"paso": False, "regla": r.regla}, "etapa": "lista", "relevancia": "baja",
                "puntaje": None, "motivo": r.motivo, "actualizado": t,
            }))
    s.repo.escribir_lote(cambios)
    s.repo.actualizar_corrida(corrida_id, {"totales": {"prefiltrados": descartados, "alLLM": pasan}})
    logs.info("prefiltro terminado", evento="prefiltro", descartados=descartados, pasan=pasan)
    return EXIT_OK


# ── 5. clasificar ─────────────────────────────────────────────────────────────

def clasificar_pendientes(s: Servicios, corrida_id: str, hilos: int = 6) -> int:
    if s.crear_modelo is None:
        raise RuntimeError("falta el modelo de clasificación")
    sistema = s.repo.config("sistema")
    perfil = s.repo.config("perfil")
    busqueda = s.repo.config("busqueda")
    umbrales = busqueda.get("umbrales") or {"alta": 70, "media": 40}
    pendientes = s.repo.por_etapa("clasificar")
    if not pendientes:
        s.repo.actualizar_corrida(corrida_id, {"totales": {"clasificados": 0, "sinClasificar": 0}})
        return EXIT_OK
    modelo = s.crear_modelo(sistema.get("modelo") or "gemini-3.1-flash-lite")
    descartes = s.repo.descartes_recientes(10)

    def uno(par: tuple[str, dict[str, Any]]) -> tuple[str, Any]:
        return par[0], clasificar(modelo, par[1], perfil, descartes)

    with ThreadPoolExecutor(max_workers=hilos) as ex:
        resultados = list(ex.map(uno, pendientes))

    t = s.reloj()
    cambios: list[tuple[str, str, dict[str, Any]]] = []
    ok = fallas = tin = tout = 0
    for doc_id, r in resultados:
        tin += r.tokens_entrada
        tout += r.tokens_salida
        meta = {"modelo": modelo.nombre, "promptVersion": PROMPT_VERSION, "fecha": t, "intentos": r.intentos}
        if r.salida is None:
            fallas += 1
            cambios.append(("actualizar", doc_id, {
                "relevancia": "sin_clasificar", "etapa": "clasificar", "clasificacion": {**meta, "error": r.error},
            }))
            logs.aviso(f"{doc_id} quedó sin clasificar: {r.error}", evento="sin_clasificar", docId=doc_id)
            continue
        ok += 1
        o = r.salida
        cambios.append(("actualizar", doc_id, {
            "puntaje": o.puntaje,
            "relevancia": relevancia_de(o.puntaje, umbrales),
            "resumen": o.resumen,
            "motivo": o.motivo,
            "servicios": list(o.servicios),
            "clasificacion": {**meta, "confianza": o.confianza, "esInvestigacion": o.esInvestigacion, "error": None},
            "etapa": "lista",
            "actualizado": t,
        }))
    s.repo.escribir_lote(cambios)
    costo = costo_usd(tin, tout, sistema.get("precios") or {})
    s.repo.actualizar_corrida(corrida_id, {
        "totales": {"clasificados": ok, "sinClasificar": fallas},
        "llm": {"modelo": modelo.nombre, "promptVersion": PROMPT_VERSION, "llamadas": len(resultados),
                "tokensEntrada": tin, "tokensSalida": tout, "costoUsd": costo},
    })
    logs.info("clasificación terminada", evento="clasificar", clasificados=ok, sinClasificar=fallas,
              tokensEntrada=tin, tokensSalida=tout, costoUsd=costo)
    return EXIT_OK


def reclasificar_abiertas(s: Servicios) -> int:
    """P1: vuelve a mandar al clasificador las abiertas no manuales (después de cambiar el perfil)."""
    t = s.reloj()
    cambios = [
        ("actualizar", doc_id, {"etapa": "clasificar"})
        for doc_id, doc in s.repo.por_etapa("lista")
        if (doc.get("prefiltro") or {}).get("paso") and doc.get("estado") not in ("descartada", "ganada", "perdida")
        and (doc.get("cierre") is None or doc["cierre"] > t)
    ]
    s.repo.escribir_lote(cambios)
    logs.info(f"{len(cambios)} oportunidades abiertas vuelven a clasificarse")
    return EXIT_OK


# ── 6. cerrar ─────────────────────────────────────────────────────────────────

def cerrar(s: Servicios, corrida_id: str, fallo: str | None = None) -> int:
    t = s.reloj()
    try:
        corrida = s.repo.corrida(corrida_id)
        config_fuentes = s.repo.fuentes()
        resultados = dict(corrida.get("fuentes") or {})
        alertas_cero: list[str] = []
        for fid, fuente in FUENTES.items():
            cfg = {**_config_fuente_defecto(fid), **config_fuentes.get(fid, {})}
            r = dict(resultados.get(fid) or {})
            if not r:
                if not cfg.get("activa", True) or cfg.get("metodo") == "manual":
                    r = {"estado": "omitida", "leidos": 0}
                else:
                    r = {"estado": "error", "leidos": 0, "error": "sin resultado: el collector no terminó"}
            elif cfg.get("metodo") == "agente_local" and cfg.get("activa", True) and r.get("estado") == "omitida":
                r = {**r, "estado": "error", "error": "el agente local no entregó datos hoy"}
            resultados[fid] = r
            if r["estado"] == "omitida":
                cero = cfg.get("ceroConsecutivos", 0)
            elif r["estado"] in ESTADOS_FALLA or not r.get("leidos"):
                cero = int(cfg.get("ceroConsecutivos") or 0) + (0 if corrida.get("cerrada") else 1)
            else:
                cero = 0
            if cero >= DIAS_CERO_ALERTA and r["estado"] != "omitida":
                alertas_cero.append(fid)
                logs.aviso(f"{fuente.nombre} trae 0 avisos hace {cero} días", evento="fuente_cero_3_dias",
                           fuente=fid, dias=cero)
            s.repo.actualizar_fuente(fid, {
                "ultimaCorrida": {
                    "corridaId": corrida_id, "inicio": r.get("inicio") or corrida.get("inicio"),
                    "fin": r.get("fin") or t, "estado": r["estado"], "leidos": r.get("leidos", 0),
                    "nuevos": r.get("nuevos", 0), "actualizados": r.get("actualizados", 0),
                    "error": r.get("error"),
                },
                "ceroConsecutivos": cero,
            })

        fallidas = sorted(fid for fid, r in resultados.items() if r.get("estado") in ESTADOS_FALLA)
        estado = "error" if fallo else ("parcial" if fallidas else "ok")
        s.repo.actualizar_corrida(corrida_id, {
            "fuentes": resultados, "fin": t, "estado": estado, "fallo": fallo, "cerrada": True,
            "fuentesConFalla": fallidas, "fuentesEnCero": alertas_cero,
        })
        logs.info(f"corrida cerrada: {estado}", evento="corrida_cerrada", estado=estado,
                  fuentesConFalla=fallidas)

        if not corrida.get("resumenEnviado") and s.enviar_correo is not None:
            try:
                s.enviar_correo(corrida_id, {**corrida, "fuentes": resultados, "estado": estado, "fallo": fallo},
                                alertas_cero)
                s.repo.actualizar_corrida(corrida_id, {"resumenEnviado": True})
            except Exception as e:
                logs.error(f"no se pudo enviar el resumen: {e}", evento="resumen_error")
    finally:
        s.repo.liberar_lock(corrida_id)
    return EXIT_OK


# ── verificación diaria (alerta “sin corrida exitosa en 26 h”) ───────────────

def verificar(s: Servicios) -> int:
    t = s.reloj()
    limite = t - timedelta(hours=HORAS_SIN_CORRIDA)
    for c in s.repo.corridas_recientes(15):
        fin = c.get("fin")
        if c.get("estado") in ("ok", "parcial") and isinstance(fin, datetime) and fin >= limite:
            logs.info("hay corrida exitosa reciente", evento="verificar_ok", ultima=c["id"])
            return EXIT_OK
    logs.error(f"no hubo corrida exitosa en {HORAS_SIN_CORRIDA} horas", evento="sin_corrida_exitosa")
    return EXIT_OK
