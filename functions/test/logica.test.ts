import { describe, expect, it } from "vitest";

import {
  diferencias, emailDelDominio, idInvitacion, lockVigente, mensajeCorridaEnCurso, nuevoCorridaId, rolValido,
} from "../src/logica.js";

describe("acceso", () => {
  it("solo acepta cuentas de equipos.com.uy", () => {
    expect(emailDelDominio("ana@equipos.com.uy")).toBe(true);
    expect(emailDelDominio("Ana@Equipos.com.uy")).toBe(true);
    expect(emailDelDominio("ana@gmail.com")).toBe(false);
    expect(emailDelDominio("ana@equipos.com.uy.evil.com")).toBe(false);
    expect(emailDelDominio(undefined)).toBe(false);
  });

  it("valida roles", () => {
    expect(rolValido("admin")).toBe(true);
    expect(rolValido("superadmin")).toBe(false);
    expect(rolValido(null)).toBe(false);
  });

  it("arma el id de invitación", () => {
    expect(idInvitacion("Marcos@equipos.com.uy")).toBe("invitacion-marcos@equipos.com.uy");
  });
});

describe("corridas", () => {
  const inicio = new Date("2026-10-25T09:05:07Z"); // 06:05:07 en Montevideo

  it("genera el id en hora de Montevideo", () => {
    expect(nuevoCorridaId(inicio)).toBe("20261025-060507-manual");
  });

  it("explica por qué rechaza una corrida manual", () => {
    expect(mensajeCorridaEnCurso(inicio)).toBe("ya hay una corrida en curso, empezó a las 06:05");
  });

  it("ignora un lock vencido", () => {
    const ahora = new Date("2026-10-25T10:00:00Z");
    expect(lockVigente({ corridaId: "x", expira: new Date("2026-10-25T10:30:00Z") }, ahora)).toBe(true);
    expect(lockVigente({ corridaId: "x", expira: new Date("2026-10-25T09:30:00Z") }, ahora)).toBe(false);
    expect(lockVigente(undefined, ahora)).toBe(false);
  });
});

describe("auditoría", () => {
  it("registra solo los campos que cambió una persona", () => {
    const antes = { incluir: ["encuesta"], umbrales: { alta: 70, media: 40 }, version: 3, actualizado: 1 };
    const despues = { incluir: ["encuesta", "sondeo"], umbrales: { media: 40, alta: 70 }, version: 4, actualizado: 2 };
    expect(diferencias(antes, despues)).toEqual({ incluir: { de: ["encuesta"], a: ["encuesta", "sondeo"] } });
  });

  it("no registra cambios del pipeline en fuentes", () => {
    expect(diferencias({ ultimaCorrida: { leidos: 1 } }, { ultimaCorrida: { leidos: 2 } })).toEqual({});
  });
});
