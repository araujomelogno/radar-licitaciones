"""Cloud Storage: crudos (`raw/{fuente}/{fecha}.json`, 30 días) y avisos normalizados por corrida.

Sin `RADAR_BUCKET` se escribe en un directorio local (desarrollo y tests).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .ajustes import ajustes
from .modelos import AvisoNormalizado


class Almacen:
    def __init__(self, bucket: str | None = None, raiz_local: str | None = None) -> None:
        a = ajustes()
        self.bucket_nombre = bucket if bucket is not None else a.bucket
        self.raiz = Path(raiz_local or a.datos_locales)
        self._bucket = None
        if self.bucket_nombre:
            from google.cloud import storage

            self._bucket = storage.Client(project=a.proyecto or None).bucket(self.bucket_nombre)

    def ref(self, ruta: str) -> str:
        return f"gs://{self.bucket_nombre}/{ruta}" if self._bucket else str(self.raiz / ruta)

    def escribir(self, ruta: str, datos: Any) -> str:
        cuerpo = json.dumps(datos, ensure_ascii=False, default=str)
        if self._bucket:
            self._bucket.blob(ruta).upload_from_string(cuerpo, content_type="application/json; charset=utf-8")
        else:
            destino = self.raiz / ruta
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(cuerpo, encoding="utf-8")
        return self.ref(ruta)

    def leer(self, ruta: str) -> Any:
        if self._bucket:
            return json.loads(self._bucket.blob(ruta).download_as_text())
        return json.loads((self.raiz / ruta).read_text(encoding="utf-8"))

    def listar(self, prefijo: str) -> list[str]:
        if self._bucket:
            return sorted(b.name for b in self._bucket.list_blobs(prefix=prefijo))
        base = self.raiz / prefijo
        if not base.exists():
            return []
        return sorted(str(p.relative_to(self.raiz)) for p in base.rglob("*.json"))

    # ── rutas del radar ──

    @staticmethod
    def ruta_crudo(fuente: str, fecha: str) -> str:
        return f"raw/{fuente}/{fecha}.json"

    @staticmethod
    def ruta_normalizados(corrida_id: str, fuente: str) -> str:
        return f"normalizados/{corrida_id}/{fuente}.json"

    @staticmethod
    def ruta_agente(fecha: str, fuente: str) -> str:
        return f"normalizados/agente/{fecha}/{fuente}.json"

    def guardar_avisos(self, ruta: str, avisos: list[AvisoNormalizado]) -> str:
        return self.escribir(ruta, [a.model_dump(mode="json") for a in avisos])

    def leer_avisos(self, ruta: str) -> list[AvisoNormalizado]:
        return [AvisoNormalizado.model_validate(x) for x in self.leer(ruta)]
