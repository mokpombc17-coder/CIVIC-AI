package com.hamcheeze.chat.export;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResearchChatExportStartupRecoveryTest {

    @Test
    void marksEveryRunningJobFailedAfterServerRestart() {
        Instant now = Instant.parse("2026-08-24T03:00:00Z");
        ResearchChatExportJobStore store =
                mock(ResearchChatExportJobStore.class);
        ResearchChatExportJob job = ResearchChatExportJob.running(
                "export-1", "room-1", 7, "researcher-1", now);
        when(store.findRunning()).thenReturn(List.of(job));

        new ResearchChatExportStartupRecovery(
                store,
                Clock.fixed(now, ZoneOffset.UTC)).recover();

        verify(store).markFailed(
                "export-1",
                ChatExportFailureCode.SERVER_RESTARTED,
                now);
    }
}
