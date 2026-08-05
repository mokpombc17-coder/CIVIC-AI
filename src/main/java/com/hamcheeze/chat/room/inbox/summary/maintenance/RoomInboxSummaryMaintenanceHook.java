package com.hamcheeze.chat.room.inbox.summary.maintenance;

@FunctionalInterface
public interface RoomInboxSummaryMaintenanceHook {

    RoomInboxSummaryMaintenanceHook NONE = (candidate, attempt) -> {
    };

    void afterCandidateRead(
            RoomInboxSummaryCandidate candidate,
            int attempt
    );
}
