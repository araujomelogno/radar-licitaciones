// Cloud Functions del radar (RF-01, RF-09, RF-10).
//
// - registrarIngreso: crea o actualiza usuarios/{uid} al entrar; aplica una invitación pendiente.
// - asignarRol: solo admin; setea custom claims y usuarios/{uid}, o deja una invitación.
// - lanzarCorrida: solo admin; toma el lock corridas/actual y dispara el workflow radar-corrida.
// - auditarCambios*: deja en auditoria cada cambio de config/* y fuentes/*.

import { ExecutionsClient } from "@google-cloud/workflows";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten, type FirestoreEvent, type Change, type DocumentSnapshot } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import {
  LOCK_MINUTOS, ORG_ID, diferencias, emailDelDominio, idInvitacion, lockVigente, mensajeCorridaEnCurso,
  nuevoCorridaId, rolValido, type Rol,
} from "./logica.js";

initializeApp();
const db = getFirestore();

const REGION = "southamerica-east1";
setGlobalOptions({
  region: REGION,
  // Cuenta de servicio propia creada por Terraform (forma corta: se completa con el dominio del proyecto).
  serviceAccount: process.env.FUNCTIONS_SERVICE_ACCOUNT || "radar-functions@",
  maxInstances: 5,
});

const WORKFLOW_NAME = process.env.WORKFLOW_NAME || "radar-corrida";
const WORKFLOW_LOCATION = process.env.WORKFLOW_LOCATION || REGION;

function exigirDominio(req: CallableRequest): { uid: string; email: string } {
  const token = req.auth?.token;
  if (!req.auth || !token) throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
  if (!token.email_verified || !emailDelDominio(token.email)) {
    throw new HttpsError("permission-denied", "Solo cuentas de equipos.com.uy.");
  }
  return { uid: req.auth.uid, email: String(token.email).toLowerCase() };
}

function exigirAdmin(req: CallableRequest): { uid: string; email: string } {
  const quien = exigirDominio(req);
  if (req.auth?.token.rol !== "admin") throw new HttpsError("permission-denied", "Solo un admin puede hacer esto.");
  return quien;
}

async function aplicarRol(uid: string, email: string, rol: Rol | null, autor: string): Promise<void> {
  const auth = getAuth();
  const actuales = (await auth.getUser(uid)).customClaims ?? {};
  const claims = { ...actuales, orgId: ORG_ID } as Record<string, unknown>;
  if (rol) claims.rol = rol;
  else delete claims.rol;
  await auth.setCustomUserClaims(uid, claims);
  const ref = db.collection("usuarios").doc(uid);
  const previo = (await ref.get()).data();
  await ref.set({
    email, rol, orgId: ORG_ID,
    claimsActualizados: FieldValue.serverTimestamp(),
    ...(previo ? {} : { creado: FieldValue.serverTimestamp() }),
  }, { merge: true });
  await db.collection("auditoria").add({
    fecha: FieldValue.serverTimestamp(), autor, coleccion: "usuarios", docId: uid, accion: "asignar_rol",
    cambios: { rol: { de: previo?.rol ?? null, a: rol } }, orgId: ORG_ID,
  });
}

// ── registrarIngreso ─────────────────────────────────────────────────────────

export const registrarIngreso = onCall(async (req) => {
  const { uid, email } = exigirDominio(req);
  const token = req.auth!.token;
  const ref = db.collection("usuarios").doc(uid);
  const previo = (await ref.get()).data();
  let rol: Rol | null = rolValido(token.rol) ? token.rol : rolValido(previo?.rol) ? previo!.rol : null;

  const invitacion = db.collection("usuarios").doc(idInvitacion(email));
  const inv = (await invitacion.get()).data();
  if (!rol && inv && rolValido(inv.rol)) {
    await aplicarRol(uid, email, inv.rol, inv.invitadoPor ?? "invitación");
    await invitacion.delete();
    rol = inv.rol;
  }
  await ref.set({
    email,
    nombre: token.name ?? previo?.nombre ?? "",
    foto: token.picture ?? previo?.foto ?? null,
    rol,
    orgId: ORG_ID,
    ultimoAcceso: FieldValue.serverTimestamp(),
    ...(previo ? {} : { creado: FieldValue.serverTimestamp() }),
  }, { merge: true });
  return { rol };
});

// ── asignarRol ───────────────────────────────────────────────────────────────

