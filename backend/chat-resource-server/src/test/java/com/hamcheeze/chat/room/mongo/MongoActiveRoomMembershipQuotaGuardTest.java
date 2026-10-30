package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaDecision;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ResourceLock("mongo-runtime-test")
class MongoActiveRoomMembershipQuotaGuardTest {

    private static final Instant NOW =
            Instant.parse("2026-08-06T03:00:00Z");
    private static MongoClient mongoClient;
    private static MongoTemplate mongoTemplate;
    private static MongoRoomSchemaInitializer schemaInitializer;
    private static MongoMembershipStore membershipStore;
    private static MongoActiveRoomMembershipQuotaGuard guard;
    private static TransactionTemplate transactionTemplate;

    @BeforeAll
    static void startMongo() {
        ConnectionString connectionString = new ConnectionString(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoClient = MongoClients.create(connectionString);
        SimpleMongoClientDatabaseFactory databaseFactory =
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        connectionString.getDatabase());
        mongoTemplate = new MongoTemplate(databaseFactory);
        schemaInitializer =
                new MongoRoomSchemaInitializer(mongoTemplate);
        schemaInitializer.initialize();
        membershipStore = new MongoMembershipStore(mongoTemplate);
        guard = new MongoActiveRoomMembershipQuotaGuard(
                mongoTemplate,
                Duration.ofSeconds(1));
        transactionTemplate = new TransactionTemplate(
                new MongoTransactionManager(databaseFactory));
    }

    @AfterAll
    static void stopMongoClient() {
        mongoClient.close();
    }

    @BeforeEach
    void clearDocuments() {
        mongoTemplate.remove(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME);
        mongoTemplate.remove(
                new Query(),
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);
        schemaInitializer.initialize();
    }

    @Test
    void lazilyCreatesAndReusesOneLock() {
        assertThat(check("user-1", 20))
                .isEqualTo(ActiveRoomMembershipQuotaDecision.ALLOWED);
        assertThat(check("user-1", 20))
                .isEqualTo(ActiveRoomMembershipQuotaDecision.ALLOWED);

        Document lock = lock("user-1");
        assertThat(lock).isNotNull();
        assertThat(lock.get("schemaVersion"))
                .isEqualTo(1);
        assertThat(lock.get("revision"))
                .isEqualTo(2L);
        assertThat(lock.get("revision"))
                .isInstanceOf(Long.class);
        assertThat(lock.get("updatedAt"))
                .isEqualTo(Date.from(NOW));
        assertThat(mongoTemplate.getCollection(
                        MongoUserActiveRoomQuotaLockDocument
                                .COLLECTION_NAME)
                .countDocuments())
                .isEqualTo(1);
    }

    @Test
    void boundsActiveMembershipCountAtConfiguredLimit() {
        insertMemberships("user-1", MembershipStatus.ACTIVE, 19, 0);
        assertThat(check("user-1", 20))
                .isEqualTo(ActiveRoomMembershipQuotaDecision.ALLOWED);

        insertMemberships("user-1", MembershipStatus.ACTIVE, 1, 19);
        assertThat(check("user-1", 20))
                .isEqualTo(
                        ActiveRoomMembershipQuotaDecision.LIMIT_REACHED);

        insertMemberships("user-1", MembershipStatus.ACTIVE, 1, 20);
        assertThat(check("user-1", 20))
                .isEqualTo(
                        ActiveRoomMembershipQuotaDecision.LIMIT_REACHED);
    }

