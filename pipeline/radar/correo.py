"""Resumen de cada corrida por correo (RF-14, E8) y envío por Gmail API.

El envío usa delegación de dominio desde la cuenta de servicio del pipeline,
firmando el JWT con IAM Credentials: no hay claves de servicio descargadas.
"""

from __future__ import annotations

import base64
import html
from collections import Counter
from datetime import datetime
from email.message import EmailMessage
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .modelos import FUENTES, relevancia_de

TZ = ZoneInfo("America/Montevideo")
GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
SCOPE_GMAIL = "https://www.googleapis.com/auth/gmail.send"


def _fecha(dt: Any) -> str:
    if not isinstance(dt, datetime):
        return "fecha a confirmar"
    return dt.astimezone(TZ).strftime("%d/%m/%Y")


def armar_resumen(corrida_id: str, corrida: dict[str, Any], nuevas: list[dict[str, Any]],
                  umbrales: dict[str, int], app_url: str, fuentes_en_cero: list[str]) -> tuple[str, str, str]:
    """Devuelve (asunto, texto plano, html)."""
    inicio = corrida.get("inicio")
    dia = inicio.astimezone(TZ).strftime("%d/%m/%Y") if isinstance(inicio, datetime) else corrida_id[:8]
    visibles = [n for n in nuevas if not n.get("manual")]
    for n in visibles:
        n["_rel"] = relevancia_de(n.get("puntaje"), umbrales) if n.get("puntaje") is not None else n.get("relevancia")
    relevantes = sorted(
        (n for n in visibles if n["_rel"] in ("alta", "media")),
        key=lambda n: (0 if n["_rel"] == "alta" else 1, -(n.get("puntaje") or 0)),
    )
    por_pais = Counter(n.get("pais", "?") for n in visibles)
    por_fuente = Counter(f for n in visibles for f in (n.get("fuentes") or [n.get("fuente", "?")]))
    fallidas = [
        (FUENTES[fid].nombre if fid in FUENTES else fid, r.get("error") or r.get("estado"))
        for fid, r in sorted((corrida.get("fuentes") or {}).items())
        if r.get("estado") in ("error", "bloqueo")
    ]
    estado = corrida.get("estado", "")
    asunto = f"Radar {dia}: {len(visibles)} nuevas, {len(relevantes)} relevantes"
    if fallidas:
        asunto += f" · {len(fallidas)} fuente{'s' if len(fallidas) > 1 else ''} con falla"

    lineas = [f"Radar de licitaciones · corrida del {dia} ({estado})", ""]
    if not visibles:
        lineas.append("No hubo llamados nuevos en esta corrida.")
    else:
        lineas.append(f"Nuevas: {len(visibles)} · " + ", ".join(f"{p}: {c}" for p, c in por_pais.most_common()))
        lineas.append("Por fuente: " + ", ".join(f"{f}: {c}" for f, c in por_fuente.most_common()))
        lineas.append("")
        if relevantes:
            lineas.append("Relevancia alta y media:")
            for n in relevantes:
                lineas.append(f"- [{n['_rel'].upper()}] {n.get('titulo', '')} · {n.get('organismo', '')} · "
                              f"{n.get('pais', '')} · cierre {_fecha(n.get('cierre'))}")
        else:
            lineas.append("Ninguna nueva de relevancia alta o media.")
    if fallidas:
        lineas += ["", "Fuentes que fallaron:"] + [f"- {f}: {d}" for f, d in fallidas]
    if fuentes_en_cero:
        lineas += ["", "Fuentes con 0 avisos 3 días seguidos: "
                   + ", ".join(FUENTES[f].nombre if f in FUENTES else f for f in fuentes_en_cero)]
    if corrida.get("fallo"):
        lineas += ["", f"La corrida terminó con error: {corrida['fallo']}"]
    if app_url:
        lineas += ["", f"Abrir el radar: {app_url}"]
    texto = "\n".join(lineas)
    return asunto, texto, _html(dia, estado, visibles, relevantes, por_pais, por_fuente, fallidas,
                                fuentes_en_cero, corrida.get("fallo"), app_url)


