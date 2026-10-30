package com.hamcheeze.chat.export;

import java.time.Clock;
import java.util.Objects;

public final class ResearchChatExportStartupRecovery {

    private final ResearchChatExportJobStore jobStore;
    private final Clock clock;

    public ResearchChatExportStartupRecovery(
            ResearchChatExportJobStore jobStore,
            Clock clock
    ) {
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void recover() {
        for (ResearchChatExportJob job : jobStore.findRunning()) {
            jobStore.markFailed(job.exportId(),
                    ChatExportFailureCode.SERVER_RESTARTED,
                    clock.instant());
        }
    }
}
