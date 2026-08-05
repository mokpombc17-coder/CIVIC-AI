package com.hamcheeze.chat.room.inbox.summary.maintenance;

import org.bson.Document;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxSummaryMaintenanceOptionsTest {

    @Test
    void acceptsOnlyExplicitSupportedModesAndPositiveOptions() {
        RoomInboxSummaryMaintenanceOptions options =
                RoomInboxSummaryMaintenanceOptions.parse(new String[]{
                        "--mode=dry-run",
                        "--batch-size=25",
                        "--max-room-retries=4",
                        "--after-room-id=room-20"
                });

        assertThat(options.mode())
                .isEqualTo(RoomInboxSummaryMaintenanceMode.DRY_RUN);
        assertThat(options.batchSize()).isEqualTo(25);
        assertThat(options.maxRoomRetries()).isEqualTo(4);
        assertThat(options.afterRoomId()).isEqualTo("room-20");

        assertThatThrownBy(() ->
                RoomInboxSummaryMaintenanceOptions.parse(new String[]{}))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                RoomInboxSummaryMaintenanceOptions.parse(new String[]{
                        "--mode=backfill"
                })).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                RoomInboxSummaryMaintenanceOptions.parse(new String[]{
                        "--mode=apply",
                        "--batch-size=0"
                })).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                RoomInboxSummaryMaintenanceOptions.parse(new String[]{
                        "--mode=apply",
                        "--room-id=room-1",
                        "--after-room-id=room-0"
                })).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void commandRejectsMissingModeUnknownModeAndMissingUriBeforeWrites() {
        assertThat(run(new String[]{}, Map.of())).isEqualTo(2);
        assertThat(run(
                new String[]{"--mode=true"},
                Map.of("CHAT_MONGODB_URI", "mongodb://localhost/chat")))
                .isEqualTo(2);
        assertThat(run(
                new String[]{"--mode=apply"},
                Map.of())).isEqualTo(2);
    }

    @Test
    void invalidMongoUriIsNotEchoedToErrorOutput() {
        ByteArrayOutputStream error = new ByteArrayOutputStream();
        String sensitiveUri = "not-a-mongodb-uri-with-secret";

        int exitCode = RoomInboxSummaryMaintenanceCommand.run(
                new String[]{"--mode=validate"},
                Map.of("CHAT_MONGODB_URI", sensitiveUri),
                new PrintStream(new ByteArrayOutputStream()),
                new PrintStream(error));

        assertThat(exitCode).isEqualTo(2);
        assertThat(error.toString())
                .contains("maintenance-argument-error="
                        + "invalid-mongodb-uri")
                .doesNotContain(sensitiveUri);
    }

    @Test
    void jsonReportExposesProjectionViolationsAndCategorySum()
            throws Exception {
        RoomInboxSummaryMaintenanceReport report =
                new RoomInboxSummaryMaintenanceReport(
                        RoomInboxSummaryMaintenanceMode.VALIDATE);
        report.incrementProjectionViolations();
        report.incrementMalformedMessages();
        report.incrementSequenceViolations();

        Document json = Document.parse(report.toJson());

        assertThat(report.projectionViolations()).isEqualTo(1);
        assertThat(((Number) json.get("projectionViolations")).longValue())
                .isEqualTo(1);
        assertThat(((Number) json.get("violations")).longValue())
                .isEqualTo(3);
        assertThat(report.violations()).isEqualTo(3);
    }

    private static int run(
            String[] args,
            Map<String, String> environment
    ) {
        return RoomInboxSummaryMaintenanceCommand.run(
                args,
                environment,
                new PrintStream(new ByteArrayOutputStream()),
                new PrintStream(new ByteArrayOutputStream()));
    }
}
