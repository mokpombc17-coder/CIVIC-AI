package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ResourceLock("mongo-runtime-test")
class MongoRoomStoresIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");
    private static final Instant RECEIPT_COMPLETED_AT =
            Instant.parse("2099-01-01T00:00:00Z");
    private static MongoClient mongoClient;
    private static MongoTemplate mongoTemplate;
    private static MongoRoomSchemaInitializer schemaInitializer;
    private static MongoRoomStore roomStore;
    private static MongoMembershipStore membershipStore;
    private static MongoRoomCommandReceiptStore receiptStore;
    private static MongoRoomQueryReader queryReader;

    @BeforeAll
    static void startMongo() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoClient = MongoClients.create(connectionString);
        mongoTemplate = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        connectionString.getDatabase()));
        schemaInitializer =
                new MongoRoomSchemaInitializer(mongoTemplate);
        schemaInitializer.initialize();
        roomStore = new MongoRoomStore(mongoTemplate);
        membershipStore = new MongoMembershipStore(mongoTemplate);
        receiptStore =
                new MongoRoomCommandReceiptStore(mongoTemplate);
        queryReader = new MongoRoomQueryReader(
                mongoTemplate,
                Duration.ofSeconds(1));
    }

    @AfterAll
    static void stopMongoClient() {
        mongoClient.close();
    }

    @BeforeEach
    void clearDocuments() {
        mongoTemplate.remove(
                new Query(),
                MongoRoomDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);
        schemaInitializer.initialize();
    }

    @Test
    void roomStoreInsertsAndFindsActiveAndClosedRooms() {
        Room active = room(
                "room-active",
                RoomStatus.ACTIVE,
                2,
                null,
                0);
        Room closed = room(
                "room-closed",
                RoomStatus.CLOSED,
                0,
                CREATED_AT.plusSeconds(60),
                4);

        roomStore.insert(active);
        roomStore.insert(closed);

        assertThat(roomStore.findById(active.roomId()))
                .contains(active);
        assertThat(roomStore.findById(closed.roomId()))
                .contains(closed);
        assertThat(roomStore.findById("missing-room")).isEmpty();
        Document raw = mongoTemplate.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .find(new Document("_id", active.roomId()))
                .first();
        assertThat(raw).isNotNull();
        assertThat(raw.getInteger("schemaVersion")).isEqualTo(7);
        assertThat(raw.getLong("nextParticipantNumber"))
                .isEqualTo(active.nextParticipantNumber());
        assertThat(raw.getString("ownerMembershipId"))
                .isEqualTo(active.ownerMembershipId());
        assertThat(raw.getList("categoryIds", String.class))
                .containsExactly(
                        RoomCategoryDefaults.POLICY_CATEGORY_ID);
        assertThat(raw.containsKey("categories")).isFalse();
    }

    @Test
    void roomInsertNeverOverwritesExistingRoomId() {
        Room room = room(
                "room-1",
                RoomStatus.ACTIVE,
                1,
                null,
                0);
        Room closed = room(
                "room-closed",
                RoomStatus.CLOSED,
                0,
                CREATED_AT.plusSeconds(60),
                1);
        roomStore.insert(room);
        roomStore.insert(closed);

        assertThatThrownBy(() -> roomStore.insert(room))
                .isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> roomStore.insert(closed))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(roomStore.findById("room-closed"))
                .contains(closed);
    }

    @Test
    void roomConditionalReplaceUsesDomainVersion() {
        Room stored = room(
                "room-1",
                RoomStatus.ACTIVE,
                2,
                null,
                3);
        Room replacement = Room.restore(
                "room-1",
                "room-1",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner-2",
                "owner-2",
                RoomStatus.ACTIVE,
                RoomVisibility.UNLISTED,
                JoinPolicy.INVITE_ONLY,
                2,
                Math.max(2L, (long) (2) + 1L),
                CREATED_AT,
                null,
                4);
        roomStore.insert(stored);

        assertThat(roomStore.replaceIfVersionMatches(
                replacement,
                3)).isTrue();
        assertThat(roomStore.findById("room-1"))
                .contains(replacement);
    }

    @Test
    void roomStaleOrInvalidReplaceDoesNotChangeDocument() {
        Room stored = room(
                "room-1",
                RoomStatus.ACTIVE,
                2,
                null,
                3);
        Room staleReplacement = room(
                "room-1",
                RoomStatus.ACTIVE,
                1,
                null,
                3);
        Room invalidReplacement = room(
                "room-1",
                RoomStatus.ACTIVE,
                1,
                null,
                5);
        roomStore.insert(stored);

        assertThat(roomStore.replaceIfVersionMatches(
                staleReplacement,
                2)).isFalse();
        assertThatThrownBy(() ->
                roomStore.replaceIfVersionMatches(
                        invalidReplacement,
                        3))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(roomStore.findById("room-1")).contains(stored);
    }

    @Test
    void membershipStoreInsertsAllStatusesAndFindsRelation() {
        Membership active = member(
                "active",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0);
        Membership left = member(
                "left",
                "room-1",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                1);
        Membership banned = member(
                "banned",
                "room-1",
                "user-3",
                MembershipRole.MEMBER,
                MembershipStatus.BANNED,
                2);
        membershipStore.insert(active);
        membershipStore.insert(left);
        membershipStore.insert(banned);

        Document raw = membershipCollection()
                .find(new Document("_id", active.membershipId()))
                .first();
        assertThat(raw).isNotNull();
        assertThat(raw.getInteger("schemaVersion")).isEqualTo(3);
        Document profile = raw.get("profile", Document.class);
        assertThat(profile).isNotNull();
        assertThat(profile.getLong("participantNumber"))
                .isEqualTo(active.profile().participantNumber());
        assertThat(profile.getString("displayName"))
                .isEqualTo(active.profile().displayName());

        assertThat(membershipStore.findById("active"))
                .contains(active);
        assertThat(membershipStore.findById("left")).contains(left);
        assertThat(membershipStore.findById("banned"))
                .contains(banned);
        assertThat(membershipStore.findByRoomIdAndUserId(
                "room-1",
                "user-2")).contains(left);
        assertThat(membershipStore.findById("missing")).isEmpty();
    }

    @Test
    void membershipRoomUserRelationIsUnique() {
        Membership first = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0);
        Membership duplicateRelation = member(
                "membership-2",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                0);
        membershipStore.insert(first);

        assertThatThrownBy(() ->
                membershipStore.insert(duplicateRelation))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(membershipStore.findByRoomIdAndUserId(
                "room-1",
                "user-1")).contains(first);
    }

    @Test
    void ownerPartialIndexAllowsAtMostOneOwnerPerRoom() {
        Membership activeOwner = member(
                "owner-1",
                "room-1",
                "owner-1",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                0);
        Membership leftOwner = member(
                "owner-2",
                "room-1",
                "owner-2",
                MembershipRole.OWNER,
                MembershipStatus.LEFT,
                0);
        membershipStore.insert(activeOwner);

        assertThatThrownBy(() -> membershipStore.insert(leftOwner))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void ownersInDifferentRoomsAndMembersInSameRoomAreAllowed() {
        membershipStore.insert(member(
                "owner-1",
                "room-1",
                "owner-1",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                0));
        membershipStore.insert(member(
                "owner-2",
                "room-2",
                "owner-2",
                MembershipRole.OWNER,
                MembershipStatus.LEFT,
                0));
        membershipStore.insert(member(
                "member-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0));
        membershipStore.insert(member(
                "member-2",
                "room-1",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0));

        assertThat(mongoTemplate.count(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME))
                .isEqualTo(4);
    }

    @Test
    void membershipConditionalReplaceSupportsStatusTransitions() {
        Membership active = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0);
        membershipStore.insert(active);

        Membership left = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                1);
        Membership rejoined = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                2);
        Membership banned = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.BANNED,
                3);
        Membership unbanned = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                4);

        assertThat(membershipStore.replaceIfVersionMatches(
                left,
                0)).isTrue();
        assertThat(membershipStore.replaceIfVersionMatches(
                rejoined,
                1)).isTrue();
        assertThat(membershipStore.replaceIfVersionMatches(
                banned,
                2)).isTrue();
        assertThat(membershipStore.replaceIfVersionMatches(
                unbanned,
                3)).isTrue();
        assertThat(membershipStore.findById("membership-1"))
                .contains(unbanned);
    }

    @Test
    void membershipConditionalReplaceSupportsRoleTransitions() {
        Membership member = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0);
        Membership owner = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                1);
        Membership memberAgain = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                2);
        membershipStore.insert(member);

        assertThat(membershipStore.replaceIfVersionMatches(
                owner,
                0)).isTrue();
        assertThat(membershipStore.replaceIfVersionMatches(
                memberAgain,
                1)).isTrue();
        assertThat(membershipStore.findById("membership-1"))
                .contains(memberAgain);
    }

    @Test
    void membershipStaleAndIdentityChangingReplaceMiss() {
        Membership stored = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                3);
        membershipStore.insert(stored);
        Membership stale = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                3);
        Membership changedIdentity = member(
                "membership-1",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                4);
        Membership invalidVersion = member(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                5);

        assertThat(membershipStore.replaceIfVersionMatches(
                stale,
                2)).isFalse();
        assertThat(membershipStore.replaceIfVersionMatches(
                changedIdentity,
                3)).isFalse();
        assertThatThrownBy(() ->
                membershipStore.replaceIfVersionMatches(
                        invalidVersion,
                        3))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(membershipStore.findById("membership-1"))
                .contains(stored);
    }

    @Test
    void queryReaderUsesStableMembershipCursorAndBatchRoomLookup() {
        Room room1 = room(
                "room-1",
                RoomStatus.ACTIVE,
                2,
                null,
                0);
        Room room2 = room(
                "room-2",
                RoomStatus.ACTIVE,
                2,
                null,
                0);
        roomStore.insert(room1);
        roomStore.insert(room2);
        membershipStore.insert(member(
                "membership-01",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0));
        membershipStore.insert(member(
                "membership-02",
                "room-2",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0));
        membershipStore.insert(member(
                "membership-03",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                0));

        CursorSlice<Membership> first =
                queryReader.findMembershipsByUserAndStatus(
                        "user-1",
                        MembershipStatus.ACTIVE,
                        null,
                        1);
        CursorSlice<Membership> second =
                queryReader.findMembershipsByUserAndStatus(
                        "user-1",
                        MembershipStatus.ACTIVE,
                        first.items().getFirst().membershipId(),
                        1);

        assertThat(first.items())
                .extracting(Membership::membershipId)
                .containsExactly("membership-01");
        assertThat(first.hasNext()).isTrue();
        assertThat(second.items())
                .extracting(Membership::membershipId)
                .containsExactly("membership-02");
        assertThat(second.hasNext()).isFalse();
        assertThat(queryReader.findRoomsByIds(
                List.of("room-2", "room-1")))
                .containsExactlyInAnyOrder(room1, room2);
    }

    @Test
    void receiptStoreInsertsAndFindsOpaqueResult() {
        RoomCommandReceipt receipt =
                receipt("receipt-1", "user-1");
        receiptStore.insert(receipt);

        assertThat(receiptStore.findByRequest(
                "user-1",
                receipt.clientRequestId()))
                .contains(receipt);
        assertThat(receiptStore.findByRequest(
                "missing-user",
                receipt.clientRequestId())).isEmpty();
        MongoRoomCommandReceiptDocument document =
                mongoTemplate.findById(
                        "receipt-1",
                        MongoRoomCommandReceiptDocument.class);
        assertThat(document).isNotNull();
        assertThat(document.result().payload())
                .isEqualTo("{\"outcome\":\"JOINED\"}");
        assertThat(document.expiresAt())
                .isEqualTo(
                        RECEIPT_COMPLETED_AT.plusSeconds(3600));
    }

    @Test
    void receiptRequestKeyIsUniquePerRequester() {
        RoomCommandReceipt first =
                receipt("receipt-1", "user-1");
        RoomCommandReceipt duplicateRequest =
                receipt("receipt-2", "user-1");
        RoomCommandReceipt anotherRequester =
                receipt("receipt-3", "user-2");
        receiptStore.insert(first);

        assertThatThrownBy(() ->
                receiptStore.insert(duplicateRequest))
                .isInstanceOf(DuplicateKeyException.class);
        receiptStore.insert(anotherRequester);
        assertThat(receiptStore.findByRequest(
                "user-2",
                first.clientRequestId()))
                .contains(anotherRequester);
    }

    @Test
    void initializerIsIdempotentAndCreatesExactIndexes() {
        schemaInitializer.initialize();
        schemaInitializer.initialize();

        assertThat(mongoTemplate.collectionExists(
                MongoRoomDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoTemplate.collectionExists(
                MongoMembershipDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoTemplate.collectionExists(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isTrue();

        List<Document> roomIndexes = mongoTemplate
                .getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .listIndexes(Document.class)
                .into(new ArrayList<>());
        assertIndex(
                roomIndexes,
                MongoRoomSchemaInitializer
                        .LISTED_ROOM_CURSOR_INDEX_NAME,
                new Document("status", 1)
                        .append("visibility", 1)
                        .append("_id", 1),
                false);

        List<Document> membershipIndexes =
                membershipCollection()
                        .listIndexes(Document.class)
                        .into(new ArrayList<>());
        assertIndex(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_ROOM_USER_INDEX_NAME,
                new Document("roomId", 1).append("userId", 1),
                true);
        assertIndex(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_ROOM_STATUS_INDEX_NAME,
                new Document("roomId", 1).append("status", 1),
                false);
        assertIndex(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_USER_STATUS_INDEX_NAME,
                new Document("userId", 1).append("status", 1),
                false);
        assertIndex(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_USER_STATUS_CURSOR_INDEX_NAME,
                new Document("userId", 1)
                        .append("status", 1)
                        .append("_id", 1),
                false);
        assertIndex(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_ROOM_STATUS_CURSOR_INDEX_NAME,
                new Document("roomId", 1)
                        .append("status", 1)
                        .append("_id", 1),
                false);
        Document ownerIndex = index(
                membershipIndexes,
                MongoRoomSchemaInitializer
                        .MEMBERSHIP_OWNER_INDEX_NAME);
        assertThat(ownerIndex.get("key"))
                .isEqualTo(new Document("roomId", 1));
        assertThat(ownerIndex.getBoolean("unique", false)).isTrue();
        assertThat(ownerIndex.get("partialFilterExpression"))
                .isEqualTo(new Document("role", "OWNER"));

        List<Document> receiptIndexes =
                receiptCollection()
                        .listIndexes(Document.class)
                        .into(new ArrayList<>());
        assertIndex(
                receiptIndexes,
                MongoRoomSchemaInitializer
                        .RECEIPT_REQUEST_INDEX_NAME,
                new Document("requesterUserId", 1)
                        .append("clientRequestId", 1),
                true);
        Document ttlIndex = index(
                receiptIndexes,
                MongoRoomSchemaInitializer
                        .RECEIPT_TTL_INDEX_NAME);
        assertThat(ttlIndex.get("key"))
                .isEqualTo(new Document("expiresAt", 1));
        assertThat(((Number) ttlIndex.get("expireAfterSeconds"))
                .longValue()).isZero();
    }

    private Room room(
            String roomId,
            RoomStatus status,
            int activeMemberCount,
            Instant closedAt,
            long version
    ) {
        return Room.restore(
                roomId,
                roomId,
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                status,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                Math.max(2L, (long) (activeMemberCount) + 1L),
                CREATED_AT,
                closedAt,
                version);
    }

    private Membership member(
            String membershipId,
            String roomId,
            String userId,
            MembershipRole role,
            MembershipStatus status,
            long version
    ) {
        return Membership.restore(
                membershipId,
                roomId,
                userId,
                role,
                status,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                CREATED_AT,
                status == MembershipStatus.LEFT
                        ? CREATED_AT.plusSeconds(10) : null,
                status == MembershipStatus.BANNED
                        ? CREATED_AT.plusSeconds(10) : null,
                10,
                version);
    }

    private RoomCommandReceipt receipt(
            String receiptId,
            String requesterUserId
    ) {
        return new RoomCommandReceipt(
                receiptId,
                requesterUserId,
                "550e8400-e29b-41d4-a716-446655440000",
                RoomCommandType.JOIN_ROOM,
                "sha256:fingerprint",
                new StoredRoomCommandResult(
                        "JOIN_ROOM_RESULT",
                        1,
                        "{\"outcome\":\"JOINED\"}"),
                RECEIPT_COMPLETED_AT,
                RECEIPT_COMPLETED_AT.plusSeconds(3600));
    }

    private MongoCollection<Document> membershipCollection() {
        return mongoTemplate.getCollection(
                MongoMembershipDocument.COLLECTION_NAME);
    }

    private MongoCollection<Document> receiptCollection() {
        return mongoTemplate.getCollection(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
    }

    private void assertIndex(
            List<Document> indexes,
            String name,
            Document key,
            boolean unique
    ) {
        Document index = index(indexes, name);
        assertThat(index.get("key")).isEqualTo(key);
        assertThat(index.getBoolean("unique", false))
                .isEqualTo(unique);
    }

    private Document index(
            List<Document> indexes,
            String name
    ) {
        return indexes.stream()
                .filter(index -> name.equals(index.getString("name")))
                .findFirst()
                .orElseThrow();
    }
}
