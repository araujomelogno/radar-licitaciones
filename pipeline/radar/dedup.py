"""Deduplicación y prórrogas (RF-04).

Es lógica pura: recibe los avisos de la corrida y las oportunidades guardadas,
y devuelve un plan de escrituras. La etapa `consolidar` aplica el plan en
Firestore. Así cada paso es idempotente y se puede testear sin red.

Reglas:
- El `docId` es estable: un aviso que vuelve actualiza su documento.
- Entre fuentes distintas se busca el mismo llamado (referencia específica en
  común, mismo organismo y objeto parecido, o mismo cierre y objeto parecido).
  Si coincide, se fusiona: se agrega la fuente a `fuentes[]` y el `docId` del
  aviso a `aliases[]`.
- Al fusionar manda la fuente oficial (ver `PRIORIDAD_FUENTE`); el `docId`
  original se conserva para no perder estado, nota ni historial.
- Una prórroga actualiza `cierre` y agrega una entrada al historial, sin tocar
  estado ni nota.
- Los llamados manuales no se tocan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .modelos import AvisoNormalizado, prioridad
from .normalizacion import plano

AUTOR_RADAR = "radar"

_VACIAS = {
    "de", "la", "el", "los", "las", "y", "o", "en", "para", "por", "del", "al", "a", "con", "un", "una",
    "the", "of", "and", "for", "to", "in", "on", "n", "no", "nro", "servicio", "servicios", "contratacion",
    "llamado", "consultoria", "consultor", "consultora", "firma", "expresion", "interes", "request",
    "expression", "interest", "invitation", "bids", "aviso", "licitacion", "publica", "abreviada",
    "compra", "directa", "concurso", "precios",
}


def _tokens(texto: str) -> set[str]:
    return {t for t in plano(texto).split() if len(t) > 2 and t not in _VACIAS and not t.isdigit()}


def similitud(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _ref(valor: str) -> str:
    return re.sub(r"[^a-z0-9/]", "", plano(valor).replace(" ", ""))


def _especifica(ref: str) -> bool:
    """Una referencia que identifica un llamado por sí sola (P123456, OP00473712, un ocid)."""
    return len(ref) >= 6 and bool(re.search(r"[a-z]", ref)) and bool(re.search(r"\d", ref))


def _mismo_organismo(a: str, b: str) -> bool:
    pa, pb = plano(a), plano(b)
    return bool(pa and pb) and (pa in pb or pb in pa or similitud(a, b) >= 0.6)


def _mismo_dia(a: Any, b: Any) -> bool:
    return isinstance(a, datetime) and isinstance(b, datetime) and a.date() == b.date()


def motivo_coincidencia(aviso: AvisoNormalizado, doc: dict[str, Any]) -> str | None:
    """Por qué un aviso y una oportunidad guardada son el mismo llamado (o None)."""
    if doc.get("pais") != aviso.pais:
        return None
    refs_a = {_ref(r) for r in aviso.referencias if r}
    refs_d = {_ref(r) for r in doc.get("referencias") or [] if r}
    comunes = refs_a & refs_d
    if any(_especifica(r) for r in comunes):
        return "referencia"
    mismo_org = _mismo_organismo(aviso.organismo, doc.get("organismo", ""))
    sim = similitud(aviso.titulo, doc.get("titulo", ""))
    if comunes and mismo_org:
        return "numero"
    if mismo_org and sim >= 0.6:
        return "organismo_objeto"
    if _mismo_dia(aviso.cierre, doc.get("cierre")) and sim >= 0.5:
        return "cierre"
    return None


@dataclass
class Plan:
    crear: dict[str, dict[str, Any]] = field(default_factory=dict)
    actualizar: dict[str, dict[str, Any]] = field(default_factory=dict)
    historial: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    conteos: dict[str, dict[str, int]] = field(default_factory=dict)

    def contar(self, fuente_id: str, clave: str) -> None:
        c = self.conteos.setdefault(fuente_id, {"leidos": 0, "nuevos": 0, "actualizados": 0, "fusionados": 0})
        c[clave] += 1


def documento_nuevo(aviso: AvisoNormalizado, corrida_id: str, ahora: datetime, org_id: str) -> dict[str, Any]:
    base = aviso.model_dump()
    return {
        **base,
        "fuentes": [aviso.fuente],
        "fuentesDetalle": [{"fuente": aviso.fuente, "docId": aviso.docId, "url": aviso.url}],
        "aliases": [],
        "detectado": ahora,
        "detectadoCorrida": corrida_id,
        "vistoCorrida": corrida_id,
        "actualizado": ahora,
        "etapa": "prefiltro",
        "relevancia": "sin_clasificar",
        "puntaje": None,
        "resumen": "",
        "motivo": "",
        "servicios": [],
        "clasificacion": None,
        "prefiltro": None,
        "estado": "nueva",
        "estadoFecha": ahora,
        "motivoDescarte": None,
        "nota": "",
        "historial": [{
            "tipo": "alta", "de": None, "a": "nueva", "autor": AUTOR_RADAR, "fecha": ahora,
            "detalle": f"detectado en {aviso.fuente}",
        }],
        "manual": False,
        "canal": None,
        "legacyId": None,
        "orgId": org_id,
        "actualizadoPor": AUTOR_RADAR,
    }


# Campos que se refrescan cuando vuelve el mismo aviso de la misma fuente (sin historial).
_REFRESCABLES = ("titulo", "organismo", "url", "texto", "textoLargo", "monto", "moneda", "financiador",
                 "idioma", "crudoRef", "admiteExtranjeras", "publicado", "tipo")


def consolidar(
    avisos: list[tuple[str, AvisoNormalizado]],
    existentes: dict[str, dict[str, Any]],
    corrida_id: str,
    ahora: datetime,
    org_id: str = "equipos",
) -> Plan:
    """Arma el plan de escrituras.

    `avisos` son pares (fuente_id, aviso). `existentes` son las oportunidades
    guardadas que pueden coincidir (por docId o alias, y las abiertas recientes).
    """
    plan = Plan()
    docs = {k: dict(v) for k, v in existentes.items()}
    alias = {a: k for k, v in docs.items() for a in v.get("aliases") or []}

    # Primero las fuentes oficiales, así un duplicado de menor prioridad se fusiona en ellas.
    for fuente_id, aviso in sorted(avisos, key=lambda p: prioridad(p[1].fuente)):
        plan.contar(fuente_id, "leidos")
        destino_id = aviso.docId if aviso.docId in docs else alias.get(aviso.docId)
        motivo = "mismo_id" if destino_id else None
        if not destino_id:
            for k, d in docs.items():
                if d.get("manual"):
                    continue
                motivo = motivo_coincidencia(aviso, d)
                if motivo:
                    destino_id = k
                    break

        if not destino_id:
            doc = documento_nuevo(aviso, corrida_id, ahora, org_id)
            plan.crear[aviso.docId] = doc
            docs[aviso.docId] = doc
            plan.contar(fuente_id, "nuevos")
            continue

        destino = docs[destino_id]
        if destino.get("manual"):
            continue
        cambios: dict[str, Any] = {}
        entradas: list[dict[str, Any]] = []
        # El aviso “manda” si viene de la fuente principal del documento o de una más oficial.
        manda = aviso.fuente == destino.get("fuente") or prioridad(aviso.fuente) < prioridad(destino.get("fuente", ""))

        if destino_id != aviso.docId and aviso.docId not in (destino.get("aliases") or []):
            # Fusión de un llamado visto en otra fuente.
            cambios["aliases"] = [*(destino.get("aliases") or []), aviso.docId]
            if aviso.fuente not in (destino.get("fuentes") or []):
                cambios["fuentes"] = [*(destino.get("fuentes") or []), aviso.fuente]
            cambios["fuentesDetalle"] = [
                *(destino.get("fuentesDetalle") or []),
                {"fuente": aviso.fuente, "docId": aviso.docId, "url": aviso.url},
            ]
            cambios["referencias"] = sorted({*(destino.get("referencias") or []), *aviso.referencias})
            entradas.append({"tipo": "fusion", "de": None, "a": aviso.fuente, "autor": AUTOR_RADAR,
                             "fecha": ahora, "detalle": f"mismo llamado en {aviso.fuente} ({motivo})"})
            plan.contar(fuente_id, "fusionados")
            if manda and aviso.fuente != destino.get("fuente"):
                # La fuente oficial pasa a ser la principal, sin cambiar el docId.
                cambios.update({"fuente": aviso.fuente, "url": aviso.url, "idOficial": aviso.idOficial,
                                "organismo": aviso.organismo, "titulo": aviso.titulo})
        elif manda:
            for campo in _REFRESCABLES:
                nuevo = getattr(aviso, campo)
                if nuevo not in (None, "", []) and destino.get(campo) != nuevo:
                    cambios[campo] = nuevo

        # Prórroga: solo la fuente principal (o una oficial) mueve el cierre.
        if manda and aviso.cierre and not _mismo_instante(destino.get("cierre"), aviso.cierre):
            cambios["cierre"] = aviso.cierre
            entradas.append({"tipo": "cierre", "de": destino.get("cierre"), "a": aviso.cierre,
                             "autor": AUTOR_RADAR, "fecha": ahora,
                             "detalle": "prórroga" if destino.get("cierre") else "cierre informado"})

        if destino.get("vistoCorrida") != corrida_id:
            cambios["vistoCorrida"] = corrida_id
        hay_cambios_reales = any(k != "vistoCorrida" for k in cambios)
        if hay_cambios_reales:
            cambios["actualizado"] = ahora
            plan.contar(fuente_id, "actualizados")
        if cambios:
            if destino_id in plan.crear:
                plan.crear[destino_id].update(cambios)
                plan.crear[destino_id]["historial"] = [*plan.crear[destino_id]["historial"], *entradas]
            else:
                plan.actualizar.setdefault(destino_id, {}).update(cambios)
                if entradas:
                    plan.historial.setdefault(destino_id, []).extend(entradas)
            destino.update(cambios)
            if entradas:
                destino["historial"] = [*(destino.get("historial") or []), *entradas]
            for a in cambios.get("aliases", []):
                alias[a] = destino_id
    return plan


def _mismo_instante(a: Any, b: datetime) -> bool:
    if not isinstance(a, datetime):
        return False
    return abs((a - b).total_seconds()) < 60
