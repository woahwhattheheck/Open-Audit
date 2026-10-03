import { describe, expect, it } from "vitest";
import { StrKey, xdr } from "stellar-sdk";
import { reconstructDagFromMetaXdr } from "./engine";

const contractId = Buffer.alloc(32, 1);
const contractAddress = StrKey.encodeContract(contractId);

// SDK declarations omit the numeric-switch union constructor arguments.
// Construct real XDR unions through the runtime constructor, without mocks.
function makeUnion<T>(type: new () => T, tag: number, value?: unknown): T {
  return Reflect.construct(type, [tag, value]) as T;
}

function makeEvent(
  functionName: string,
  rawContractId: Buffer | null = contractId,
  type: xdr.ContractEventType = xdr.ContractEventType.contract(),
  data: xdr.ScVal = xdr.ScVal.scvVoid()
): xdr.ContractEvent {
  return new xdr.ContractEvent({
    ext: makeUnion(xdr.ExtensionPoint, 0),
    contractId: rawContractId,
    type,
    body: makeUnion(
      xdr.ContractEventBody,
      0,
      new xdr.ContractEventV0({
        topics: [xdr.ScVal.scvSymbol(functionName)],
        data,
      })
    ),
  });
}

function makeDiagnostic(event: xdr.ContractEvent, successful = true): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: successful,
    event,
  });
}

function makeMeta(
  diagnosticEvents: xdr.DiagnosticEvent[],
  events: xdr.ContractEvent[] = []
): string {
  return makeUnion(
    xdr.TransactionMeta,
    3,
    new xdr.TransactionMetaV3({
      ext: makeUnion(xdr.ExtensionPoint, 0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: makeUnion(xdr.SorobanTransactionMetaExt, 0),
        events,
        returnValue: xdr.ScVal.scvVoid(),
        diagnosticEvents,
      }),
    })
  ).toXDR("base64");
}

describe("reconstructDagFromMetaXdr with encoded SDK metadata", () => {
  it.each(["", "invalid-meta"])("returns null for invalid XDR %j", (meta) => {
    expect(reconstructDagFromMetaXdr(meta, "tx", 123, 456)).toBeNull();
  });

  it.each([makeUnion(xdr.TransactionMeta, 0, []).toXDR("base64"), makeMeta([])])(
    "returns null when metadata contains no Soroban diagnostic events",
    (meta) => {
      expect(reconstructDagFromMetaXdr(meta, "tx", 123, 456)).toBeNull();
    }
  );

  it("reconstructs a contract call through the real exported engine", () => {
    const meta = makeMeta([makeDiagnostic(makeEvent("transfer"))]);

    const dag = reconstructDagFromMetaXdr(meta, "tx", 123, 456);

    expect(dag).toEqual({
      txHash: "tx",
      ledger: 123,
      timestamp: 456,
      nodes: [
        {
          id: 0,
          kind: "contract_fn",
          contractId: contractAddress,
          functionName: "transfer",
          depth: 0,
          children: [],
          requiresAuth: false,
          authorizedBy: [],
        },
      ],
      maxDepth: 0,
      uniqueContracts: 1,
      hasReentrancy: false,
      reentrancyDetails: [],
      authTraces: [],
    });
  });

  it("excludes failed calls while retaining successful diagnostic events", () => {
    const meta = makeMeta([
      makeDiagnostic(makeEvent("failed"), false),
      makeDiagnostic(makeEvent("transfer")),
    ]);

    const dag = reconstructDagFromMetaXdr(meta, "tx", 123, 456);

    expect(dag?.nodes).toHaveLength(1);
    expect(dag?.nodes[0].functionName).toBe("transfer");
    expect(dag?.nodes[0].id).toBe(0);
  });

  it.each([false, true])(
    "preserves auth tracing with explicit addresses set to %s",
    (useExplicitAddresses) => {
      const rawAccount = Buffer.alloc(32, 2);
      const systemAccount = StrKey.encodeEd25519PublicKey(rawAccount);
      const explicitAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
      const systemEvent = makeEvent(
        "auth",
        null,
        xdr.ContractEventType.system(),
        xdr.ScVal.scvAddress(
          xdr.ScAddress.scAddressTypeAccount(xdr.PublicKey.publicKeyTypeEd25519(rawAccount))
        )
      );
      const meta = makeMeta([makeDiagnostic(makeEvent("require_auth"))], [systemEvent]);

      const dag = reconstructDagFromMetaXdr(
        meta,
        "tx",
        123,
        456,
        useExplicitAddresses ? [explicitAccount] : undefined
      );

      expect(dag?.authTraces).toEqual([
        {
          nodeId: 0,
          contractId: contractAddress,
          functionName: "require_auth",
          authorizedBy: [useExplicitAddresses ? explicitAccount : systemAccount],
        },
      ]);
    }
  );
});
