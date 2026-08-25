package com.hamcheeze.chat.support;

import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCreationResult;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomMembershipTransitions;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.creation.mongo.MongoRoomCreationRequestDocument;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoUserActiveRoomQuotaLockDocument;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateDocument;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;

@ResourceLock("mongo-runtime-test")
public abstract class MongoRuntimeIntegrationTest {

    @Autowired
    protected MongoOperations mongoOperations;

    @Autowired
    protected RoomStore roomStore;

    @Autowired
    protected MembershipStore membershipStore;

    @DynamicPropertySource
    static void registerMongoProperties(
            DynamicPropertyRegistry registry
    ) {
        MongoRuntimeTestContainer.registerMongoProperties(registry);
    }

    @BeforeEach
    void clearMongoRuntimeDocuments() {
        mongoOperations.remove(
                new Query(),
                MongoChatMessageDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomSequenceDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomCreationRequestDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomInboxSummaryDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomReadStateDocument.COLLECTION_NAME);
    }

    protected void seedActiveRoom(
            String roomId,
            String ownerUserId
    ) {
        RoomCreationResult creation =
                RoomMembershipTransitions.createRoom(
                        roomId,
                roomId,
                "",
                java.util.List.of(
                        RoomCategory.POLICY),
                        "membership-" + roomId + "-" + ownerUserId,
                        ownerUserId,
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN,
                        Instant.parse("2026-01-01T00:00:00Z"));
        roomStore.insert(creation.room());
        membershipStore.insert(creation.ownerMembership());
    }
}
