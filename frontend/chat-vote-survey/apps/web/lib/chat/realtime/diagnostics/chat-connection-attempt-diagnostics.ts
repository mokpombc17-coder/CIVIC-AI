import type { ChatConnectionStatus } from "../chat-realtime-transport";
import type { ChatRealtimeDiagnosticStore } from "./chat-realtime-diagnostic-store";

export type ConnectionAttemptTrigger =
  | "initial-attach"
  | "transport-reconnect"
  | "authentication-succeeded"
  | "deactivation-completed"
  | "manual";

export type WebSocketCloseReconnectDecision =
  | "authentication-state-preserved"
  | "connection-replaced"
  | "room-access-revoked"
  | "room-closed"
  | "reconnecting"
  | "disconnected";

export class ChatConnectionAttemptDiagnostics {
  private attemptId: string | null = null;
  private attemptStartedAt = 0;
  private diagnosticIdSequence = 0;

  constructor(
    private readonly diagnostics: ChatRealtimeDiagnosticStore,
    private readonly createDiagnosticId: () => string,
    private readonly monotonicNow: () => number,
  ) {}

  get currentAttemptId(): string | null {
    return this.attemptId;
  }

  beginAttempt(trigger: ConnectionAttemptTrigger, statusBefore: ChatConnectionStatus): void {
    this.attemptId = this.nextDiagnosticId();

    try {
      this.attemptStartedAt = this.monotonicNow();
    } catch {
      this.attemptStartedAt = 0;
    }
    this.diagnostics.emit({
      event: "connection.requested",
      connectionAttemptId: this.attemptId,
      trigger,
      statusBefore,
    });
  }

  nextDiagnosticId(): string {
    this.diagnosticIdSequence += 1;

    try {
      const value = this.createDiagnosticId().trim();
      return value && value.length <= 128 ? value : `diagnostic-${this.diagnosticIdSequence}`;
    } catch {
      return `diagnostic-${this.diagnosticIdSequence}`;
    }
  }

  getConnectionDurationMs(): number {
    try {
      return Math.max(0, this.monotonicNow() - this.attemptStartedAt);
    } catch {
      return 0;
    }
  }

  recordWebSocketClose(
    event: CloseEvent,
    statusBefore: ChatConnectionStatus,
    reconnectDecision: WebSocketCloseReconnectDecision,
  ): void {
    this.diagnostics.emit({
      event: "websocket.closed",
      connectionAttemptId: this.attemptId,
      closeCode: event.code,
      closeReason: sanitizeDiagnosticText(event.reason),
      wasClean: event.wasClean,
      statusBefore,
      reconnectDecision,
    });
    this.attemptId = null;
    this.attemptStartedAt = 0;
  }
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 256);
}
