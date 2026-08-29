package com.hamcheeze.chat.export;

import java.time.Clock;
import java.util.Objects;

public final class AdminRoomConversationExportStartupRecovery {

    private final AdminRoomConversationExportJobStore jobStore;
    private final Clock clock;

    public AdminRoomConversationExportStartupRecovery(
            AdminRoomConversationExportJobStore jobStore,
            Clock clock
    ) {
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void recover() {
        for (AdminRoomConversationExportJob job : jobStore.findRunning()) {
            jobStore.markFailed(
                    job.exportId(),
                    ChatExportFailureCode.SERVER_RESTARTED,
                    clock.instant());
        }
    }
}