export const asignarRol = onCall(async (req) => {
  const admin = exigirAdmin(req);
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  const rol = req.data?.rol ?? null;
  if (!emailDelDominio(email)) throw new HttpsError("invalid-argument", "El usuario tiene que tener una cuenta @equipos.com.uy.");
  if (rol !== null && !rolValido(rol)) throw new HttpsError("invalid-argument", "Rol inválido.");

  let uid: string | null = null;
  try {
    uid = (await getAuth().getUserByEmail(email)).uid;
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
  if (uid === admin.uid && rol !== "admin") {
    throw new HttpsError("failed-precondition", "No podés quitarte el rol de admin a vos mismo.");
  }
  if (!uid) {
    // Todavía no entró nunca: queda una invitación que se aplica en su primer ingreso.
    await db.collection("usuarios").doc(idInvitacion(email)).set({
      email, rol, pendiente: true, invitadoPor: admin.email, creado: FieldValue.serverTimestamp(), orgId: ORG_ID,
    });
    logger.info("invitación creada", { email, rol, por: admin.email });
    return { uid: null, pendiente: true };
  }
  await aplicarRol(uid, email, rol, admin.email);
  logger.info("rol asignado", { email, rol, por: admin.email });
  return { uid, pendiente: false };
});

// ── lanzarCorrida ────────────────────────────────────────────────────────────

export const lanzarCorrida = onCall({ timeoutSeconds: 60 }, async (req) => {
  const admin = exigirAdmin(req);
  const ahora = new Date();
  const corridaId = nuevoCorridaId(ahora, "manual");
  const lockRef = db.collection("corridas").doc("actual");

  await db.runTransaction(async (tx) => {
    const lock = (await tx.get(lockRef)).data();
    const vigente = lock && lockVigente({ corridaId: lock.corridaId, expira: lock.expira?.toDate?.() }, ahora);
    if (vigente) {
      throw new HttpsError("failed-precondition", mensajeCorridaEnCurso(lock!.inicio?.toDate?.() ?? ahora));
    }
    tx.set(lockRef, {
      lock: true, corridaId, inicio: Timestamp.fromDate(ahora),
      expira: Timestamp.fromDate(new Date(ahora.getTime() + LOCK_MINUTOS * 60_000)), orgId: ORG_ID,
    });
  });

  try {
    const cliente = new ExecutionsClient();
    const proyecto = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (await cliente.getProjectId());
    const [ejecucion] = await cliente.createExecution({
      parent: cliente.workflowPath(proyecto, WORKFLOW_LOCATION, WORKFLOW_NAME),
      execution: { argument: JSON.stringify({ corridaId, disparo: "manual", solicitadoPor: admin.email }) },
    });
    await db.collection("corridas").doc(corridaId).set({
      inicio: Timestamp.fromDate(ahora), estado: "en_curso", disparo: "manual", solicitadoPor: admin.email,
      ejecucion: ejecucion.name ?? null, orgId: ORG_ID,
    }, { merge: true });
    logger.info("corrida manual lanzada", { corridaId, por: admin.email, ejecucion: ejecucion.name });
    return { corridaId, ejecucion: ejecucion.name ?? null };
  } catch (e) {
    // No quedó corrida en marcha: se libera el lock para no bloquear la siguiente.
    await db.runTransaction(async (tx) => {
      const lock = (await tx.get(lockRef)).data();
      if (lock?.corridaId === corridaId) tx.delete(lockRef);
    });
    logger.error("no se pudo lanzar el workflow", { error: String(e) });
    throw new HttpsError("internal", "No se pudo lanzar la corrida. Probá de nuevo en unos minutos.");
  }
});

// ── auditoría de configuración ───────────────────────────────────────────────

const PIPELINE = new Set(["radar", "seed", "migración"]);

async function auditar(coleccion: string, event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { docId: string }>) {
  const antes = event.data?.before.exists ? event.data.before.data() : undefined;
  const despues = event.data?.after.exists ? event.data.after.data() : undefined;
  const cambios = diferencias(antes, despues);
  if (Object.keys(cambios).length === 0) return;
  const autor = (despues?.actualizadoPor ?? antes?.actualizadoPor ?? "sistema") as string;
  if (PIPELINE.has(autor) && coleccion === "fuentes") return;
  await db.collection("auditoria").add({
    fecha: FieldValue.serverTimestamp(),
    autor,
    coleccion,
    docId: event.params.docId,
    accion: !antes ? "crear" : !despues ? "borrar" : "editar",
    cambios,
    version: despues?.version ?? null,
    orgId: ORG_ID,
  });
}

export const auditarConfig = onDocumentWritten("config/{docId}", (event) => auditar("config", event));
export const auditarFuentes = onDocumentWritten("fuentes/{docId}", (event) => auditar("fuentes", event));