    @Test
    void excludesLeftAndBannedButIncludesOwnerAndMember() {
        insertMemberships(
                "user-1",
                MembershipStatus.ACTIVE,
                5,
                0,
                MembershipRole.OWNER);
        insertMemberships(
                "user-1",
                MembershipStatus.ACTIVE,
                14,
                5,
                MembershipRole.MEMBER);
        insertMemberships("user-1", MembershipStatus.LEFT, 20, 30);
        insertMemberships("user-1", MembershipStatus.BANNED, 20, 60);

        assertThat(check("user-1", 20))
                .isEqualTo(ActiveRoomMembershipQuotaDecision.ALLOWED);

        insertMemberships(
                "user-1",
                MembershipStatus.ACTIVE,
                1,
                19,
                MembershipRole.MEMBER);
        assertThat(check("user-1", 20))
                .isEqualTo(
                        ActiveRoomMembershipQuotaDecision.LIMIT_REACHED);
    }

    @Test
    void missingRequiredHintFailsInsteadOfScanningSilently() {
        mongoTemplate.indexOps(
                        MongoMembershipDocument.COLLECTION_NAME)
                .dropIndex(MongoRoomSchemaInitializer
                        .MEMBERSHIP_USER_STATUS_INDEX_NAME);

        assertThatThrownBy(() -> check("user-1", 20))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void malformedLocksFailClosed() {
        assertMalformedLock(new Document("_id", "user-1")
                .append("schemaVersion", 2)
                .append("revision", 1L)
                .append("updatedAt", Date.from(NOW)));
        assertMalformedLock(new Document("_id", "user-1")
                .append("schemaVersion", 1)
                .append("revision", 1)
                .append("updatedAt", Date.from(NOW)));
        assertMalformedLock(new Document("_id", "user-1")
                .append("schemaVersion", 1)
                .append("revision", 1L)
                .append("updatedAt", "2026-08-06T03:00:00Z"));
    }

    @Test
    void transactionFailureRollsBackLockTouch() {
        assertThatThrownBy(() -> transactionTemplate.execute(status -> {
            guard.checkBeforeIncrease("user-1", 20, NOW);
            throw new IllegalStateException("forced failure");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(lock("user-1")).isNull();
    }

    @Test
    void refusesToWriteOutsideCallerTransaction() {
        assertThatThrownBy(() -> guard.checkBeforeIncrease(
                "user-1",
                20,
                NOW))
                .isInstanceOf(RoomCommandExecutionException.class)
                .hasMessageContaining("requires a transaction");
        assertThat(lock("user-1")).isNull();
    }

    private void assertMalformedLock(Document malformed) {
        mongoTemplate.getCollection(
                        MongoUserActiveRoomQuotaLockDocument
                                .COLLECTION_NAME)
                .insertOne(malformed);

        assertThatThrownBy(() -> check("user-1", 20))
                .isInstanceOf(RoomCommandExecutionException.class);

        mongoTemplate.remove(
                new Query(),
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);
    }

    private ActiveRoomMembershipQuotaDecision check(
            String userId,
            int limit
    ) {
        return transactionTemplate.execute(status ->
                guard.checkBeforeIncrease(userId, limit, NOW));
    }

    private Document lock(String userId) {
        return mongoTemplate.getCollection(
                        MongoUserActiveRoomQuotaLockDocument
                                .COLLECTION_NAME)
                .find(new Document("_id", userId))
                .first();
    }

    private void insertMemberships(
            String userId,
            MembershipStatus status,
            int count,
            int offset
    ) {
        insertMemberships(
                userId,
                status,
                count,
                offset,
                MembershipRole.MEMBER);
    }

    private void insertMemberships(
            String userId,
            MembershipStatus status,
            int count,
            int offset,
            MembershipRole role
    ) {
        for (int index = 0; index < count; index++) {
            int number = offset + index;
            membershipStore.insert(Membership.restore(
                    "membership-" + status + "-" + number,
                    "room-" + status + "-" + number,
                    userId,
                    role,
                    status,
                    com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                    NOW.minusSeconds(120),
                    status == MembershipStatus.LEFT
                            ? NOW.minusSeconds(60)
                            : null,
                    status == MembershipStatus.BANNED
                            ? NOW.minusSeconds(60)
                            : null,
                    0,
                    0));
        }
    }
}
