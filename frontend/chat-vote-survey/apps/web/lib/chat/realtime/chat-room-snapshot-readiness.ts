export type ChatRoomSnapshotReadinessInput = Readonly<{
  hasMessageHistory: boolean;
  isMessageHistoryRefetching: boolean;
  isRoomActive: boolean;
  messageHistoryStatus: "pending" | "error" | "success";
}>;

export function isChatRoomSnapshotReadyForRealtimeMerge({
  hasMessageHistory,
  isMessageHistoryRefetching,
  isRoomActive,
  messageHistoryStatus,
}: ChatRoomSnapshotReadinessInput): boolean {
  return (
    isRoomActive &&
    hasMessageHistory &&
    messageHistoryStatus === "success" &&
    !isMessageHistoryRefetching
  );
}
