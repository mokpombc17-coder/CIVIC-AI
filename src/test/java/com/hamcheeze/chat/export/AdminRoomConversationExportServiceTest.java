package com.hamcheeze.chat.export;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminRoomConversationExportServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-29T08:00:00Z");

    private AdminRoomConversationExportSnapshotReader snapshotReader;
    private AdminRoomConversationExportService service;

    @BeforeEach
    void setUp() {
        snapshotReader = mock(
                AdminRoomConversationExportSnapshotReader.class);
        service = new AdminRoomConversationExportService(
                new ChatExportProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                snapshotReader);
    }

    @Test
    void validatesTimeRangeBeforeReadingSnapshot() {
        AdminRoomConversationExportRequest request =
                new AdminRoomConversationExportRequest(NOW, NOW);

        assertCode(ChatExportErrorCode.INVALID_EXPORT_TIME_RANGE,
                HttpStatus.BAD_REQUEST,
                false,
                () -> service.prepare("admin-1", "room-1", request));

        verify(snapshotReader, never()).findStable(
                any(), any(), any(), anyInt());
    }

    @Test
    void missingRoomIsNotFound() {
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenReturn(Optional.empty());

        assertCode(ChatExportErrorCode.ROOM_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                false,
                () -> service.prepare(
                        "admin-1",
                        "room-1",
                        validRequest()));
    }

    @Test
    void unstableSnapshotIsRetryableAndStableSnapshotReachesNextStage() {
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenThrow(new ChatExportSnapshotUnstableException(
                        "unstable"));
        assertCode(ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                HttpStatus.SERVICE_UNAVAILABLE,
                true,
                () -> service.prepare(
                        "admin-1",
                        "room-1",
                        validRequest()));

        AdminRoomConversationExportSnapshotReader stableReader =
                mock(AdminRoomConversationExportSnapshotReader.class);
        when(stableReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenReturn(Optional.of(mock(
                        AdminRoomConversationExportSnapshot.class)));
        AdminRoomConversationExportService stableService =
                new AdminRoomConversationExportService(
                        new ChatExportProperties(),
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        stableReader);
        assertCode(ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                HttpStatus.SERVICE_UNAVAILABLE,
                true,
                () -> stableService.prepare(
                        "admin-1",
                        "room-1",
                        validRequest()));
        verify(stableReader).findStable(
                eq("room-1"), any(), eq(NOW), eq(3));
    }

    private AdminRoomConversationExportRequest validRequest() {
        return new AdminRoomConversationExportRequest(
                NOW.minusSeconds(3_600),
                NOW);
    }

    private void assertCode(
            ChatExportErrorCode code,
            HttpStatus status,
            boolean retryable,
            ThrowingOperation operation
    ) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> {
                    ChatExportException export =
                            (ChatExportException) error;
                    assertThat(export.code()).isEqualTo(code);
                    assertThat(export.status()).isEqualTo(status);
                    assertThat(export.retryable()).isEqualTo(retryable);
                });
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run();
    }
}
