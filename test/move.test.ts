import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect, test } from "@jest/globals";
import { app } from "../src/app.js";
import { isState } from "../src/state.js";
import { chooseMove } from "../src/strategy.js";

// El fixture es un estado conocido para repetir las pruebas con los mismos datos.
// La URL relativa a este archivo permite encontrarlo sin depender del directorio actual.
const fixture = JSON.parse(readFileSync(new URL("../fixtures/state1.json", import.meta.url), "utf8"));

test("elige piezas propias, ignora casas neutrales y no modifica el estado", () => {
  // Validamos el fixture antes de pasarlo a la estrategia.
  assert.ok(isState(fixture));
  // Una copia profunda permite detectar si la estrategia modifica el tablero original.
  const original = structuredClone(fixture);
  const moveA = chooseMove(fixture);
  const moveB = chooseMove({ ...fixture, jugador: "B" });
  expect(Object.keys(moveA)).toEqual(["A1"]);
  expect(["N", "E", "S", "O"]).toContain(moveA.A1);
  expect(Object.keys(moveB)).toEqual(["B2"]);
  expect(["N", "E", "S", "O"]).toContain(moveB.B2);
  expect(fixture).toEqual(original);
  // Sin piezas, la respuesta debe ser un diccionario vacío.
  const empty = structuredClone(fixture);
  empty.tablero.forEach((row: string[]) => row.fill(""));
  expect(chooseMove(empty)).toEqual({});
});

test("prioriza casillas neutrales y mueve sin violar las reglas", () => {
  const state = structuredClone(fixture);
  state.jugador = "A";
  state.tablero = Array.from({ length: 10 }, () => Array(10).fill(""));
  state.tablero[5][5] = "A1";
  state.tablero[5][6] = "N";
  state.tablero[4][5] = "A2";
  const movement = chooseMove(state);
  expect(movement.A1).toBe("E");
  expect(["N", "E", "S", "O"]).toContain(movement.A2);
});

test("no propone movimientos inválidos en los bordes ni sobre fichas propias", () => {
  const state = structuredClone(fixture);
  state.jugador = "A";
  state.tablero = Array.from({ length: 10 }, () => Array(10).fill(""));
  state.tablero[0][0] = "A1";
  state.tablero[0][1] = "A2";
  state.tablero[1][0] = "B1";
  const movement = chooseMove(state);
  expect(["N", "E", "S", "O"]).toContain(movement.A1);
  expect(["N", "E", "S", "O"]).toContain(movement.A2);
});

test.each(["A", "B"] as const)("mueve todas las fichas de %s sin modificar el estado", jugador => {
  const state = structuredClone(fixture);
  state.jugador = jugador;
  // Dos fichas en la misma fila y otra en una fila posterior.
  state.tablero[2][3] = "A2";
  state.tablero[8][4] = "A3";
  state.tablero[7][8] = "B3";
  state.tablero[9][9] = "B4";
  const original = structuredClone(state);
  const movement = chooseMove(state);
  const expectedKeys = jugador === "A" ? ["A1", "A2", "A3"] : ["B2", "B3", "B4"];
  expect(Object.keys(movement).sort()).toEqual(expectedKeys.sort());
  for (const value of Object.values(movement)) {
    expect(["N", "E", "S", "O"]).toContain(value);
  }
  expect(state).toEqual(original);
});

test.each(["A", "B"] as const)("devuelve un objeto vacío si %s no tiene fichas", jugador => {
  const state = structuredClone(fixture);
  state.jugador = jugador;
  state.tablero.forEach((row: string[]) => row.fill(""));
  state.tablero[0][0] = "N";
  state.tablero[1][1] = jugador === "A" ? "B1" : "A1";
  expect(chooseMove(state)).toEqual({});
});

test("POST /move valida el estado y devuelve un diccionario", async () => {
  // El puerto 0 solicita un puerto libre al sistema para evitar conflictos.
  const server = app.listen(0, "127.0.0.1");
  // Esperamos a que el servidor esté listo antes de enviar solicitudes.
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  // Reutilizamos el mismo envío HTTP para los casos válidos e inválidos.
  const post = (body: string) => fetch(`http://127.0.0.1:${address.port}/move`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  try {
    // Verificamos tanto el código HTTP como la pieza elegida para cada jugador.
    for (const jugador of ["A", "B"]) {
      const response = await post(JSON.stringify({ ...fixture, jugador }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(typeof body).toBe("object");
      for (const value of Object.values(body)) {
        expect(["N", "E", "S", "O"]).toContain(value);
      }
    }
    // El endpoint también debe devolver todas las fichas de cada jugador.
    const multiple = structuredClone(fixture);
    multiple.tablero[2][3] = "A2";
    multiple.tablero[8][4] = "A3";
    multiple.tablero[7][8] = "B3";
    for (const jugador of ["A", "B"]) {
      const response = await post(JSON.stringify({ ...multiple, jugador }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(typeof body).toBe("object");
      for (const value of Object.values(body)) {
        expect(["N", "E", "S", "O"]).toContain(value);
      }
    }
    // Los tres resultados posibles del dado deben ser aceptados.
    for (const dado of [1, 2, 3]) {
      expect((await post(JSON.stringify({ ...fixture, dado }))).status).toBe(200);
    }
    // Alteramos copias para probar casillas inválidas y filas incompletas.
    const badCell = structuredClone(fixture);
    badCell.tablero[0][0] = null;
    const shortRow = structuredClone(fixture);
    shortRow.tablero[0].pop();
    // Cada estado inválido debe devolver 400, sin llegar a elegir un movimiento.
    for (const invalid of [null, {}, { ...fixture, jugador: "C" },
      ...[0, 4, 5, 6, 7, 1.5, "3"].map(dado => ({ ...fixture, dado })),
      { ...fixture, tablero: fixture.tablero.slice(1) }, badCell, shortRow]) {
      expect((await post(JSON.stringify(invalid))).status).toBe(400);
    }
    // También cubrimos un body que ni siquiera tiene sintaxis JSON válida.
    expect((await post("{invalid")).status).toBe(400);
  } finally {
    // Cerramos el servidor incluso si falla una aserción para liberar el puerto.
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
