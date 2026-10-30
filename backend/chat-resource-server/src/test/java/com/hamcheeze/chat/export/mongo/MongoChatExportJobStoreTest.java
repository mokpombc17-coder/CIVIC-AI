package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportCompletion;
import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportJob;
import com.hamcheeze.chat.export.ChatExportJobStore;
import com.hamcheeze.chat.export.ChatExportMode;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("local")
class MongoChatExportJobStoreTest extends MongoRuntimeIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T04:00:00Z");

    @Autowired
    private ChatExportJobStore store;

    @BeforeEach
    void clearExportJobs() {
        mongoOperations.remove(
                new Query(),
                MongoChatExportJobDocument.COLLECTION_NAME);
    }

    @Test
    void runningJobIsUniquePerRoom() {
        store.insertRunning(running("export-1", "room-1", "admin-1"));

        assertThatThrownBy(() -> store.insertRunning(
                running("export-2", "room-1", "admin-2")))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void latestSucceededBaseIsScopedToRoomAndAdmin() {
        succeed(running("export-a1", "room-1", "admin-1"), 10);
        succeed(running("export-b1", "room-1", "admin-2"), 20);
        succeed(running("export-a2", "room-1", "admin-1"), 30);

        assertThat(store.findLatestSucceeded("room-1", "admin-1"))
                .hasValueSatisfying(job -> assertThat(job.exportId())
                        .isEqualTo("export-a2"));
        assertThat(store.findLatestSucceeded("room-1", "admin-2"))
                .hasValueSatisfying(job -> assertThat(job.exportId())
                        .isEqualTo("export-b1"));
    }

    @Test
    void terminalTransitionUsesRunningCompareAndSet() {
        ChatExportJob job = running("export-1", "room-1", "admin-1");
        store.insertRunning(job);

        assertThat(store.markFailed(
                job.exportId(),
                ChatExportFailureCode.DELIVERY_FAILED,
                NOW.plusSeconds(1))).isTrue();
        assertThat(store.markSucceeded(
                job.exportId(),
                completion(1))).isFalse();
    }

    private void succeed(ChatExportJob job, long watermark) {
        ChatExportJob ranged = ChatExportJob.running(
                job.exportId(),
                job.roomId(),
                ChatExportMode.FULL,
                null,
                0,
                watermark,
                job.requestedByAdminId(),
                NOW.minusSeconds(watermark));
        store.insertRunning(ranged);
        assertThat(store.markSucceeded(
                ranged.exportId(),
                completion(watermark))).isTrue();
    }

    private ChatExportJob running(
            String exportId,
            String roomId,
            String adminId
    ) {
        return ChatExportJob.running(
                exportId,
                roomId,
                ChatExportMode.FULL,
                null,
                0,
                0,
                adminId,
                NOW);
    }

    private ChatExportCompletion completion(long events) {
        return new ChatExportCompletion(
                NOW,
                NOW,
                events,
                events,
                0,
                0,
                100,
                "a".repeat(64));
    }
}
