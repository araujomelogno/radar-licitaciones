# Pipeline del radar

Paquete `radar` (Python 3.12). Una sola imagen de contenedor; cada Cloud Run Job cambia los argumentos de
`python -m radar.cli`.

| Comando | Qué hace | Requisito |
| --- | --- | --- |
| `iniciar --corrida-id ID --disparo programada\|manual` | Toma el lock `corridas/actual` y crea `corridas/{id}`. Sale con 3 si hay otra corrida en curso | RF-01 |
| `collect --fuente <id> --corrida-id ID` | fetch → crudo en `raw/{fuente}/{fecha}.json` → parse → `normalizados/{corrida}/{fuente}.json` | RF-02, RF-13 |
| `marcar-fuente ...` | Lo usa el workflow cuando un collector agota los reintentos | RF-01 |
| `consolidar --corrida-id ID` | Normaliza, deduplica entre fuentes, detecta prórrogas y escribe `oportunidades` | RF-03, RF-04 |
| `prefiltrar --corrida-id ID` | Reglas deterministas de `config/busqueda` | RF-05 |
| `clasificar --corrida-id ID` | Gemini con salida JSON con esquema; reintenta 1 vez y deja “sin clasificar” si falla | RF-06 |
| `cerrar --corrida-id ID [--fallo "..."]` | Estado de fuentes, alerta de 0 avisos 3 días, correo resumen y libera el lock | RF-12, RF-14 |
| `verificar` | Log de alerta si no hubo corrida exitosa en 26 h | RF-12 |
| `reclasificar` | Vuelve a clasificar las abiertas (P1) | P1 |
| `probar-acceso` | Prueba HTTP y navegador sin interfaz para cada fuente y lo guarda en `fuentes` | RF-13 |
| `agente` | Agente local en la oficina para fuentes con método `agente_local` | RF-13 |
| `evaluar --set eval/set_etiquetado.jsonl` | Acuerdo alta / no alta con el set etiquetado (CI) | RF-06 |
| `seed`, `bootstrap-admin --email`, `migrar --export DIR` | Arranque y migración del radar actual | RF-10, RF-11 |

## Estructura

- `radar/collectors/`: un módulo por fuente con la misma interfaz (`fetch → parse → AvisoNormalizado[]`). Para
  sumar una fuente en la fase 2 alcanza con un módulo nuevo y una línea en `collectors/__init__.py`.
- `radar/http.py`: lector HTTP y navegador sin interfaz. Respeta robots.txt, hace como máximo 1 pedido por
  segundo por sitio, se identifica con su User-Agent y detecta bloqueos de acceso.
- `radar/dedup.py` y `radar/prefiltro.py`: lógica pura, testeada sin red.
- `radar/clasificacion/`: prompt versionado (`PROMPT_VERSION`) y cliente de Vertex AI.
- `radar/etapas.py`: las etapas de la corrida. Solo usan `Repositorio` y `Almacen`, así los tests corren con
  dobles en memoria.

## Tests

```bash
.venv/bin/pytest -q
```

Los fixtures de `tests/fixtures/` son sintéticos (ver su README): se reemplazan por respuestas reales en la semana 1.