def _html(dia: str, estado: str, visibles: list[dict[str, Any]], relevantes: list[dict[str, Any]],
          por_pais: Counter, por_fuente: Counter, fallidas: list[tuple[str, str]], en_cero: list[str],
          fallo: str | None, app_url: str) -> str:
    e = html.escape
    naranja, oscuro, gris = "#E96436", "#3A3838", "#7A7A7A"
    partes = [
        '<div style="font-family:Montserrat,Arial,sans-serif;color:#222;max-width:640px">',
        f'<div style="background:{oscuro};color:#fff;padding:16px 20px;font-weight:800;font-size:16px">'
        f'Radar de licitaciones <span style="color:{naranja}">·</span> {e(dia)}</div>',
        f'<div style="height:4px;width:44px;background:{naranja};margin:16px 20px 8px"></div>',
        '<div style="padding:0 20px 20px">',
    ]
    if not visibles:
        partes.append("<p>No hubo llamados nuevos en esta corrida.</p>")
    else:
        partes.append(f"<p><strong>{len(visibles)} nuevas</strong> · "
                      + " · ".join(f"{e(p)}: {c}" for p, c in por_pais.most_common()) + "<br>"
                      + f'<span style="color:{gris};font-size:13px">'
                      + " · ".join(f"{e(f)}: {c}" for f, c in por_fuente.most_common()) + "</span></p>")
        if relevantes:
            partes.append('<table style="border-collapse:collapse;width:100%;font-size:13px">')
            for n in relevantes:
                color = naranja if n["_rel"] == "alta" else "#B7791F"
                titulo = e(n.get("titulo", ""))
                if n.get("url"):
                    titulo = f'<a href="{e(n["url"])}" style="color:{oscuro};font-weight:700">{titulo}</a>'
                partes.append(
                    f'<tr><td style="padding:8px 0;border-bottom:1px solid #E2E2E2;vertical-align:top">'
                    f'<span style="background:{color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;'
                    f'border-radius:3px;text-transform:uppercase">{e(n["_rel"])}</span> {titulo}<br>'
                    f'<span style="color:{gris}">{e(n.get("organismo", ""))} · {e(n.get("pais", ""))} · '
                    f'cierre {_fecha(n.get("cierre"))}</span></td></tr>')
            partes.append("</table>")
        else:
            partes.append("<p>Ninguna nueva de relevancia alta o media.</p>")
    if fallidas:
        partes.append('<p style="color:#B83A26"><strong>Fuentes que fallaron:</strong><br>'
                      + "<br>".join(f"{e(f)}: {e(str(d))}" for f, d in fallidas) + "</p>")
    if en_cero:
        partes.append(f'<p style="color:#B7791F">Fuentes con 0 avisos 3 días seguidos: '
                      f'{e(", ".join(FUENTES[f].nombre if f in FUENTES else f for f in en_cero))}</p>')
    if fallo:
        partes.append(f'<p style="color:#B83A26">La corrida terminó con error: {e(fallo)}</p>')
    if app_url:
        partes.append(f'<p><a href="{e(app_url)}" style="background:{naranja};color:#fff;padding:10px 16px;'
                      f'text-decoration:none;font-weight:700;border-radius:3px;display:inline-block">'
                      f'Abrir el radar</a></p>')
    partes.append(f'<p style="color:{gris};font-size:11px">Estado de la corrida: {e(estado)}</p></div></div>')
    return "".join(partes)


def mensaje(remitente: str, destinatarios: list[str], asunto: str, texto: str, cuerpo_html: str) -> EmailMessage:
    m = EmailMessage()
    m["From"] = f"Radar de licitaciones <{remitente}>"
    m["To"] = ", ".join(destinatarios)
    m["Subject"] = asunto
    m.set_content(texto)
    m.add_alternative(cuerpo_html, subtype="html")
    return m


def _credenciales_delegadas(sa_email: str, remitente: str) -> Any:
    import google.auth
    from google.auth import iam
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    base, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    firmante = iam.Signer(Request(), base, sa_email)
    cred = service_account.Credentials(
        firmante, sa_email, "https://oauth2.googleapis.com/token", scopes=[SCOPE_GMAIL], subject=remitente,
    )
    cred.refresh(Request())
    return cred


def enviar_gmail(sa_email: str, m: EmailMessage) -> None:
    remitente = m["From"].split("<")[-1].rstrip(">")
    cred = _credenciales_delegadas(sa_email, remitente)
    raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
    r = httpx.post(GMAIL_SEND, json={"raw": raw}, headers={"Authorization": f"Bearer {cred.token}"}, timeout=30)
    r.raise_for_status()
