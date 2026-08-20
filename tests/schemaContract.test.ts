import { describe, expect, it } from "vitest";
import {
  assertCriticalSchemaContract,
  criticalSchemaContract,
  schemaContractSummary,
  type SchemaContractConnection,
} from "../scripts/schemaContract.js";

function contractRows() {
  return Object.entries(criticalSchemaContract).flatMap(([table, columns]) =>
    columns.map((column) => ({ table_name: table, column_name: column })),
  );
}

function connectionReturning(rows: ReturnType<typeof contractRows>): SchemaContractConnection {
  return {
    query: async () => [rows, []],
  } as unknown as SchemaContractConnection;
}

describe("critical database schema contract", () => {
  it("accepts a complete Phase Kickoff and operational schema", async () => {
    await expect(assertCriticalSchemaContract(connectionReturning(contractRows()))).resolves.toBeUndefined();
    expect(schemaContractSummary()).toMatch(/^\d+ critical tables verified$/);
  });

  it("fails before portal startup when a Phase Kickoff column is absent", async () => {
    const incompleteRows = contractRows().filter(
      (row) => !(row.table_name === "phase_kickoff_configs" && row.column_name === "completion_percent"),
    );

    await expect(assertCriticalSchemaContract(connectionReturning(incompleteRows))).rejects.toThrow(
      "phase_kickoff_configs.completion_percent",
    );
  });

  it("reports a missing operational table by name", async () => {
    const incompleteRows = contractRows().filter((row) => row.table_name !== "outbound_call_logs");

    await expect(assertCriticalSchemaContract(connectionReturning(incompleteRows))).rejects.toThrow(
      "outbound_call_logs (table missing)",
    );
  });
});
