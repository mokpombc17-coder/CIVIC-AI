import "server-only";

/**
 * Integrate this port with Auth.js or another BFF-owned OAuth implementation.
 * Provider access tokens must stay on the server. The native shell only returns
 * a short-lived, one-time handoff code to the WebView.
 */
export interface MobileAuthAdapter {
  createAuthorization(input: {
    provider: string;
    callbackUrl: string;
    returnTo?: string;
  }): Promise<{
    authorizationUrl: string;
    transactionId: string;
  }>;

  consumeHandoff(input: { transactionId: string; handoffCode: string }): Promise<{
    subject: string;
  }>;
}
