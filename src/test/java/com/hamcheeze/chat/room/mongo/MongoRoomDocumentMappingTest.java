package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomDomainException;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoRoomDocumentMappingTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");

    @Test
    void activeRoomRoundTrips() {
        Room room = Room.restore(
                "room-1",
                "Active room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                3,
                Math.max(2L, (long) (3) + 1L),
                CREATED_AT,
                null,
                7);

        MongoRoomDocument document =
                MongoRoomDocument.fromDomain(room);

        assertThat(document.schemaVersion()).isEqualTo(7);
        assertThat(document.nextParticipantNumber()).isEqualTo(4);
        assertThat(document.ownerMembershipId())
                .isEqualTo("membership-owner");
        assertThat(document.name()).isEqualTo("Active room");
        assertThat(document.description()).isEmpty();
        assertThat(document.categoryIds())
                .containsExactly(
                        RoomCategoryDefaults.POLICY_CATEGORY_ID);
        assertThat(document.categories()).isNull();
        assertThat(document.toDomain()).isEqualTo(room);
    }

    @Test
    void closedRoomRoundTrips() {
        Room room = Room.restore(
                "room-1",
                "Closed room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                RoomStatus.CLOSED,
                RoomVisibility.UNLISTED,
                JoinPolicy.INVITE_ONLY,
                0,
                Math.max(2L, (long) (0) + 1L),
                CREATED_AT,
                CREATED_AT.plusSeconds(60),
                8);

        MongoRoomDocument document =
                MongoRoomDocument.fromDomain(room);

        assertThat(document.schemaVersion()).isEqualTo(7);
        assertThat(document.nextParticipantNumber()).isEqualTo(2);
        assertThat(document.ownerMembershipId())
                .isEqualTo("membership-owner");
        assertThat(document.name()).isEqualTo("Closed room");
        assertThat(document.description()).isEmpty();
        assertThat(document.toDomain()).isEqualTo(room);
    }

    @Test
    void dynamicCategoryIdsRoundTripAsAnOrderIndependentSet() {
        Room room = Room.restoreWithCategoryIds(
                "room-dynamic",
                "Dynamic categories",
                "",
                List.of(
                        "category-e",
                        "category-c",
                        "category-a",
                        "category-d",
                        "category-b"),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                2,
                CREATED_AT,
                null,
                0);

        MongoRoomDocument document =
                MongoRoomDocument.fromDomain(room);

        assertThat(document.categoryIds()).containsExactly(
                "category-a",
                "category-b",
                "category-c",
                "category-d",
                "category-e");
        assertThat(document.toDomain()).isEqualTo(room);
    }

    @Test
    void legacyRoomWithoutCategoryIsRejected() {
        MongoRoomDocument legacy = new MongoRoomDocument(
                "legacy-room",
                1,
                null,
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                CREATED_AT,
                null,
                0);

        assertThatThrownBy(legacy::toDomain)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void previousSchemaIsRejectedAndCurrentRequiresDescription() {
        MongoRoomDocument previous = new MongoRoomDocument(
                "room-2",
                2,
                "Previous room",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                CREATED_AT,
                null,
                2);

        assertThatThrownBy(previous::toDomain)
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new MongoRoomDocument(
                "room-3",
                MongoRoomDocument.CURRENT_SCHEMA_VERSION,
                "Current room",
                null,
                List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                2,
                CREATED_AT,
                null,
                3)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new MongoRoomDocument(
                "room-4",
                MongoRoomDocument.CURRENT_SCHEMA_VERSION,
                "Current room",
                "",
                null,
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                2,
                CREATED_AT,
                null,
                3)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new MongoRoomDocument(
                "room-5",
                MongoRoomDocument.CURRENT_SCHEMA_VERSION,
                "Current room",
                "Current description",
                List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                null,
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                2,
                CREATED_AT,
                null,
                3)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void membershipStatesRoundTrip() {
        List<Membership> memberships = List.of(
                membership(
                        "member-active",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        null,
                        null,
                        1),
                membership(
                        "member-left",
                        MembershipRole.MEMBER,
                        MembershipStatus.LEFT,
                        CREATED_AT.plusSeconds(10),
                        null,
                        2),
                membership(
                        "member-banned",
                        MembershipRole.MEMBER,
                        MembershipStatus.BANNED,
                        null,
                        CREATED_AT.plusSeconds(20),
                        3),
                membership(
                        "owner-active",
                        MembershipRole.OWNER,
                        MembershipStatus.ACTIVE,
                        null,
                        null,
                        4),
                membership(
                        "owner-left",
                        MembershipRole.OWNER,
                        MembershipStatus.LEFT,
                        CREATED_AT.plusSeconds(30),
                        null,
                        5));

        memberships.forEach(membership -> {
            MongoMembershipDocument document =
                    MongoMembershipDocument.fromDomain(membership);
            assertThat(document.schemaVersion()).isEqualTo(3);
            assertThat(document.profile().participantNumber())
                    .isEqualTo(2);
            assertThat(document.profile().displayName())
                    .isEqualTo("참여자 2");
            assertThat(document.messageVisibleAfterSequence())
                    .isEqualTo(10);
            assertThat(document.toDomain()).isEqualTo(membership);
        });
    }

    @Test
    void damagedMembershipDocumentsFailDomainRestore() {
        List<MongoMembershipDocument> damaged = List.of(
                document(
                        MembershipRole.OWNER,
                        MembershipStatus.BANNED,
                        null,
                        CREATED_AT.plusSeconds(10),
                        0),
                document(
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT.plusSeconds(10),
                        null,
                        0),
                document(
                        MembershipRole.MEMBER,
                        MembershipStatus.LEFT,
                        null,
                        null,
                        0),
                document(
                        MembershipRole.MEMBER,
                        MembershipStatus.BANNED,
                        null,
                        null,
                        0),
                document(
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        null,
                        null,
                        -1));

        damaged.forEach(document ->
                assertThatThrownBy(document::toDomain)
                        .isInstanceOf(RoomDomainException.class));
    }

    @Test
    void receiptRoundTripsWithoutInterpretingPayload() {
        RoomCommandReceipt receipt = new RoomCommandReceipt(
                "receipt-1",
                "user-1",
                "550E8400-E29B-41D4-A716-446655440000",
                RoomCommandType.JOIN_ROOM,
                "sha256:fingerprint",
                new StoredRoomCommandResult(
                        "JOIN_ROOM_RESULT",
                        1,
                        "{\"outcome\":\"JOINED\"}"),
                CREATED_AT,
                CREATED_AT.plusSeconds(3600));

        MongoRoomCommandReceiptDocument document =
                MongoRoomCommandReceiptDocument.fromDomain(receipt);

        assertThat(document.schemaVersion()).isEqualTo(1);
        assertThat(document.result().payload())
                .isEqualTo("{\"outcome\":\"JOINED\"}");
        assertThat(document.toDomain()).isEqualTo(receipt);
        assertThat(document.clientRequestId())
                .isEqualTo(
                        "550e8400-e29b-41d4-a716-446655440000");
    }

    @Test
    void unsupportedSchemaVersionsFailExplicitly() {
        MongoRoomDocument roomDocument = new MongoRoomDocument(
                "room-1",
                8,
                "Test room",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                CREATED_AT,
                null,
                0);
        MongoMembershipDocument membershipDocument =
                new MongoMembershipDocument(
                        "membership-1",
                        4,
                        "room-1",
                        "user-1",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        null,
                        CREATED_AT,
                        null,
                        null,
                        10L,
                        null,
                        0);
        MongoRoomCommandReceiptDocument receiptDocument =
                new MongoRoomCommandReceiptDocument(
                        "receipt-1",
                        2,
                        "user-1",
                        "550e8400-e29b-41d4-a716-446655440000",
                        RoomCommandType.JOIN_ROOM,
                        "fingerprint",
                        new MongoStoredRoomCommandResultDocument(
                                "RESULT",
                                1,
                                "{}"),
                        CREATED_AT,
                        CREATED_AT.plusSeconds(60));

        assertUnsupportedSchema(
                roomDocument::toDomain,
                MongoRoomDocument.COLLECTION_NAME,
                8);
        assertUnsupportedSchema(
                membershipDocument::toDomain,
                MongoMembershipDocument.COLLECTION_NAME,
                4);
        assertUnsupportedSchema(
                receiptDocument::toDomain,
                MongoRoomCommandReceiptDocument.COLLECTION_NAME,
                2);
    }

    @Test
    void receiptModelsRejectInvalidValues() {
        assertThatThrownBy(() -> new StoredRoomCommandResult(
                " ",
                1,
                "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new StoredRoomCommandResult(
                "RESULT",
                0,
                "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> receipt(
                "not-a-uuid",
                CREATED_AT.plusSeconds(60)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> receipt(
                "550e8400-e29b-41d4-a716-446655440000",
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void legacyMissingAndNegativeMembershipBoundariesFailClosed() {
        MongoMembershipDocument legacy = new MongoMembershipDocument(
                "membership-1", 1, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                null, CREATED_AT, null, null, 10L, null, 0);
        MongoMembershipDocument previous = new MongoMembershipDocument(
                "membership-1", 2, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                null, CREATED_AT, null, null, 10L, null, 0);

        assertUnsupportedSchema(
                legacy::toDomain,
                MongoMembershipDocument.COLLECTION_NAME,
                1);
        assertUnsupportedSchema(
                previous::toDomain,
                MongoMembershipDocument.COLLECTION_NAME,
                2);
        assertThatThrownBy(() -> new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                null, CREATED_AT, null, null, 10L, null, 0))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                profile(), CREATED_AT, null, null, null, null, 0))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                profile(), CREATED_AT, null, null, -1L, null, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void membershipHistoryBoundaryRoundTripsAndFallsBackToJoinHistory() {
        Membership withHistory = Membership.restore(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                CREATED_AT,
                null,
                null,
                10,
                4,
                0);
        MongoMembershipDocument document =
                MongoMembershipDocument.fromDomain(withHistory);
        MongoMembershipDocument withoutHistory = new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                profile(), CREATED_AT, null, null, 10L, null, 0);

        assertThat(document.historyVisibleAfterSequence()).isEqualTo(4L);
        assertThat(document.toDomain()).isEqualTo(withHistory);
        assertThat(withoutHistory.toDomain(3).historyVisibleAfterSequence())
                .isEqualTo(7L);
        assertThat(withoutHistory.toDomain(20).historyVisibleAfterSequence())
                .isZero();
        assertThat(withoutHistory.toDomain().historyVisibleAfterSequence())
                .isEqualTo(10L);
    }

    @Test
    void invalidMembershipHistoryBoundariesFailClosed() {
        assertThatThrownBy(() -> new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                profile(), CREATED_AT, null, null, 10L, -1L, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MongoMembershipDocument(
                "membership-1", 3, "room-1", "user-1",
                MembershipRole.MEMBER, MembershipStatus.ACTIVE,
                profile(), CREATED_AT, null, null, 10L, 11L, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private Membership membership(
            String membershipId,
            MembershipRole role,
            MembershipStatus status,
            Instant leftAt,
            Instant bannedAt,
            long version
    ) {
        return Membership.restore(
                membershipId,
                "room-1",
                membershipId,
                role,
                status,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                CREATED_AT,
                leftAt,
                bannedAt,
                10,
                version);
    }

    private MongoMembershipDocument document(
            MembershipRole role,
            MembershipStatus status,
            Instant leftAt,
            Instant bannedAt,
            long version
    ) {
        return new MongoMembershipDocument(
                "membership-1",
                3,
                "room-1",
                "user-1",
                role,
                status,
                profile(),
                CREATED_AT,
                leftAt,
                bannedAt,
                10L,
                null,
                version);
    }

    private MongoMembershipProfileDocument profile() {
        return new MongoMembershipProfileDocument(
                2,
                "참여자 2",
                null,
                1,
                Instant.EPOCH,
                Instant.EPOCH);
    }

    private RoomCommandReceipt receipt(
            String clientRequestId,
            Instant expiresAt
    ) {
        return new RoomCommandReceipt(
                "receipt-1",
                "user-1",
                clientRequestId,
                RoomCommandType.CREATE_ROOM,
                "fingerprint",
                new StoredRoomCommandResult("RESULT", 1, "{}"),
                CREATED_AT,
                expiresAt);
    }

    private void assertUnsupportedSchema(
            Runnable mapping,
            String collectionName,
            int schemaVersion
    ) {
        assertThatThrownBy(mapping::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(collectionName)
                .hasMessageContaining(
                        Integer.toString(schemaVersion));
    }
}
