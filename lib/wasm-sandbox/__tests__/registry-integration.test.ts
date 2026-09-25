import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import {
  registerCommunityParserFromManifest,
  registerCommunityParserFromBytes,
  clearCommunityParsers,
  getCommunityParser,
} from "../community-registry";
import { translateEvent, translateEventAsync } from "../../translator/registry";
import type { RawEvent } from "../../translator/types";
import { loadFixture } from "./fixtures";

const MANIFEST = path.join(
  process.cwd(),
  "lib/wasm-sandbox/community/example-sac-transfer/manifest.json"
);

const SAMPLE_RAW: RawEvent = {
  id: "0000001-0000000001",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
  topics: ["7472616e73666572"],
  data: "0000000000000000",
  ledger: 5_000_000,
  timestamp: 1_720_000_000,
  txHash: "b".repeat(64),
};

describe("Translation Registry ↔ WASM sandbox integration", () => {
  beforeEach(() => {
    clearCommunityParsers();
  });

  afterEach(() => {
    clearCommunityParsers();
  });

  it("registers from manifest and translates end-to-end via translateEventAsync", async () => {
    const entry = await registerCommunityParserFromManifest(MANIFEST);
    expect(entry.manifest.contractId).toBe(SAMPLE_RAW.contractId);
    expect(getCommunityParser(SAMPLE_RAW.contractId)?.blueprint.parserProvenance).toBe(
      "community-wasm"
    );

    const translated = await translateEventAsync(SAMPLE_RAW);
    expect(translated.status).toBe("translated");
    expect(translated.parserProvenance).toBe("community-wasm");
    expect(translated.eventType).toBe("transfer");
    expect(translated.description).toContain("Community parser");
    expect(translated.blueprintName).toBe("Example Community SAC Transfer Parser");
  });

  it("sync translateEvent does not execute WASM (returns cryptic / null path)", async () => {
    registerCommunityParserFromBytes(
      {
        id: "sync-check",
        contractId: SAMPLE_RAW.contractId,
        contractName: "Sync Check Parser",
        wasmPath: "./parser.wasm",
      },
      loadFixture("echo_parser.wasm")
    );

    // Sync path must not hang on WASM; community translate() returns null → cryptic.
    const translated = translateEvent(SAMPLE_RAW);
    expect(translated.status).toBe("cryptic");
    expect(translated.blueprintName).toBe("Sync Check Parser");
  });

  it("marks sandboxed provenance distinctly from native blueprints", async () => {
    registerCommunityParserFromBytes(
      {
        id: "prov",
        contractId: SAMPLE_RAW.contractId,
        contractName: "Prov Parser",
        wasmPath: "./x.wasm",
      },
      loadFixture("echo_parser.wasm")
    );
    const community = await translateEventAsync(SAMPLE_RAW);
    expect(community.parserProvenance).toBe("community-wasm");
  });
});
