package com.hamcheeze.chat.room.inbox.summary.maintenance;

public enum RoomInboxSummaryMaintenanceAction {
    CREATE,
    ADVANCE_SEQUENCE,
    REFRESH_VERSION,
    REPAIR_SNAPSHOT,
    UNCHANGED,
    AHEAD,
    UNSUPPORTED_SCHEMA,
    MALFORMED,
    CONCURRENTLY_CHANGED,
    FAILED,
    ORPHAN_SUMMARY
}
