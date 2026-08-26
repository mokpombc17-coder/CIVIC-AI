import { z } from "zod";

export const simulationStates = ["READY", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type SimulationState = (typeof simulationStates)[number];

const simulationViewSchema = z
  .object({
    simulationId: z.string().uuid(),
    taskId: z.string().uuid(),
    state: z.enum(simulationStates),
    personaCount: z.number().int().positive(),
    progressPercent: z.number().int().min(0).max(100),
    cancelRequested: z.boolean(),
    errorCode: z.string().nullable(),
    createdAt: z.string().min(1),
    startedAt: z.string().min(1).nullable(),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

const filterOptionsSchema = z
  .object({
    genders: z.array(z.string().min(1)),
    ageGroups: z.array(z.string().min(1)),
    regions: z.array(z.string().min(1)),
    politicalIdeologies: z.array(z.string().min(1)),
  })
  .strict();

const simulationOptionsSchema = z
  .object({
    maxPersonaCount: z.number().int().positive(),
    defaultModel: z.string().min(1),
    models: z.array(z.string().min(1)).min(1),
    filters: filterOptionsSchema,
  })
  .strict()
  .refine((value) => value.models.includes(value.defaultModel), {
    message: "defaultModel must be included in models",
  });

const taskOptionSchema = z
  .object({
    id: z.string().uuid(),
    displayOrder: z.number().int(),
    content: z.string().min(1),
  })
  .strict();

const simulationResultSchema = z
  .object({
    schemaVersion: z.literal("CIVIC_TASK_SIMULATION_RESULT_V1"),
    task: z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().nullable(),
        status: z.string().min(1),
        question: z
          .object({
            id: z.string().uuid(),
            content: z.string().min(1),
            description: z.string().nullable(),
            options: z.array(taskOptionSchema).min(2),
          })
          .strict(),
      })
      .strict(),
    run: z
      .object({
        personaCount: z.number().int().positive(),
        modelType: z.string().min(1),
        sampleSeed: z.number().int().nullable(),
        filters: z.record(z.string(), z.array(z.string())),
      })
      .strict(),
    summary: z
      .object({
        requestedPersonaCount: z.number().int().positive(),
        answeredPersonaCount: z.number().int().nonnegative(),
        unansweredPersonaCount: z.number().int().nonnegative(),
        optionResults: z.array(
          z
            .object({
              optionId: z.string().uuid(),
              displayOrder: z.number().int(),
              content: z.string().min(1),
              count: z.number().int().nonnegative(),
              percentage: z.number().min(0).max(100),
            })
            .strict(),
        ),
      })
      .strict(),
    respondents: z.array(
      z
        .object({
          panelMemberOrdinal: z.number().int().positive(),
          selectedOptionId: z.string().uuid().nullable(),
          reason: z.string().nullable(),
          demographics: z
            .object({
              gender: z.string().nullable(),
              ageGroup: z.string().nullable(),
              region: z.string().nullable(),
              politicalIdeology: z.string().nullable(),
              informationType: z.string().nullable(),
            })
            .strict(),
        })
        .strict(),
    ),
    engine: z
      .object({
        name: z.string().min(1),
        sourceCommit: z.string().min(1),
        modelType: z.string().nullable(),
        elapsedSeconds: z.number().nonnegative().nullable(),
        profileSha256: z.string().min(1),
        networkSha256: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type SimulationView = z.infer<typeof simulationViewSchema>;
export type SimulationOptions = z.infer<typeof simulationOptionsSchema>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;

export function readSimulationView(value: unknown): SimulationView | null {
  const parsed = simulationViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationViews(value: unknown): readonly SimulationView[] | null {
  const parsed = z.array(simulationViewSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationOptions(value: unknown): SimulationOptions | null {
  const parsed = simulationOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationResult(value: unknown): SimulationResult | null {
  const parsed = simulationResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
