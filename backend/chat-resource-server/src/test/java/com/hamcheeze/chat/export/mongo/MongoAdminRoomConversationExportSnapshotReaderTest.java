package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.AdminRoomConversationExportRange;
import com.hamcheeze.chat.export.AdminRoomConversationExportSnapshot;
import com.hamcheeze.chat.export.ChatExportSnapshotUnstableException;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoAdminRoomConversationExportSnapshotReaderTest {

    private static final Instant NOW =
            Instant.parse("2026-08-29T08:00:00Z");
    private static final AdminRoomConversationExportRange RANGE =
            new AdminRoomConversationExportRange(
                    NOW.minusSeconds(3_600),
                    NOW);

    private MongoOperations mongoOperations;
    private ChatMessageAuditReader auditReader;
    private MongoAdminRoomConversationExportSnapshotReader reader;

    @BeforeEach
    void setUp() {
        mongoOperations = mock(MongoOperations.class);
        auditReader = mock(ChatMessageAuditReader.class);
        reader = new MongoAdminRoomConversationExportSnapshotReader(
                mongoOperations,
                auditReader);
    }

    @Test
    void capturesWatermarkBetweenEquivalentRoomSnapshots() {
        MongoRoomDocument document = document(room(4, RoomStatus.ACTIVE));
        when(mongoOperations.findById(
                "room-1",
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME))
                .thenReturn(document, document);
        when(auditReader.currentRoomChangeSequence("room-1"))
                .thenReturn(17L);

        Optional<AdminRoomConversationExportSnapshot> result =
                reader.findStable("room-1", RANGE, NOW, 3);

        assertThat(result).isPresent();
        AdminRoomConversationExportSnapshot snapshot = result.orElseThrow();
        assertThat(snapshot.range()).isEqualTo(RANGE);
        assertThat(snapshot.capturedAt()).isEqualTo(NOW);
        assertThat(snapshot.capturedChangeSequence()).isEqualTo(17L);
        assertThat(snapshot.room().roomVersion()).isEqualTo(4L);
        verify(auditReader).currentRoomChangeSequence("room-1");
    }

    @Test
    void missingFirstReadIsNotFoundWithoutReadingWatermark() {
        when(mongoOperations.findById(
                "room-1",
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME))
                .thenReturn(null);

        assertThat(reader.findStable("room-1", RANGE, NOW, 3))
                .isEmpty();
    }

    @Test
    void changingRoomVersionFailsClosedAfterConfiguredAttempts() {
        MongoRoomDocument first = document(room(1, RoomStatus.ACTIVE));
        MongoRoomDocument second = document(room(2, RoomStatus.ACTIVE));
        when(mongoOperations.findById(
                "room-1",
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME))
                .thenReturn(first, second, first, second);
        when(auditReader.currentRoomChangeSequence("room-1"))
                .thenReturn(5L);

        assertThatThrownBy(() ->
                reader.findStable("room-1", RANGE, NOW, 2))
                .isInstanceOf(ChatExportSnapshotUnstableException.class);
    }

    private MongoRoomDocument document(Room room) {
        MongoRoomDocument document = mock(MongoRoomDocument.class);
        when(document.toDomain()).thenReturn(room);
        return document;
    }

    private Room room(long version, RoomStatus status) {
        Room room = mock(Room.class);
        when(room.roomId()).thenReturn("room-1");
        when(room.name()).thenReturn("Room");
        when(room.description()).thenReturn("Description");
        when(room.categoryIds()).thenReturn(List.of("category-1"));
        when(room.status()).thenReturn(status);
        when(room.visibility()).thenReturn(RoomVisibility.LISTED);
        when(room.joinPolicy()).thenReturn(JoinPolicy.OPEN);
        when(room.ownerMembershipId()).thenReturn("membership-owner");
        when(room.version()).thenReturn(version);
        when(room.createdAt()).thenReturn(NOW.minusSeconds(86_400));
        return room;
    }
}
