import "server-only";

export type PushTokenRegistration = {
  subject: string;
  expoPushToken: string;
  platform: "ios" | "android";
  appVersion?: string;
};

/**
 * Implement this port with the application's existing database. Keeping the
 * repository abstract prevents the starter from choosing Prisma, Drizzle, or a
 * particular identity model on behalf of consumers.
 */
export interface PushTokenRepository {
  upsert(registration: PushTokenRegistration): Promise<void>;
  disable(expoPushToken: string, reason: string): Promise<void>;
}
