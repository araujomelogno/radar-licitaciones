# Imagen única del pipeline: collectors, etapas de la corrida y herramientas.
# Cada Cloud Run Job cambia los argumentos: `collect --fuente arce ...`, `consolidar ...`, etc.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY pyproject.toml ./
COPY radar ./radar
# Chromium para el método “navegador sin interfaz” (RF-13).
RUN pip install ".[navegador]" playwright==1.63.0 \
 && python -m playwright install --with-deps chromium \
 && useradd --create-home --uid 10001 radar
COPY eval ./eval

USER radar
ENTRYPOINT ["python", "-m", "radar.cli"]
CMD ["verificar"]
