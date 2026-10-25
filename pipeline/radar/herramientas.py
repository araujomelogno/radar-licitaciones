"""Herramientas fuera de la corrida: prueba de acceso, agente local, evaluación, seed y primer admin."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import logs
from .almacenamiento import Almacen
from .clasificacion import Modelo, clasificar
from .collectors import COLLECTORS, Contexto
from .etapas import Servicios, _token_dncp, fecha_local
from .http import BloqueoAcceso, ErrorFuente, LectorHttp, LectorNavegador
from .modelos import FUENTES, relevancia_de
from .semilla import busqueda_inicial, fuentes_iniciales, perfil_inicial, sistema_inicial

# ── RF-13: prueba de acceso desde la nube (semana 1) ─────────────────────────


def _probar(crear_lector: Any, url: str) -> tuple[str, str]:
    lector = None
    try:
        lector = crear_lector()
        r = lector.get(url)
        return "ok", f"HTTP {r.status}, {len(r.contenido)} bytes"
    except BloqueoAcceso as e:
        return "bloqueo", str(e)
    except ErrorFuente as e:
        return "error", str(e)
    except Exception as e:
        return "error", f"{type(e).__name__}: {e}"
    finally:
        if lector is not None:
            lector.cerrar()


def probar_acceso(s: Servicios, fuentes: list[str] | None = None, navegador: bool = True) -> int:
    """Prueba cada fuente con HTTP simple y con navegador sin interfaz, y guarda el resultado en `fuentes`."""
    tabla = []
    for fid in fuentes or list(FUENTES):
        url = {**{"url": FUENTES[fid].url}, **s.repo.fuente(fid)}.get("url") or FUENTES[fid].url
        http, det_http = _probar(LectorHttp, url)
        nav, det_nav = ("pendiente", "")
        if navegador:
            nav, det_nav = _probar(LectorNavegador, url)
        resultado = {"http": http, "navegador": nav, "fecha": datetime.now(UTC),
                     "detalle": f"HTTP: {det_http} · Navegador: {det_nav or 'no probado'}"}
        s.repo.actualizar_fuente(fid, {"pruebaAcceso": resultado})
        tabla.append({"fuente": fid, "http": http, "navegador": nav})
        logs.info(f"prueba de acceso {fid}: http={http} navegador={nav}", evento="prueba_acceso", fuente=fid,
                  http=http, navegador=nav)
    print(json.dumps(tabla, ensure_ascii=False, indent=2))
    return 0


# ── RF-13: agente local en la oficina ────────────────────────────────────────


def agente(s: Servicios, fuentes: list[str] | None = None) -> int:
    """Corre los collectors con método `agente_local` y deja los avisos para la corrida de las 06:00.

    Escribe `normalizados/agente/{fecha}/{fuente}.json` en Cloud Storage con una
    cuenta de servicio; la etapa `consolidar` de la corrida diaria los incorpora.
    """
    config = s.repo.fuentes()
    elegidas = fuentes or [fid for fid, c in config.items() if c.get("metodo") == "agente_local" and c.get("activa")]
    if not elegidas:
        logs.info("no hay fuentes con método agente_local")
        return 0
    busqueda = s.repo.config("busqueda")
    hoy = fecha_local(s.reloj())
    codigo = 0
    for fid in elegidas:
        logs.contexto(fuente=fid)
        cfg = {"url": FUENTES[fid].url, **config.get(fid, {})}
        ctx = Contexto(ahora=s.reloj(), ventana_dias=int(busqueda.get("ventanaDias") or 7), config=cfg,
                       dncp_token=_token_dncp())
        collector = COLLECTORS[fid](ctx)
        lector = s.crear_lector(cfg.get("metodoAgente") or "navegador")
        try:
            crudo = collector.fetch(lector)
            ref = s.almacen.escribir(Almacen.ruta_crudo(fid, hoy), crudo)
            avisos = collector.parse(crudo, ref)
            s.almacen.guardar_avisos(Almacen.ruta_agente(hoy, fid), avisos)
            logs.info(f"agente local: {len(avisos)} avisos", evento="agente_ok", leidos=len(avisos))
        except Exception as e:
            codigo = 1
            logs.error(f"agente local: {e}", evento="fuente_error")
        finally:
            lector.cerrar()
    return codigo


# ── RF-06: set etiquetado (CI) ───────────────────────────────────────────────


def evaluar(modelo: Modelo, ruta_set: Path, minimo: float, perfil: dict[str, Any] | None = None,
            umbrales: dict[str, int] | None = None) -> tuple[float, list[dict[str, Any]]]:
    """Acuerdo alta / no alta entre el clasificador y el set etiquetado por el equipo."""
    perfil = perfil or perfil_inicial()
    umbrales = umbrales or {"alta": 70, "media": 40}
    filas = [json.loads(x) for x in ruta_set.read_text(encoding="utf-8").splitlines() if x.strip()]
    detalle = []
    aciertos = 0
    for f in filas:
        r = clasificar(modelo, f["aviso"], perfil, [])
        predicha = relevancia_de(r.salida.puntaje, umbrales) if r.salida else "sin_clasificar"
        acierto = (predicha == "alta") == (f["etiqueta"] == "alta")
        aciertos += acierto
        detalle.append({"id": f.get("id"), "etiqueta": f["etiqueta"], "predicha": predicha,
                        "puntaje": r.salida.puntaje if r.salida else None, "acierto": acierto})
    acuerdo = aciertos / len(filas) if filas else 0.0
    return acuerdo, detalle


# ── arranque ────────────────────────────────────────────────────────────────


def seed(db: Any, org_id: str) -> list[str]:
    """Crea config y fuentes si no existen. No pisa lo editado."""
    creados = []
    ahora = datetime.now(UTC)
    for nombre, datos in (("perfil", perfil_inicial()), ("busqueda", busqueda_inicial()),
                          ("sistema", sistema_inicial())):
        ref = db.collection("config").document(nombre)
        if not ref.get().exists:
            ref.set({**datos, "orgId": org_id, "actualizado": ahora, "actualizadoPor": "seed"})
            creados.append(f"config/{nombre}")
    for fid, datos in fuentes_iniciales().items():
        ref = db.collection("fuentes").document(fid)
        if not ref.get().exists:
            ref.set({**datos, "orgId": org_id})
            creados.append(f"fuentes/{fid}")
    return creados


def bootstrap_admin(email: str, proyecto: str, db: Any, org_id: str, dominio: str = "equipos.com.uy") -> str:
    """Crea el primer admin: usuario en Firebase Auth (si no existe), claims y `usuarios/{uid}`."""
    if not email.lower().endswith("@" + dominio):
        raise SystemExit(f"el admin tiene que tener una cuenta @{dominio}")
    import firebase_admin
    from firebase_admin import auth

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": proyecto} if proyecto else None)
    try:
        usuario = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        usuario = auth.create_user(email=email, email_verified=True)
    auth.set_custom_user_claims(usuario.uid, {"rol": "admin", "orgId": org_id})
    ahora = datetime.now(UTC)
    db.collection("usuarios").document(usuario.uid).set({
        "email": email.lower(), "rol": "admin", "orgId": org_id, "claimsActualizados": ahora,
        "creado": ahora,
    }, merge=True)
    db.collection("auditoria").add({
        "fecha": ahora, "autor": "bootstrap", "coleccion": "usuarios", "docId": usuario.uid,
        "accion": "asignar_rol", "cambios": {"rol": {"de": None, "a": "admin"}}, "orgId": org_id,
    })
    return usuario.uid
