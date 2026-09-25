import type { OperationDoc } from "../types";

/** GET /api/v1/events/export */
export const routeDoc: OperationDoc = {
  summary: "Stream event export",
  description:
    "Streams events as csv, json, or ndjson without loading the full " +
    "result set into memory. Uses keyset pagination under the hood.",
  operationId: "exportEvents",
  tags: ["Events"],
  parameters: [
    {
      name: "format",
      in: "query",
      schema: { type: "string", enum: ["csv", "json", "ndjson"], default: "csv" },
    },
    { name: "contractId", in: "query", schema: { type: "string" } },
    { name: "startLedger", in: "query", schema: { type: "integer" } },
    { name: "endLedger", in: "query", schema: { type: "integer" } },
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 1000000, default: 100000 },
    },
  ],
  responses: {
    "200": {
      description: "Streaming export body",
      content: {
        "text/csv": { schema: { type: "string" } },
        "application/json": { schema: { type: "string" } },
        "application/x-ndjson": { schema: { type: "string" } },
      },
    },
    "400": { description: "Invalid format" },
    "401": { description: "Missing or invalid API key" },
    "429": { description: "Rate limit exceeded" },
  },
};
