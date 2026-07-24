import { z } from "zod";

export const BRIDGE_VERSION = 2 as const;
export const NATIVE_TO_WEB_EVENT = "next-native-bridge-message" as const;

const bridgeEnvelopeSchema = z.object({
  version: z.literal(BRIDGE_VERSION),
  id: z.string().min(1).max(128),
  sentAt: z.number().int().nonnegative(),
});

const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "URL must use HTTP or HTTPS." },
  );

const nativeContextSchema = z.object({
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().min(1).max(64),
  buildVersion: z.string().min(1).max(64),
  capabilities: z.array(z.enum(["share", "deep-link", "app-state", "oauth", "download", "push"])),
});

export const webToNativeMessageSchema = z.discriminatedUnion("type", [
  bridgeEnvelopeSchema.extend({
    type: z.literal("WEB_READY"),
    payload: z.object({}),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("GET_NATIVE_CONTEXT"),
    payload: z.object({}),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("SHARE"),
    payload: z
      .object({
        title: z.string().min(1).max(200).optional(),
        text: z.string().min(1).max(2_000).optional(),
        url: z.string().url().optional(),
      })
      .refine((payload) => Boolean(payload.title || payload.text || payload.url), {
        message: "At least one share field is required.",
      }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("START_OAUTH"),
    payload: z.object({
      url: httpUrlSchema.max(4_096),
      callbackUrl: z.string().url().max(2_048),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("DOWNLOAD_FILE"),
    payload: z.object({
      url: httpUrlSchema.max(4_096),
      fileName: z.string().min(1).max(200).optional(),
      mimeType: z.string().min(1).max(200).optional(),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("REQUEST_PUSH_PERMISSION"),
    payload: z.object({}),
  }),
]);

export const nativeToWebMessageSchema = z.discriminatedUnion("type", [
  bridgeEnvelopeSchema.extend({
    type: z.literal("NATIVE_READY"),
    payload: nativeContextSchema,
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("NATIVE_CONTEXT"),
    payload: nativeContextSchema,
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("SHARE_RESULT"),
    payload: z.object({
      completed: z.boolean(),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("AUTH_RESULT"),
    payload: z.object({
      callbackUrl: z.string().url().max(4_096),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("AUTH_CANCELLED"),
    payload: z.object({}),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("DOWNLOAD_RESULT"),
    payload: z.object({
      completed: z.boolean(),
      fileName: z.string().min(1).max(200),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("PUSH_REGISTRATION_RESULT"),
    payload: z.object({
      status: z.enum(["granted", "denied", "undetermined", "unavailable"]),
      expoPushToken: z.string().min(1).max(512).optional(),
      reason: z.string().min(1).max(500).optional(),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("DEEP_LINK"),
    payload: z.object({
      url: z.string().url(),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("APP_STATE_CHANGED"),
    payload: z.object({
      state: z.enum(["active", "background", "inactive", "unknown"]),
    }),
  }),
  bridgeEnvelopeSchema.extend({
    type: z.literal("BRIDGE_ERROR"),
    payload: z.object({
      code: z.string().min(1).max(100),
      message: z.string().min(1).max(500),
      requestType: z.string().min(1).max(100).optional(),
    }),
  }),
]);

export type WebToNativeMessage = z.infer<typeof webToNativeMessageSchema>;
export type NativeToWebMessage = z.infer<typeof nativeToWebMessageSchema>;
export type NativeContext = z.infer<typeof nativeContextSchema>;
export type NativeCapability = NativeContext["capabilities"][number];

export function parseWebToNativeMessage(raw: string): WebToNativeMessage | null {
  return parseMessage(raw, webToNativeMessageSchema);
}

export function parseNativeToWebMessage(raw: string): NativeToWebMessage | null {
  return parseMessage(raw, nativeToWebMessageSchema);
}

export function serializeBridgeMessage(message: WebToNativeMessage | NativeToWebMessage): string {
  return JSON.stringify(message);
}

export function createBridgeId(prefix: "web" | "native"): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function parseMessage<T extends z.ZodType>(raw: string, schema: T): z.infer<T> | null {
  try {
    const json: unknown = JSON.parse(raw);
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
