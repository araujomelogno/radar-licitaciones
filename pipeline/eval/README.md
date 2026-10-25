# Set etiquetado (RF-06)

`set_etiquetado.jsonl` tiene una línea por aviso: `{"id", "etiqueta": "alta" | "media" | "baja", "aviso": {...}}`.
El campo `aviso` usa los mismos nombres que `oportunidades` (`titulo`, `organismo`, `pais`, `tipo`, `fuente`,
`monto`, `moneda`, `texto`).

**Hoy tiene 5 ejemplos para probar el formato.** Antes de salir a producción, el equipo comercial tiene que
reemplazarlos por **50 avisos reales** de Uruguay y Paraguay tomados del historial del radar actual
(dependencia de la semana 3).

```bash
python -m radar.cli evaluar --set eval/set_etiquetado.jsonl --minimo 0.80
```

CI lo corre cada vez que cambia `radar/clasificacion/prompt.py` o este directorio. Falla si el acuerdo
alta / no alta queda por debajo del mínimo (80% para salir, 85% como meta a 30 días).
