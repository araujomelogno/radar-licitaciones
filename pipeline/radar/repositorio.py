"""Acceso a Firestore del pipeline (cuenta de servicio “Sistema”)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from .ajustes import ajustes
from .modelos import ESTADOS_CERRADOS
from .semilla import busqueda_inicial, perfil_inicial, sistema_inicial

LOCK_ID = "actual"
LOCK_MINUTOS = 60


class Repositorio:
    def __init__(self, cliente: Any | None = None) -> None:
        if cliente is None:
            from google.cloud import firestore

            a = ajustes()
            cliente = firestore.Client(project=a.proyecto or None, database=a.firestore_database)
        self.db = cliente
        self.org_id = ajustes().org_id

    # ── configuración ──

    def config(self, nombre: str) -> dict[str, Any]:
        snap = self.db.collection("config").document(nombre).get()
        defecto = {"perfil": perfil_inicial, "busqueda": busqueda_inicial, "sistema": sistema_inicial}[nombre]()
        return {**defecto, **(snap.to_dict() or {})} if snap.exists else defecto

    def fuentes(self) -> dict[str, dict[str, Any]]:
        return {d.id: d.to_dict() or {} for d in self.db.collection("fuentes").stream()}

    def fuente(self, fuente_id: str) -> dict[str, Any]:
        snap = self.db.collection("fuentes").document(fuente_id).get()
        return snap.to_dict() or {} if snap.exists else {}

    def actualizar_fuente(self, fuente_id: str, cambios: dict[str, Any]) -> None:
        self.db.collection("fuentes").document(fuente_id).set({**cambios, "orgId": self.org_id}, merge=True)

    def admins(self) -> list[str]:
        q = self.db.collection("usuarios").where("rol", "==", "admin")
        return sorted({(d.to_dict() or {}).get("email", "") for d in q.stream()} - {""})

    # ── corridas y lock ──

    def corrida_ref(self, corrida_id: str) -> Any:
        return self.db.collection("corridas").document(corrida_id)

    def corrida(self, corrida_id: str) -> dict[str, Any]:
        snap = self.corrida_ref(corrida_id).get()
        return snap.to_dict() or {} if snap.exists else {}

    def actualizar_corrida(self, corrida_id: str, cambios: dict[str, Any]) -> None:
        self.corrida_ref(corrida_id).set({**cambios, "orgId": self.org_id}, merge=True)

    def tomar_lock(self, corrida_id: str, ahora: datetime) -> tuple[bool, dict[str, Any]]:
        """Toma `corridas/actual` en una transacción. Devuelve (tomado, lock vigente)."""
        from google.cloud import firestore

        ref = self.corrida_ref(LOCK_ID)
        transaccion = self.db.transaction()

        @firestore.transactional
        def _tomar(tx: Any) -> tuple[bool, dict[str, Any]]:
            snap = ref.get(transaction=tx)
            lock = snap.to_dict() or {} if snap.exists else {}
            vigente = bool(lock) and lock.get("corridaId") != corrida_id and _no_vencido(lock, ahora)
            if vigente:
                return False, lock
            nuevo = {
                "lock": True,
                "corridaId": corrida_id,
                "inicio": lock.get("inicio") if lock.get("corridaId") == corrida_id else ahora,
                "expira": ahora + timedelta(minutes=LOCK_MINUTOS),
                "orgId": self.org_id,
            }
            tx.set(ref, nuevo)
            return True, nuevo

        return _tomar(transaccion)

    def lock(self) -> dict[str, Any]:
        snap = self.corrida_ref(LOCK_ID).get()
        return snap.to_dict() or {} if snap.exists else {}

    def liberar_lock(self, corrida_id: str) -> None:
        from google.cloud import firestore

        ref = self.corrida_ref(LOCK_ID)
        transaccion = self.db.transaction()

        @firestore.transactional
        def _liberar(tx: Any) -> None:
            snap = ref.get(transaction=tx)
            if snap.exists and (snap.to_dict() or {}).get("corridaId") == corrida_id:
                tx.delete(ref)

        _liberar(transaccion)

    def corridas_recientes(self, limite: int = 10) -> list[dict[str, Any]]:
        from google.cloud import firestore

        q = self.db.collection("corridas").order_by("inicio", direction=firestore.Query.DESCENDING).limit(limite + 1)
        return [{"id": d.id, **(d.to_dict() or {})} for d in q.stream() if d.id != LOCK_ID][:limite]

    # ── oportunidades ──

    def oportunidades_ref(self) -> Any:
        return self.db.collection("oportunidades")

    def candidatas_dedup(self, doc_ids: Iterable[str], ahora: datetime) -> dict[str, dict[str, Any]]:
        """Oportunidades que pueden coincidir: por docId/alias y las no manuales vigentes o recientes."""
        col = self.oportunidades_ref()
        docs: dict[str, dict[str, Any]] = {}
        ids = list(dict.fromkeys(doc_ids))
        for i in range(0, len(ids), 100):
            refs = [col.document(x) for x in ids[i:i + 100]]
            for snap in self.db.get_all(refs):
                if snap.exists:
                    docs[snap.id] = snap.to_dict() or {}
        for i in range(0, len(ids), 30):
            for snap in col.where("aliases", "array-contains-any", ids[i:i + 30]).stream():
                docs[snap.id] = snap.to_dict() or {}
        limite = ahora - timedelta(days=45)
        for snap in col.where("detectado", ">=", limite).stream():
            d = snap.to_dict() or {}
            if not d.get("manual") and d.get("estado") not in ESTADOS_CERRADOS:
                docs.setdefault(snap.id, d)
        return docs

    def por_etapa(self, etapa: str) -> list[tuple[str, dict[str, Any]]]:
        q = self.oportunidades_ref().where("etapa", "==", etapa)
        return [(d.id, d.to_dict() or {}) for d in q.stream() if not (d.to_dict() or {}).get("manual")]

    def descartes_recientes(self, limite: int = 10) -> list[dict[str, Any]]:
        from google.cloud import firestore

        q = (self.oportunidades_ref().where("estado", "==", "descartada")
             .order_by("estadoFecha", direction=firestore.Query.DESCENDING).limit(limite))
        return [d.to_dict() or {} for d in q.stream()]

    def detectadas_en(self, corrida_id: str) -> list[dict[str, Any]]:
        q = self.oportunidades_ref().where("detectadoCorrida", "==", corrida_id)
        return [{"docId": d.id, **(d.to_dict() or {})} for d in q.stream()]

    def escribir_lote(self, operaciones: list[tuple[str, str, dict[str, Any]]]) -> None:
        """Escribe en lotes de hasta 400 operaciones: (accion, docId, datos)."""
        from google.cloud import firestore

        col = self.oportunidades_ref()
        for i in range(0, len(operaciones), 400):
            lote = self.db.batch()
            for accion, doc_id, datos in operaciones[i:i + 400]:
                ref = col.document(doc_id)
                if accion == "crear":
                    lote.set(ref, datos)
                elif accion == "historial":
                    lote.update(ref, {"historial": firestore.ArrayUnion(datos["entradas"])})
                else:
                    lote.update(ref, datos)
            lote.commit()


def _no_vencido(lock: dict[str, Any], ahora: datetime) -> bool:
    expira = lock.get("expira")
    return isinstance(expira, datetime) and expira > ahora
