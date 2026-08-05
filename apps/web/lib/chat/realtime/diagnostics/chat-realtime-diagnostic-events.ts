import { z } from "zod";

export const CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

const diagnosticEnvelopeShape = {
  eventVersion: z.literal(CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION),
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  elapsedMs: z.number().finite().nonnegative(),
  runtimeInstanceId: z.string().min(1).max(128),
  level: z.enum(["debug", "info", "warn", "error"]),
} as const;

const connectionAttemptIdSchema = z.string().min(1).max(128);
const generationSchema = z.number().int().nonnegative();
const portIdSchema = z.string().min(1).max(128);
const requestIdSchema = z.string().min(1).max(128);
const roomIdSchema = z.string().min(1).max(64);
const shortTextSchema = z.string().max(256);
const statusSchema = z.enum([
  "idle",
  "connecting",
  "connected",
  "reconnecting",
  "disconnecting",
  "disconnected",
  "replaced",
  "authentication-required",
  "error",
]);

function diagnosticEventSchema<TEvent extends string, TShape extends z.ZodRawShape>(
  event: TEvent,
  shape: TShape,
) {
  return z
    .object({
      ...diagnosticEnvelopeShape,
      event: z.literal(event),
      ...shape,
    })
    .strict();
}

export const chatRealtimeDiagnosticEventSchema = z.discriminatedUnion("event", [
  diagnosticEventSchema("runtime.started", {
    transportKind: z.enum(["shared-worker", "leader-tab", "direct"]),
  }),
  diagnosticEventSchema("port.attached", {
    portId: portIdSchema,
    attachedPortCount: z.number().int().nonnegative(),
  }),
  diagnosticEventSchema("port.detached", {
    portId: portIdSchema,
    attachedPortCount: z.number().int().nonnegative(),
  }),
  diagnosticEventSchema("connection.requested", {
    connectionAttemptId: connectionAttemptIdSchema,
    trigger: z.enum([
      "initial-attach",
      "transport-reconnect",
      "authentication-succeeded",
      "deactivation-completed",
      "manual",
    ]),
    statusBefore: statusSchema,
  }),
  diagnosticEventSchema("stomp.connected", {
    connectionAttemptId: connectionAttemptIdSchema,
    connectionDurationMs: z.number().finite().nonnegative(),
  }),
  diagnosticEventSchema("stomp.error", {
    connectionAttemptId: connectionAttemptIdSchema.nullable(),
    code: shortTextSchema.nullable(),
    retryable: z.boolean().nullable(),
  }),
  diagnosticEventSchema("websocket.error", {
    connectionAttemptId: connectionAttemptIdSchema.nullable(),
  }),
  diagnosticEventSchema("websocket.closed", {
    connectionAttemptId: connectionAttemptIdSchema.nullable(),
    closeCode: z.number().int().nonnegative().max(4999),
    closeReason: shortTextSchema,
    wasClean: z.boolean(),
    statusBefore: statusSchema,
    reconnectDecision: z.enum([
      "authentication-state-preserved",
      "connection-replaced",
      "room-access-revoked",
      "room-closed",
      "reconnecting",
      "disconnected",
    ]),
  }),
  diagnosticEventSchema("reconnect.requested", {
    reason: z.enum(["authentication-succeeded", "manual"]),
    statusBefore: statusSchema,
  }),
  diagnosticEventSchema("reconnect.suppressed", {
    reason: z.enum([
      "authentication-required",
      "connection-replaced",
      "inactive-client",
      "no-attached-ports",
    ]),
    statusBefore: statusSchema,
  }),
  diagnosticEventSchema("authentication.required", {
    connectionAttemptId: connectionAttemptIdSchema.nullable(),
  }),
  diagnosticEventSchema("room.claim.requested", {
    portId: portIdSchema,
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
  }),
  diagnosticEventSchema("room.subscriptions.started", {
    roomId: roomIdSchema,
    generation: generationSchema,
  }),
  diagnosticEventSchema("room.sync.requested", {
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
  }),
  diagnosticEventSchema("room.sync.ready", {
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
    messageVisibleAfterSequence: generationSchema,
    watermarkSequence: generationSchema,
  }),
  diagnosticEventSchema("room.sync.rejected", {
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
    code: shortTextSchema,
    retryable: z.boolean(),
  }),
  diagnosticEventSchema("room.activated", {
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
  }),
  diagnosticEventSchema("room.released", {
    requestId: requestIdSchema,
    roomId: roomIdSchema,
    generation: generationSchema,
  }),
  diagnosticEventSchema("room.replaced", {
    roomId: roomIdSchema,
    activatedRoomId: roomIdSchema,
    generation: generationSchema,
  }),
]);

export type ChatRealtimeDiagnosticEvent = Readonly<
  z.infer<typeof chatRealtimeDiagnosticEventSchema>
>;

type ChatRealtimeDiagnosticEnvelope = Readonly<{
  eventVersion: typeof CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION;
  sequence: number;
  occurredAt: string;
  elapsedMs: number;
  runtimeInstanceId: string;
  level: ChatRealtimeDiagnosticEvent["level"];
}>;

type DistributiveOmit<TValue, TKey extends PropertyKey> = TValue extends unknown
  ? Omit<TValue, TKey>
  : never;

export type ChatRealtimeDiagnosticEventInput = Readonly<
  DistributiveOmit<ChatRealtimeDiagnosticEvent, keyof ChatRealtimeDiagnosticEnvelope>
>;

export const chatRealtimeDiagnosticSnapshotSchema = z
  .object({
    schemaVersion: z.literal(CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION),
    capturedAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().positive(),
    droppedEventCount: z.number().int().nonnegative(),
    rejectedEventCount: z.number().int().nonnegative(),
    events: z.array(chatRealtimeDiagnosticEventSchema),
  })
  .strict();

export type ChatRealtimeDiagnosticSnapshot = Readonly<
  Omit<z.infer<typeof chatRealtimeDiagnosticSnapshotSchema>, "events"> & {
    events: readonly ChatRealtimeDiagnosticEvent[];
  }
>;

export function isChatRealtimeDiagnosticSnapshot(
  value: unknown,
): value is ChatRealtimeDiagnosticSnapshot {
  return chatRealtimeDiagnosticSnapshotSchema.safeParse(value).success;
}

export function getChatRealtimeDiagnosticLevel(
  event: ChatRealtimeDiagnosticEventInput["event"],
): ChatRealtimeDiagnosticEvent["level"] {
  switch (event) {
    case "stomp.error":
      return "error";
    case "websocket.error":
    case "websocket.closed":
    case "reconnect.suppressed":
    case "authentication.required":
    case "room.sync.rejected":
      return "warn";
    case "runtime.started":
    case "connection.requested":
    case "stomp.connected":
    case "reconnect.requested":
    case "room.activated":
    case "room.released":
    case "room.replaced":
      return "info";
    default:
      return "debug";
  }
}
