import type {
  ChatRealtimeDiagnosticEvent,
  ChatRealtimeDiagnosticSnapshot,
} from "./chat-realtime-diagnostic-events";

export const CHAT_REALTIME_DIAGNOSTICS_VISIBLE_EVENT_LIMIT = 30;

export type ChatRealtimeDiagnosticsSummary = Readonly<{
  debugCount: number;
  errorCount: number;
  infoCount: number;
  totalCount: number;
  warnCount: number;
}>;

export function createChatRealtimeDiagnosticsSummary(
  snapshot: ChatRealtimeDiagnosticSnapshot,
): ChatRealtimeDiagnosticsSummary {
  const summary = {
    debugCount: 0,
    errorCount: 0,
    infoCount: 0,
    totalCount: snapshot.events.length,
    warnCount: 0,
  };

  snapshot.events.forEach((event) => {
    switch (event.level) {
      case "debug":
        summary.debugCount += 1;
        return;
      case "error":
        summary.errorCount += 1;
        return;
      case "info":
        summary.infoCount += 1;
        return;
      case "warn":
        summary.warnCount += 1;
    }
  });

  return summary;
}

export function getVisibleChatRealtimeDiagnosticEvents(
  snapshot: ChatRealtimeDiagnosticSnapshot,
  limit = CHAT_REALTIME_DIAGNOSTICS_VISIBLE_EVENT_LIMIT,
): readonly ChatRealtimeDiagnosticEvent[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("표시할 진단 이벤트 수는 1 이상의 안전한 정수여야 합니다.");
  }

  return snapshot.events.slice(-limit).reverse();
}

export function createChatRealtimeDiagnosticEventPreview(
  event: ChatRealtimeDiagnosticEvent,
): string {
  switch (event.event) {
    case "runtime.started":
      return `transport=${event.transportKind}`;
    case "port.attached":
    case "port.detached":
      return `attachedPorts=${event.attachedPortCount} · port=${shortenIdentifier(event.portId)}`;
    case "connection.requested":
      return `trigger=${event.trigger} · previous=${event.statusBefore} · attempt=${shortenIdentifier(event.connectionAttemptId)}`;
    case "stomp.connected":
      return `duration=${Math.round(event.connectionDurationMs)}ms · attempt=${shortenIdentifier(event.connectionAttemptId)}`;
    case "stomp.error":
      return `code=${event.code ?? "unknown"} · retryable=${formatNullableBoolean(event.retryable)} · attempt=${shortenNullableIdentifier(event.connectionAttemptId)}`;
    case "websocket.error":
      return `attempt=${shortenNullableIdentifier(event.connectionAttemptId)}`;
    case "websocket.closed":
      return [
        `code=${event.closeCode}`,
        event.closeReason ? `reason=${event.closeReason}` : null,
        `clean=${event.wasClean}`,
        `decision=${event.reconnectDecision}`,
      ]
        .filter((value): value is string => value !== null)
        .join(" · ");
    case "reconnect.requested":
    case "reconnect.suppressed":
      return `reason=${event.reason} · previous=${event.statusBefore}`;
    case "authentication.required":
      return `attempt=${shortenNullableIdentifier(event.connectionAttemptId)}`;
    case "room.claim.requested":
      return `room=${event.roomId} · generation=${event.generation} · port=${shortenIdentifier(event.portId)}`;
    case "room.subscriptions.started":
    case "room.sync.requested":
    case "room.activated":
    case "room.released":
      return `room=${event.roomId} · generation=${event.generation}`;
    case "room.sync.ready":
      return `room=${event.roomId} · generation=${event.generation} · visibleAfter=${event.messageVisibleAfterSequence} · watermark=${event.watermarkSequence}`;
    case "room.sync.rejected":
      return `room=${event.roomId} · generation=${event.generation} · code=${event.code} · retryable=${event.retryable}`;
    case "room.replaced":
      return `room=${event.roomId} → ${event.activatedRoomId} · generation=${event.generation}`;
  }
}

function shortenNullableIdentifier(value: string | null): string {
  return value === null ? "unknown" : shortenIdentifier(value);
}

function shortenIdentifier(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 12)}…`;
}

function formatNullableBoolean(value: boolean | null): string {
  return value === null ? "unknown" : String(value);
}
