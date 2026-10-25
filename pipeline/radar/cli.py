"""Punto de entrada de los Cloud Run Jobs y de las herramientas: `python -m radar.cli <comando>`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import etapas, logs
from .ajustes import ajustes


def _servicios(con_modelo: bool = False, con_correo: bool = False) -> etapas.Servicios:
    from .almacenamiento import Almacen
    from .repositorio import Repositorio

    a = ajustes()
    repo = Repositorio()
    s = etapas.Servicios(repo=repo, almacen=Almacen())
    if con_modelo:
        from .clasificacion import GeminiVertex

        s.crear_modelo = lambda nombre: GeminiVertex(nombre, a.proyecto, a.vertex_location)
    if con_correo:
        s.enviar_correo = _enviar_resumen(repo)
    return s


def _enviar_resumen(repo):  # type: ignore[no-untyped-def]
    from . import correo

    def enviar(corrida_id: str, corrida: dict, fuentes_en_cero: list[str]) -> None:
        sistema = repo.config("sistema")
        busqueda = repo.config("busqueda")
        remitente = sistema.get("remitente")
        destinatarios = sorted({*repo.admins(), *(sistema.get("destinatariosExtra") or [])})
        if not remitente or not destinatarios:
            logs.aviso("resumen no enviado: falta remitente o destinatarios en config/sistema",
                       evento="resumen_error")
            return
        nuevas = repo.detectadas_en(corrida_id)
        asunto, texto, cuerpo = correo.armar_resumen(corrida_id, corrida, nuevas, busqueda.get("umbrales") or {},
                                                     sistema.get("appUrl", ""), fuentes_en_cero)
        correo.enviar_gmail(ajustes().sa_email, correo.mensaje(remitente, destinatarios, asunto, texto, cuerpo))
        logs.info(f"resumen enviado a {len(destinatarios)} destinatarios", evento="resumen_enviado")

    return enviar


def _corrida_actual(s: etapas.Servicios) -> str:
    """Si un job corre sin --corrida-id, se suma a la corrida en curso o crea una manual."""
    lock = s.repo.lock()
    return lock.get("corridaId") or etapas.nuevo_corrida_id("manual")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="radar", description="Radar de licitaciones · pipeline")
    sub = p.add_subparsers(dest="comando", required=True)

    x = sub.add_parser("iniciar")
    x.add_argument("--corrida-id")
    x.add_argument("--disparo", default="programada", choices=["programada", "manual"])
    x.add_argument("--ejecucion", default="")
    x.add_argument("--solicitado-por", default="")

    x = sub.add_parser("collect")
    x.add_argument("--fuente", required=True)
    x.add_argument("--corrida-id")

    x = sub.add_parser("marcar-fuente")
    x.add_argument("--corrida-id", required=True)
    x.add_argument("--fuente", required=True)
    x.add_argument("--estado", default="error", choices=["error", "bloqueo"])
    x.add_argument("--detalle", default="agotó los reintentos")

    for nombre in ("consolidar", "prefiltrar", "clasificar"):
        sub.add_parser(nombre).add_argument("--corrida-id", required=True)

    x = sub.add_parser("cerrar")
    x.add_argument("--corrida-id", required=True)
    x.add_argument("--fallo")

    sub.add_parser("verificar")
    sub.add_parser("reclasificar")

    x = sub.add_parser("probar-acceso")
    x.add_argument("--fuentes", help="ids separados por coma (por defecto, todas)")
    x.add_argument("--sin-navegador", action="store_true")

    x = sub.add_parser("agente")
    x.add_argument("--fuentes", help="ids separados por coma (por defecto, las de método agente_local)")

    x = sub.add_parser("evaluar")
    x.add_argument("--set", required=True, type=Path)
    x.add_argument("--minimo", type=float, default=0.80)
    x.add_argument("--modelo", default="gemini-3.1-flash-lite")

    sub.add_parser("seed")

    x = sub.add_parser("bootstrap-admin")
    x.add_argument("--email", required=True)

    x = sub.add_parser("migrar")
    x.add_argument("--export", required=True, type=Path)
    x.add_argument("--forzar", action="store_true")
    x.add_argument("--simular", action="store_true")

    a = p.parse_args(argv)
    cfg = ajustes()

    if a.comando == "evaluar":
        from .clasificacion import GeminiVertex
        from .herramientas import evaluar

        acuerdo, detalle = evaluar(GeminiVertex(a.modelo, cfg.proyecto, cfg.vertex_location), a.set, a.minimo)
        print(json.dumps({"acuerdo": round(acuerdo, 4), "minimo": a.minimo, "casos": len(detalle),
                          "errores": [d for d in detalle if not d["acierto"]]}, ensure_ascii=False, indent=2))
        return 0 if acuerdo >= a.minimo else 1

    if a.comando in ("seed", "bootstrap-admin", "migrar"):
        from .repositorio import Repositorio

        db = Repositorio().db
        if a.comando == "seed":
            from .herramientas import seed

            print(json.dumps(seed(db, cfg.org_id), ensure_ascii=False))
        elif a.comando == "bootstrap-admin":
            from .herramientas import bootstrap_admin

            print(f"admin creado: {bootstrap_admin(a.email, cfg.proyecto, db, cfg.org_id)}")
        else:
            from .migracion import migrar

            informe = migrar(a.export, db, cfg.org_id, forzar=a.forzar, simular=a.simular)
            print(json.dumps(informe, ensure_ascii=False, indent=2, default=str))
            sin_explicar = [r for c in informe.values() if isinstance(c, dict)
                            for r in c.get("rechazos", []) if not r.get("motivo")]
            return 1 if sin_explicar else 0
        return 0

    s = _servicios(con_modelo=a.comando == "clasificar", con_correo=a.comando == "cerrar")
    corrida_id = getattr(a, "corrida_id", None)
    if a.comando in ("iniciar", "collect") and not corrida_id:
        corrida_id = (etapas.nuevo_corrida_id(a.disparo) if a.comando == "iniciar" else _corrida_actual(s))
    logs.contexto(corridaId=corrida_id, comando=a.comando, entorno=cfg.entorno)

    try:
        match a.comando:
            case "iniciar":
                return etapas.iniciar(s, corrida_id, a.disparo, a.ejecucion, a.solicitado_por)
            case "collect":
                return etapas.recolectar(s, a.fuente, corrida_id)
            case "marcar-fuente":
                return etapas.marcar_fuente(s, corrida_id, a.fuente, a.estado, a.detalle)
            case "consolidar":
                return etapas.consolidar(s, corrida_id)
            case "prefiltrar":
                return etapas.prefiltrar(s, corrida_id)
            case "clasificar":
                return etapas.clasificar_pendientes(s, corrida_id)
            case "cerrar":
                return etapas.cerrar(s, corrida_id, a.fallo)
            case "verificar":
                return etapas.verificar(s)
            case "reclasificar":
                return etapas.reclasificar_abiertas(s)
            case "probar-acceso":
                from .herramientas import probar_acceso

                return probar_acceso(s, a.fuentes.split(",") if a.fuentes else None, not a.sin_navegador)
            case "agente":
                from .herramientas import agente

                return agente(s, a.fuentes.split(",") if a.fuentes else None)
    except Exception as e:
        logs.error(f"{a.comando} falló: {type(e).__name__}: {e}", evento=f"{a.comando}_error")
        raise
    return 0


if __name__ == "__main__":
    sys.exit(main())
