"""Migración del radar actual (RF-11).

Lee un directorio con un archivo por colección exportada (`oportunidades.json`,
`competidores.json`, `adjudicaciones.json`, `propuestas.json`, `contactos.json`,
`config.json`, `meta.json`). Cada archivo puede ser un objeto `{id: documento}`,
una lista de documentos con `id`/`_id`/`doc_id`, o JSONL (`.jsonl`).

- Los `doc_id` se conservan tal cual.
- Estados, notas, historial y `estado_fecha` se conservan.
- Es idempotente: un documento ya migrado (`migradoEn`) no se vuelve a escribir
  salvo con `--forzar`, así no pisa lo editado en el radar nuevo.
- Informa cuántos registros leyó, importó, omitió y rechazó, y por qué.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .modelos import ESTADOS, FUENTES
from .normalizacion import moneda_iso, pais_desde, parse_fecha, plano

COLECCIONES = ("oportunidades", "competidores", "adjudicaciones", "propuestas", "contactos", "config")
CANALES_MANUALES = {"beo": "BEO", "caf": "CAF", "correo": "Correo", "email": "Correo", "contacto": "Contacto",
                    "manual": "Otro", "otro": "Otro", "developmentaid": "DevelopmentAid"}

_CLAVE_CANAL = {"BEO": "BEO", "CAF": "CAF", "Correo": "correo", "Contacto": "contacto"}

_ESTADO_POR_ETIQUETA = {
    "nueva": "nueva", "nuevo": "nueva", "analizando": "analizando", "en analisis": "analizando",
    "vamos a postular": "postular", "postular": "postular", "a postular": "postular",
    "nos presentamos": "presentada", "presentada": "presentada", "presentado": "presentada",
    "en evaluacion": "evaluacion", "evaluacion": "evaluacion", "ganada": "ganada", "ganado": "ganada",
    "perdida": "perdida", "perdido": "perdida", "descartada": "descartada", "descartado": "descartada",
}
_MOTIVOS = {"fuera de rubro": "fuera_rubro", "fuera_rubro": "fuera_rubro", "monto": "monto", "pais": "pais",
            "requisitos": "requisitos", "plazo": "plazo"}


def leer_coleccion(ruta: Path) -> dict[str, dict[str, Any]]:
    if ruta.suffix == ".jsonl":
        filas = [json.loads(linea) for linea in ruta.read_text(encoding="utf-8").splitlines() if linea.strip()]
    else:
        filas = json.loads(ruta.read_text(encoding="utf-8"))
    if isinstance(filas, dict):
        if all(isinstance(v, dict) for v in filas.values()):
            return {str(k): v for k, v in filas.items()}
        filas = [filas]
    docs = {}
    for i, f in enumerate(filas):
        clave = f.get("id") or f.get("_id") or f.get("doc_id") or f.get("docId") or f"sin-id-{i}"
        docs[str(clave)] = f
    return docs


def _primero(d: dict[str, Any], *claves: str) -> Any:
    for c in claves:
        if d.get(c) not in (None, ""):
            return d[c]
    return None


def _fecha(valor: Any, pais: str = "Uruguay", cierre: bool = False) -> datetime | None:
    if isinstance(valor, dict) and "_seconds" in valor:  # Timestamp exportado como JSON
        return datetime.fromtimestamp(valor["_seconds"], UTC)
    if isinstance(valor, (int, float)):
        return datetime.fromtimestamp(valor / 1000 if valor > 1e11 else valor, UTC)
    return parse_fecha(valor, pais, cierre=cierre) if valor else None


def _estado(valor: Any) -> str | None:
    if not valor:
        return "nueva"
    clave = _ESTADO_POR_ETIQUETA.get(plano(str(valor)))
    return clave if clave in ESTADOS else None


def id_valido(doc_id: str) -> bool:
    return bool(doc_id) and "/" not in doc_id and doc_id not in (".", "..") and len(doc_id.encode()) < 1500 \
        and not (doc_id.startswith("__") and doc_id.endswith("__"))


def mapear_oportunidad(doc_id: str, viejo: dict[str, Any], org_id: str, ahora: datetime) -> tuple[dict[str, Any] | None, str]:
    """Convierte un documento del radar actual al esquema nuevo. Devuelve (doc, motivo de rechazo)."""
    if not id_valido(doc_id):
        return None, "doc_id inválido para Firestore"
    titulo = _primero(viejo, "titulo", "title", "objeto", "nombre")
    if not titulo:
        return None, "sin título"
    pais = pais_desde(str(_primero(viejo, "pais", "country", "pais_codigo") or "")) or "Uruguay"
    estado = _estado(_primero(viejo, "estado", "status"))
    if estado is None:
        return None, f"estado desconocido: {viejo.get('estado')!r}"
    fuente = str(_primero(viejo, "fuente", "source") or "Manual")
    canal = CANALES_MANUALES.get(plano(fuente).replace(" ", ""))
    manual = bool(viejo.get("manual")) or (canal is not None and fuente not in [f.nombre for f in FUENTES.values()])
    motivo_descarte = viejo.get("motivoDescarte") or viejo.get("motivo_descarte")
    if isinstance(motivo_descarte, str):
        motivo_descarte = {"codigo": _MOTIVOS.get(plano(motivo_descarte), "otro"), "texto": motivo_descarte}

    historial = []
    for h in viejo.get("historial") or []:
        if isinstance(h, dict):
            historial.append({
                "tipo": h.get("tipo") or ("estado" if h.get("estado") or h.get("a") else "nota"),
                "de": h.get("de"), "a": h.get("a") or _estado(h.get("estado")) or h.get("estado"),
                "autor": h.get("autor") or h.get("usuario") or h.get("por") or "radar actual",
                "fecha": _fecha(h.get("fecha") or h.get("ts")) or ahora,
                "detalle": h.get("detalle") or h.get("nota"),
            })
    historial.append({"tipo": "migracion", "de": None, "a": estado, "autor": "migración", "fecha": ahora,
                      "detalle": "importado del radar actual"})

    puntaje = _primero(viejo, "puntaje", "score")
    relevancia = plano(str(_primero(viejo, "relevancia", "relevance") or "")) or None
    if relevancia not in ("alta", "media", "baja"):
        relevancia = "sin_clasificar" if not manual else "media"
    fuentes = viejo.get("fuentes") if isinstance(viejo.get("fuentes"), list) else [canal or fuente]
    return {
        "docId": doc_id,
        "fuente": canal or fuente,
        "fuentes": fuentes,
        "fuentesDetalle": [{"fuente": canal or fuente, "docId": doc_id, "url": _primero(viejo, "url", "link") or ""}],
        "aliases": [],
        "idOficial": _primero(viejo, "idOficial", "id_oficial", "numero"),
        "titulo": str(titulo),
        "organismo": str(_primero(viejo, "organismo", "comprador", "agency") or ""),
        "pais": pais,
        "tipo": _primero(viejo, "tipo") or "otro",
        "url": _primero(viejo, "url", "link") or "",
        "publicado": _fecha(_primero(viejo, "publicado", "fecha_publicacion", "published"), pais),
        "cierre": _fecha(_primero(viejo, "cierre", "fecha_cierre", "deadline"), pais, cierre=True),
        "monto": _primero(viejo, "monto", "amount"),
        "moneda": moneda_iso(str(_primero(viejo, "moneda", "currency") or "")),
        "financiador": _primero(viejo, "financiador"),
        "texto": str(_primero(viejo, "texto", "descripcion", "description") or "")[:20000],
        "textoLargo": len(str(_primero(viejo, "texto", "descripcion", "description") or "")),
        "crudoRef": "migracion",
        "detectado": _fecha(_primero(viejo, "detectado", "fecha_deteccion", "created_at")) or ahora,
        "detectadoCorrida": "migracion",
        "vistoCorrida": "migracion",
        "actualizado": ahora,
        "etapa": "lista",
        "relevancia": relevancia,
        "puntaje": puntaje,
        "resumen": _primero(viejo, "resumen", "summary") or "",
        "motivo": _primero(viejo, "motivo", "razon") or "",
        "servicios": viejo.get("servicios") or [],
        "clasificacion": {"modelo": "radar actual", "promptVersion": "legacy", "fecha": None},
        "prefiltro": {"paso": True, "regla": None},
        "estado": estado,
        "estadoFecha": _fecha(_primero(viejo, "estado_fecha", "estadoFecha")) or ahora,
        "motivoDescarte": motivo_descarte,
        "nota": str(_primero(viejo, "nota", "notas", "note") or ""),
        "historial": historial,
        "manual": manual,
        "canal": _CLAVE_CANAL.get(canal or "", "otro") if manual else None,
        "legacyId": doc_id,
        "orgId": org_id,
        "actualizadoPor": "migración",
        "migradoEn": ahora,
    }, ""


def _fuente_id_por_nombre(nombre: str) -> str | None:
    p = plano(nombre)
    for f in FUENTES.values():
        if plano(f.nombre) == p or f.id == p or f.prefijo == p:
            return f.id
    return None


def migrar(directorio: Path, db: Any, org_id: str, forzar: bool = False, simular: bool = False) -> dict[str, Any]:
    ahora = datetime.now(UTC)
    informe: dict[str, Any] = {}
    for nombre in COLECCIONES:
        archivo = next((directorio / f"{nombre}{ext}" for ext in (".json", ".jsonl")
                        if (directorio / f"{nombre}{ext}").exists()), None)
        if archivo is None:
            continue
        docs = leer_coleccion(archivo)
        conteo: Counter = Counter(leidos=len(docs))
        rechazos: list[dict[str, str]] = []
        col = db.collection(nombre) if db is not None else None
        lote = db.batch() if db is not None and not simular else None
        en_lote = 0
        for doc_id, viejo in docs.items():
            if nombre == "oportunidades":
                nuevo, motivo = mapear_oportunidad(doc_id, viejo, org_id, ahora)
            elif not id_valido(doc_id):
                nuevo, motivo = None, "doc_id inválido para Firestore"
            else:
                nuevo, motivo = {**viejo, "orgId": org_id, "legacyId": doc_id, "migradoEn": ahora}, ""
            if nuevo is None:
                conteo["rechazados"] += 1
                rechazos.append({"id": doc_id, "motivo": motivo})
                continue
            if col is not None and not forzar:
                previo = col.document(doc_id).get()
                if previo.exists and (previo.to_dict() or {}).get("migradoEn"):
                    conteo["omitidos_ya_migrados"] += 1
                    continue
            if lote is not None:
                lote.set(col.document(doc_id), nuevo)
                en_lote += 1
                if en_lote >= 400:
                    lote.commit()
                    lote, en_lote = db.batch(), 0
            conteo["importados"] += 1
        if lote is not None and en_lote:
            lote.commit()
        informe[nombre] = {**dict(conteo), "rechazos": rechazos}

    meta = directorio / "meta.json"
    if meta.exists():
        estado = leer_coleccion(meta).get("estado") or {}
        fuentes_estado = estado.get("fuentes") if isinstance(estado.get("fuentes"), dict) else estado
        aplicadas = []
        for nombre, valor in fuentes_estado.items():
            fid = _fuente_id_por_nombre(nombre)
            if not fid or not isinstance(valor, dict):
                continue
            ultima = {
                "corridaId": "radar-actual",
                "estado": "ok" if not valor.get("error") else "error",
                "leidos": valor.get("leidos") or valor.get("avisos") or 0,
                "nuevos": valor.get("nuevos") or 0,
                "actualizados": 0,
                "error": valor.get("error"),
                "fin": _fecha(valor.get("fecha") or valor.get("ultima")) or ahora,
            }
            if db is not None and not simular:
                ref = db.collection("fuentes").document(fid)
                if not (ref.get().to_dict() or {}).get("ultimaCorrida"):
                    ref.set({"ultimaCorrida": ultima, "orgId": org_id}, merge=True)
            aplicadas.append(fid)
        informe["meta/estado"] = {"fuentes": aplicadas}
    return informe
