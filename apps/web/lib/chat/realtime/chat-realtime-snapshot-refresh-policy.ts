export class ChatRealtimeSnapshotRefreshPolicy {
  private activatedSessionKey: string | null = null;
  private reconnectSessionKey: string | null = null;

  activate(roomId: string, generation: number): boolean {
    const sessionKey = createSessionKey(roomId, generation);
    const shouldRefresh = this.reconnectSessionKey === sessionKey;

    this.activatedSessionKey = sessionKey;
    this.reconnectSessionKey = null;
    return shouldRefresh;
  }

  deactivate(roomId: string, generation: number): void {
    const sessionKey = createSessionKey(roomId, generation);

    if (this.activatedSessionKey === sessionKey) {
      this.reconnectSessionKey = sessionKey;
    }
  }
}

function createSessionKey(roomId: string, generation: number): string {
  return `${roomId}:${generation}`;
}
