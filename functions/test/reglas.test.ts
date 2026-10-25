// Tests de firestore.rules contra el emulador: `npm run test:reglas`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { arrayUnion, doc, getDoc, getDocs, collection, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const usuario = (email: string, rol?: string, verificado = true) =>
  env.authenticatedContext(email, { email, email_verified: verificado, ...(rol ? { rol } : {}) }).firestore();

const OP = {
  docId: "ce-1", titulo: "Encuesta de hogares", organismo: "MIDES", pais: "Uruguay", estado: "nueva",
  nota: "", historial: [{ tipo: "alta", a: "nueva", autor: "radar" }], relevancia: "alta", puntaje: 80, orgId: "equipos",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-radar",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "oportunidades/ce-1"), OP);
    await setDoc(doc(db, "config/busqueda"), { incluir: ["encuesta"], umbrales: { alta: 70, media: 40 }, version: 1 });
    await setDoc(doc(db, "fuentes/arce"), { nombre: "Compras Estatales", activa: true, metodo: "http", ceroConsecutivos: 0 });
    await setDoc(doc(db, "corridas/c1"), { estado: "ok" });
    await setDoc(doc(db, "usuarios/ana@equipos.com.uy"), { email: "ana@equipos.com.uy", rol: "editor" });
    await setDoc(doc(db, "auditoria/a1"), { autor: "x" });
  });
});

describe("acceso", () => {
  it("una cuenta de otro dominio no lee nada", async () => {
    const db = usuario("ana@gmail.com", "admin");
    await assertFails(getDoc(doc(db, "oportunidades/ce-1")));
    await assertFails(getDoc(doc(db, "fuentes/arce")));
  });

  it("un dominio parecido no pasa", async () => {
    await assertFails(getDoc(doc(usuario("ana@equipos.com.uy.evil.com", "admin"), "oportunidades/ce-1")));
  });

  it("sin rol no ve datos, pero sí su propio usuario", async () => {
    const db = usuario("ana@equipos.com.uy");
    await assertFails(getDoc(doc(db, "oportunidades/ce-1")));
    await assertSucceeds(getDoc(doc(db, "usuarios/ana@equipos.com.uy")));
  });

  it("sin email verificado no entra", async () => {
    await assertFails(getDoc(doc(usuario("ana@equipos.com.uy", "admin", false), "oportunidades/ce-1")));
  });
});

describe("lector", () => {
  it("consulta oportunidades, fuentes y corridas sin modificarlas", async () => {
    const db = usuario("leo@equipos.com.uy", "lector");
    await assertSucceeds(getDoc(doc(db, "oportunidades/ce-1")));
    await assertSucceeds(getDocs(collection(db, "corridas")));
    await assertSucceeds(getDoc(doc(db, "fuentes/arce")));
    await assertFails(getDoc(doc(db, "config/busqueda")));
    await assertFails(updateDoc(doc(db, "oportunidades/ce-1"), { nota: "x", actualizadoPor: "leo@equipos.com.uy" }));
  });
});

describe("editor", () => {
  const db = () => usuario("ed@equipos.com.uy", "editor");
  const historial = (a: string) => arrayUnion({ tipo: "estado", de: "nueva", a, autor: "ed@equipos.com.uy", fecha: Timestamp.now() });

  it("cambia estado y nota con historial", async () => {
    await assertSucceeds(updateDoc(doc(db(), "oportunidades/ce-1"), {
      estado: "analizando", estadoFecha: Timestamp.now(), nota: "lo miro", historial: historial("analizando"),
      actualizadoPor: "ed@equipos.com.uy",
    }));
  });

  it("no puede tocar la clasificación ni el cierre", async () => {
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), { relevancia: "baja", actualizadoPor: "ed@equipos.com.uy" }));
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), { cierre: Timestamp.now(), actualizadoPor: "ed@equipos.com.uy" }));
  });

  it("no puede firmar como otro", async () => {
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), { nota: "x", actualizadoPor: "otro@equipos.com.uy" }));
  });

  it("descartar exige motivo", async () => {
    const base = { estado: "descartada", historial: historial("descartada"), actualizadoPor: "ed@equipos.com.uy" };
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), base));
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), { ...base, motivoDescarte: { codigo: "otro", texto: "" } }));
    await assertSucceeds(updateDoc(doc(db(), "oportunidades/ce-1"), { ...base, motivoDescarte: { codigo: "monto" } }));
  });

  it("no puede borrar el historial", async () => {
    await assertFails(updateDoc(doc(db(), "oportunidades/ce-1"), { historial: [], actualizadoPor: "ed@equipos.com.uy" }));
  });

  it("carga un llamado manual", async () => {
    const id = "manual-llamado-beo-abc123";
    const manual = {
      docId: id, titulo: "Llamado BID", organismo: "MEF", pais: "Uruguay", canal: "BEO", estado: "nueva",
      manual: true, orgId: "equipos", actualizadoPor: "ed@equipos.com.uy",
    };
    await assertSucceeds(setDoc(doc(db(), `oportunidades/${id}`), manual));
    await assertFails(setDoc(doc(db(), "oportunidades/manual-sin-titulo-abc123"), { ...manual, docId: "manual-sin-titulo-abc123", titulo: "" }));
    await assertFails(setDoc(doc(db(), "oportunidades/ce-999"), { ...manual, docId: "ce-999" }));
  });

  it("lee config pero no la edita, ni ve usuarios ni auditoría", async () => {
    await assertSucceeds(getDoc(doc(db(), "config/busqueda")));
    await assertFails(setDoc(doc(db(), "config/busqueda"), { incluir: [], actualizadoPor: "ed@equipos.com.uy" }, { merge: true }));
    await assertFails(getDocs(collection(db(), "usuarios")));
    await assertFails(getDocs(collection(db(), "auditoria")));
  });
});

describe("admin", () => {
  const db = () => usuario("jefa@equipos.com.uy", "admin");

  it("edita la búsqueda con validación", async () => {
    await assertSucceeds(setDoc(doc(db(), "config/busqueda"), {
      incluir: ["encuesta", "sondeo"], umbrales: { alta: 75, media: 45 }, actualizadoPor: "jefa@equipos.com.uy",
    }, { merge: true }));
    await assertFails(setDoc(doc(db(), "config/busqueda"), {
      umbrales: { alta: 30, media: 45 }, actualizadoPor: "jefa@equipos.com.uy",
    }, { merge: true }));
    await assertFails(setDoc(doc(db(), "config/busqueda"), {
      incluir: Array.from({ length: 201 }, (_, i) => `k${i}`), actualizadoPor: "jefa@equipos.com.uy",
    }, { merge: true }));
  });

  it("prende, apaga y cambia el método de una fuente, pero no su estado", async () => {
    await assertSucceeds(setDoc(doc(db(), "fuentes/arce"), {
      activa: false, metodo: "agente_local", actualizadoPor: "jefa@equipos.com.uy",
    }, { merge: true }));
    await assertFails(setDoc(doc(db(), "fuentes/arce"), {
      ceroConsecutivos: 5, actualizadoPor: "jefa@equipos.com.uy",
    }, { merge: true }));
  });

  it("lee usuarios y auditoría pero no los escribe", async () => {
    await assertSucceeds(getDocs(collection(db(), "usuarios")));
    await assertSucceeds(getDocs(collection(db(), "auditoria")));
    await assertFails(setDoc(doc(db(), "usuarios/x"), { rol: "admin" }));
    await assertFails(setDoc(doc(db(), "corridas/actual"), { lock: true }));
  });
});
