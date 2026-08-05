package com.hamcheeze.chat.room.inbox.summary.maintenance;

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
