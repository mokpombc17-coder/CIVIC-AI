package com.hamcheeze.chat.room.inbox.summary.maintenance;

import java.util.List;

public record RoomInboxSummaryMaintenanceDiagnostic(
        String roomId,
        String messageId,
        Long storedSequence,
        Long storedVersion,
        Long expectedSequence,
        Long expectedVersion,
        String state,
        RoomInboxSummaryMaintenanceAction action,
        List<String> mismatchFields,
        String detail
) {

    public RoomInboxSummaryMaintenanceDiagnostic {
        mismatchFields = mismatchFields == null
                ? List.of()
                : List.copyOf(mismatchFields);
    }
}
