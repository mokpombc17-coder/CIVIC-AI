import { z } from "zod";

const safeKrw = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().min(1);
const decimalText = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value))
  .refine(
    (value) => /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value) && Number.isFinite(Number(value)),
    {
      message: "finite decimal required",
    },
  );
const nonnegativeDecimalText = decimalText.refine((value) => Number(value) >= 0);
const positiveDecimalText = decimalText.refine((value) => Number(value) > 0);
const policyStatus = z.enum(["DRAFT", "ACTIVE", "RETIRED"]);

const walletSummarySchema = z
  .object({
    balanceKrw: safeKrw,
    heldKrw: safeKrw,
    availableKrw: safeKrw,
    spentTodayKrw: safeKrw,
    updatedAt: timestamp,
  })
  .strict();

const fxPolicySchema = z
  .object({
    versionNumber: z.number().int().positive(),
    status: policyStatus,
    usdToKrw: positiveDecimalText,
    sourceLabel: z.string().min(1),
    sourceEffectiveAt: timestamp,
    createdByEmail: z.string().email(),
    createdAt: timestamp,
    activatedAt: timestamp.nullable(),
  })
  .strict();

const providerPriceItemSchema = z
  .object({
    provider: z.string().min(1),
    exactModelId: z.string().min(1),
    inputUsdPerMillion: nonnegativeDecimalText,
    outputUsdPerMillion: nonnegativeDecimalText,
    cacheReadUsdPerMillion: nonnegativeDecimalText,
    cacheWriteUsdPerMillion: nonnegativeDecimalText,
    reasoningUsdPerMillion: nonnegativeDecimalText,
  })
  .strict();

const providerPricePolicySchema = z
  .object({
    versionNumber: z.number().int().positive(),
    status: policyStatus,
    sourceLabel: z.string().min(1),
    createdByEmail: z.string().email(),
    createdAt: timestamp,
    activatedAt: timestamp.nullable(),
    items: z.array(providerPriceItemSchema),
  })
  .strict();

const modelPriceItemSchema = z
  .object({
    exactModelId: z.string().min(1),
    modelMultiplier: positiveDecimalText,
    initialAverageUsd: nonnegativeDecimalText,
  })
  .strict();

const modelPricePolicySchema = z
  .object({
    versionNumber: z.number().int().positive(),
    status: policyStatus,
    globalMultiplier: positiveDecimalText,
    sourceLabel: z.string().min(1),
    createdByEmail: z.string().email(),
    createdAt: timestamp,
    activatedAt: timestamp.nullable(),
    items: z.array(modelPriceItemSchema),
  })
  .strict();

const billingPoliciesSchema = z
  .object({
    activeFx: fxPolicySchema,
    fx: z.array(fxPolicySchema).min(1),
    activeProviderPrices: providerPricePolicySchema,
    providerPrices: z.array(providerPricePolicySchema).min(1),
    activeModelPrices: modelPricePolicySchema,
    modelPrices: z.array(modelPricePolicySchema).min(1),
  })
  .strict();

const couponIssueSchema = z
  .object({
    amountKrw: safeKrw,
    issuedAt: timestamp,
    issuedByEmail: z.string().email(),
    rawCode: z.string().min(1),
  })
  .strict();

const dailyUsageSchema = z
  .object({
    day: z.string().min(1),
    taskTitle: z.string().min(1),
    actorEmail: z.string().email(),
    personaCount: z.number().int().positive(),
    chargedKrw: safeKrw,
  })
  .strict();

const simulationPreviewSchema = z
  .object({
    taskTitle: z.string().min(1),
    modelType: z.string().min(1),
    personaCount: z.number().int().positive(),
    estimatedKrw: safeKrw,
    holdKrw: safeKrw,
    estimatedSeconds: z.number().int().nonnegative().nullable(),
    sampleCount: z.number().int().nonnegative(),
    evidenceSource: z.string().min(1),
    policyFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

const simulationImportStatusSchema = z
  .object({
    status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    sourceSchema: z.string().min(1),
    batchDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    rowCounts: z.record(z.string(), z.number().int().nonnegative()),
    importedByEmail: z.string().email(),
    startedAt: timestamp,
    completedAt: timestamp.nullable(),
  })
  .strict();

export type WalletSummary = z.infer<typeof walletSummarySchema>;
export type FxPolicy = z.infer<typeof fxPolicySchema>;
export type ProviderPricePolicy = z.infer<typeof providerPricePolicySchema>;
export type ModelPricePolicy = z.infer<typeof modelPricePolicySchema>;
export type BillingPolicies = z.infer<typeof billingPoliciesSchema>;
export type CouponIssue = z.infer<typeof couponIssueSchema>;
export type DailyUsage = z.infer<typeof dailyUsageSchema>;
export type SimulationPreview = z.infer<typeof simulationPreviewSchema>;
export type SimulationImportStatus = z.infer<typeof simulationImportStatusSchema>;

export function readWalletSummary(value: unknown): WalletSummary | null {
  return parse(walletSummarySchema, value);
}

export function readBillingPolicies(value: unknown): BillingPolicies | null {
  return parse(billingPoliciesSchema, value);
}

export function readCouponIssue(value: unknown): CouponIssue | null {
  return parse(couponIssueSchema, value);
}

export function readDailyUsage(value: unknown): readonly DailyUsage[] | null {
  return parse(z.array(dailyUsageSchema), value);
}

export function readSimulationPreview(value: unknown): SimulationPreview | null {
  return parse(simulationPreviewSchema, value);
}

export function readSimulationImportStatus(value: unknown): SimulationImportStatus | null {
  return value === null ? null : parse(simulationImportStatusSchema, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
