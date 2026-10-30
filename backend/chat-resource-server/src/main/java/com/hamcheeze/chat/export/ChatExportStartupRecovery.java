package com.hamcheeze.chat.export;

import java.time.Clock;
import java.util.Objects;

public final class ChatExportStartupRecovery {

    private final ChatExportJobStore jobStore;
    private final Clock clock;

    public ChatExportStartupRecovery(
            ChatExportJobStore jobStore,
            Clock clock
    ) {
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void recover() {
        for (ChatExportJob job : jobStore.findRunning()) {
            jobStore.markFailed(
                    job.exportId(),
                    ChatExportFailureCode.SERVER_RESTARTED,
                    clock.instant());
        }
    }
}
