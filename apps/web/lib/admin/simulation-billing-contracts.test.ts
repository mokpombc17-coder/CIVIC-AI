import { describe, expect, it } from "vitest";
import {
  readBillingPolicies,
  readSimulationImportStatus,
  readSimulationPreview,
  readWalletSummary,
} from "./simulation-billing-contracts";

describe("simulation billing contracts", () => {
  it("accepts safe integer KRW wallet values without an internal wallet id", () => {
    expect(
      readWalletSummary({
        balanceKrw: 100_000,
        heldKrw: 12_000,
        availableKrw: 88_000,
        spentTodayKrw: 2_700,
        updatedAt: "2026-08-27T12:00:00Z",
      }),
    ).not.toBeNull();
    expect(
      readWalletSummary({
        walletId: "internal-wallet",
        balanceKrw: 100_000,
        heldKrw: 0,
        availableKrw: 100_000,
        spentTodayKrw: 0,
        updatedAt: "2026-08-27T12:00:00Z",
      }),
    ).toBeNull();
    expect(
      readWalletSummary({
        balanceKrw: Number.MAX_SAFE_INTEGER + 1,
        heldKrw: 0,
        availableKrw: 0,
        spentTodayKrw: 0,
        updatedAt: "2026-08-27T12:00:00Z",
      }),
    ).toBeNull();
  });

  it("accepts complete active pricing evidence and rejects non-finite decimal text", () => {
    const fx = {
      versionNumber: 1,
      status: "ACTIVE",
      usdToKrw: "1350.00",
      sourceLabel: "SONA",
      sourceEffectiveAt: "2026-08-27T00:00:00Z",
      createdByEmail: "admin@example.com",
      createdAt: "2026-08-27T00:00:00Z",
      activatedAt: "2026-08-27T00:00:00Z",
    };
    const provider = {
      versionNumber: 1,
      status: "ACTIVE",
      sourceLabel: "SONA",
      createdByEmail: "admin@example.com",
      createdAt: "2026-08-27T00:00:00Z",
      activatedAt: "2026-08-27T00:00:00Z",
      items: [
        {
          provider: "openrouter",
          exactModelId: "anthropic/claude-sonnet-4.6",
          inputUsdPerMillion: "3",
          outputUsdPerMillion: "15",
          cacheReadUsdPerMillion: "0.3",
          cacheWriteUsdPerMillion: "3.75",
          reasoningUsdPerMillion: "15",
        },
      ],
    };
    const model = {
      versionNumber: 1,
      status: "ACTIVE",
      globalMultiplier: "4",
      sourceLabel: "SONA",
      createdByEmail: "admin@example.com",
      createdAt: "2026-08-27T00:00:00Z",
      activatedAt: "2026-08-27T00:00:00Z",
      items: [
        {
          exactModelId: "claude-sonnet-4-6",
          modelMultiplier: "4",
          initialAverageUsd: "0.05",
        },
      ],
    };
    expect(
      readBillingPolicies({
        activeFx: fx,
        fx: [fx],
        activeProviderPrices: provider,
        providerPrices: [provider],
        activeModelPrices: model,
        modelPrices: [model],
      }),
    ).not.toBeNull();
    expect(
      readBillingPolicies({
        activeFx: { ...fx, usdToKrw: "Infinity" },
        fx: [fx],
        activeProviderPrices: provider,
        providerPrices: [provider],
        activeModelPrices: model,
        modelPrices: [model],
      }),
    ).toBeNull();
  });

  it("accepts a human-readable preview and nullable import status", () => {
    expect(
      readSimulationPreview({
        taskTitle: "교통 정책",
        modelType: "claude-sonnet-4-6",
        personaCount: 10,
        estimatedKrw: 2_700,
        holdKrw: 3_240,
        estimatedSeconds: 45,
        sampleCount: 10,
        evidenceSource: "rolling_provider_cost",
        policyFingerprint: "a".repeat(64),
      }),
    ).not.toBeNull();
    expect(readSimulationImportStatus(null)).toBeNull();
    expect(
      readSimulationImportStatus({
        batchId: "must-not-be-exposed",
        status: "COMPLETED",
        sourceCommit: "b".repeat(40),
        sourceSchema: "SONA_BILLING_EVIDENCE_V1",
        batchDigest: "c".repeat(64),
        rowCounts: { fx: 1 },
        importedByEmail: "admin@example.com",
        startedAt: "2026-08-27T12:00:00Z",
        completedAt: "2026-08-27T12:00:01Z",
      }),
    ).toBeNull();
  });
});
