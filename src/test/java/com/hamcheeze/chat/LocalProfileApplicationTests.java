package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.delivery.SimpleBrokerChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.message.mongo.MongoChatMessageStore;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoMembershipStore;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptStore;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.mongo.MongoRoomStore;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier;
import com.hamcheeze.chat.room.mongo.MongoRoomQueryReader;
import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import com.hamcheeze.chat.room.api.RoomApiExceptionHandler;
import com.hamcheeze.chat.room.api.RoomCommandController;
import com.hamcheeze.chat.room.api.RoomCommandHttpMapper;
import com.hamcheeze.chat.room.api.RoomQueryController;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.idempotency.IdempotentRoomCommandExecutor;
import com.hamcheeze.chat.room.application.idempotency.RoomCommandFingerprintFactory;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCodec;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.room.query.RoomQueryService;
import com.hamcheeze.chat.room.authorization.MembershipRoomAuthorizationService;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.mongo.MongoRoomAccessReader;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.support.RecordingChatMessagePipeline;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import com.hamcheeze.chat.websocket.access.WebSocketRoomAccessRevoker;
import com.mongodb.ReadConcern;
import com.mongodb.ReadPreference;
import com.mongodb.TransactionOptions;
import com.mongodb.WriteConcern;
import com.mongodb.client.MongoClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.mongodb.health.MongoHealthIndicator;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("local")
class LocalProfileApplicationTests
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private ChatMessagePipeline pipeline;

    @Autowired
    private ChatMessageProcessor processor;

    @Autowired
    private SimpleBrokerChatMessagePublisher publisher;

    @Autowired
    private ChatMessageStore store;

    @Autowired
    private MongoClient mongoClient;

    @Autowired
    private MongoDatabaseFactory mongoDatabaseFactory;

    @Autowired
    private MongoTransactionManager mongoTransactionManager;

    @Autowired
    @Qualifier("chatMessageMongoTransactionOptions")
    private TransactionOptions transactionOptions;

    @Autowired
    @Qualifier("mongoTransactionTemplate")
    private TransactionTemplate mongoTransactionTemplate;

    @Autowired
    private MongoChatMessageSchemaInitializer schemaInitializer;

    @Autowired
    private MongoRoomSchemaInitializer roomSchemaInitializer;

    @Autowired
    private RoomStore roomStore;

    @Autowired
    private MembershipStore membershipStore;

    @Autowired
    private RoomCommandReceiptStore roomCommandReceiptStore;

    @Autowired
    private RoomCommandService roomCommandService;

    @Autowired
    private IdempotentRoomCommandExecutor idempotentRoomCommandExecutor;

    @Autowired
    private RoomCommandFingerprintFactory roomCommandFingerprintFactory;

    @Autowired
    private RoomCommandResultCodec roomCommandResultCodec;

    @Autowired
    private MongoRoomCommandExceptionClassifier
            mongoRoomCommandExceptionClassifier;

    @Autowired
    private RoomCommandController roomCommandController;

    @Autowired
    private RoomQueryController roomQueryController;

    @Autowired
    private RoomQueryService roomQueryService;

    @Autowired
    private RoomQueryReader roomQueryReader;

    @Autowired
    private RoomCommandHttpMapper roomCommandHttpMapper;

    @Autowired
    private RoomApiExceptionHandler roomApiExceptionHandler;

    @Autowired
    private AuthenticatedUserIdResolver authenticatedUserIdResolver;

    @Autowired
    private RoomQueryCursorCodec roomQueryCursorCodec;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private RoomAuthorizationService authorizationService;

    @Autowired
    private RoomAccessReader roomAccessReader;

    @Autowired
    private ChatPipelineHealthIndicator pipelineHealth;

    @Value("${spring.lifecycle.timeout-per-shutdown-phase}")
    private Duration lifecyclePhaseTimeout;

    @Value("${chat.message-pipeline.shutdown-drain-timeout-ms}")
    private long pipelineDrainTimeoutMs;

    @Test
    void assemblesLocalRuntimeBeansAndRunsMessagePipeline()
            throws Exception {
        assertThat(pipeline)
                .isInstanceOf(InMemoryChatMessagePipeline.class);
        assertThat(processor).isNotNull();
        assertThat(publisher).isNotNull();
        assertThat(store).isInstanceOf(MongoChatMessageStore.class);
        assertThat(applicationContext.getBeansOfType(
                ChatMessageStore.class))
                .hasSize(1)
                .containsKey("chatMessageStore")
                .containsValue(store);
        assertThat(applicationContext.getBeansOfType(
                InMemoryChatMessageStore.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(
                MongoClient.class)).hasSize(1);
        assertThat(applicationContext.getBeansOfType(
                MongoOperations.class)).hasSize(1);
        assertThat(applicationContext.getBeansOfType(
                MongoDatabaseFactory.class)).hasSize(1);
        assertThat(applicationContext.getBeansOfType(
                MongoHealthIndicator.class)).hasSize(1);
        assertThat(mongoClient).isNotNull();
        assertThat(mongoDatabaseFactory).isNotNull();
        assertThat(mongoTransactionManager).isNotNull();
        assertThat(mongoTransactionTemplate).isNotNull();
        assertThat(applicationContext.getBeansOfType(
                TransactionOptions.class))
                .hasSize(1)
                .containsEntry(
                        "mongoTransactionOptions",
                        transactionOptions);
        assertThat(applicationContext.getBean(
                "chatMessageMongoTransactionOptions"))
                .isSameAs(transactionOptions);
        assertThat(applicationContext.getBeansOfType(
                MongoTransactionManager.class))
                .hasSize(1)
                .containsValue(mongoTransactionManager);
        assertThat(applicationContext.getBeansOfType(
                TransactionTemplate.class))
                .hasSize(1)
                .containsEntry(
                        "mongoTransactionTemplate",
                        mongoTransactionTemplate);
        assertThat(transactionOptions.getReadConcern())
                .isEqualTo(ReadConcern.SNAPSHOT);
        assertThat(transactionOptions.getWriteConcern())
                .isEqualTo(WriteConcern.MAJORITY);
        assertThat(transactionOptions.getReadPreference())
                .isEqualTo(ReadPreference.primary());
        assertThat(mongoTransactionManager.getDatabaseFactory())
                .isSameAs(mongoDatabaseFactory);
        assertThat(mongoOperations)
                .isInstanceOf(MongoTemplate.class);
        assertThat(((MongoTemplate) mongoOperations)
                .getMongoDatabaseFactory())
                .isSameAs(mongoDatabaseFactory);
        assertThat(schemaInitializer).isNotNull();
        assertThat(roomSchemaInitializer).isNotNull();
        assertThat(applicationContext.getBeansOfType(
                RoomStore.class))
                .hasSize(1)
                .containsEntry("roomStore", roomStore);
        assertThat(roomStore).isInstanceOf(MongoRoomStore.class);
        assertThat(applicationContext.getBeansOfType(
                MembershipStore.class))
                .hasSize(1)
                .containsEntry("membershipStore", membershipStore);
        assertThat(membershipStore)
                .isInstanceOf(MongoMembershipStore.class);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandReceiptStore.class))
                .hasSize(1)
                .containsEntry(
                        "roomCommandReceiptStore",
                        roomCommandReceiptStore);
        assertThat(roomCommandReceiptStore)
                .isInstanceOf(
                        MongoRoomCommandReceiptStore.class);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandService.class))
                .hasSize(1)
                .containsValue(roomCommandService);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandAccessRevocationCoordinator.class))
                .hasSize(1);
        assertThat(applicationContext.getBeansOfType(
                RoomAccessRevocationPort.class))
                .hasSize(1)
                .allSatisfy((name, port) ->
                        assertThat(port).isInstanceOf(
                                WebSocketRoomAccessRevoker.class));
        assertThat(applicationContext.getBeansOfType(
                IdempotentRoomCommandExecutor.class))
                .hasSize(1)
                .containsValue(idempotentRoomCommandExecutor);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandFingerprintFactory.class))
                .hasSize(1)
                .containsValue(roomCommandFingerprintFactory);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandResultCodec.class))
                .hasSize(1)
                .containsValue(roomCommandResultCodec);
        assertThat(applicationContext.getBeansOfType(
                MongoRoomCommandExceptionClassifier.class))
                .hasSize(1)
                .containsValue(mongoRoomCommandExceptionClassifier);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandController.class))
                .hasSize(1)
                .containsValue(roomCommandController);
        assertThat(applicationContext.getBeansOfType(
                RoomQueryController.class))
                .hasSize(1)
                .containsValue(roomQueryController);
        assertThat(applicationContext.getBeansOfType(
                RoomQueryService.class))
                .hasSize(1)
                .containsValue(roomQueryService);
        assertThat(applicationContext.getBeansOfType(
                RoomQueryReader.class))
                .hasSize(1)
                .containsValue(roomQueryReader);
        assertThat(roomQueryReader)
                .isInstanceOf(MongoRoomQueryReader.class);
        assertThat(applicationContext.getBeansOfType(
                RoomCommandHttpMapper.class))
                .hasSize(1)
                .containsValue(roomCommandHttpMapper);
        assertThat(applicationContext.getBeansOfType(
                RoomApiExceptionHandler.class))
                .hasSize(1)
                .containsValue(roomApiExceptionHandler);
        assertThat(applicationContext.getBeansOfType(
                AuthenticatedUserIdResolver.class))
                .hasSize(1)
                .containsValue(authenticatedUserIdResolver);
        assertThat(applicationContext.getBeansOfType(
                RoomQueryCursorCodec.class))
                .hasSize(1)
                .containsValue(roomQueryCursorCodec);
        assertThat(applicationContext.getBeansOfType(
                SecurityFilterChain.class)).hasSize(1);
        assertThat(mongoOperations.collectionExists(
                MongoChatMessageDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoOperations.collectionExists(
                MongoRoomSequenceDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoOperations.indexOps(
                MongoChatMessageDocument.COLLECTION_NAME)
                .getIndexInfo())
                .extracting(index -> index.getName())
                .contains(
                        "uk_chat_message_idempotency",
                        "uk_chat_message_room_sequence");
        assertThat(mongoOperations.collectionExists(
                MongoRoomDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoOperations.collectionExists(
                MongoMembershipDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoOperations.collectionExists(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isTrue();
        assertThat(mongoOperations.indexOps(
                MongoMembershipDocument.COLLECTION_NAME)
                .getIndexInfo())
                .extracting(index -> index.getName())
                .contains(
                        "uk_chat_membership_room_user",
                        "ix_chat_membership_room_status",
                        "ix_chat_membership_user_status",
                        "uk_chat_membership_room_owner");
        assertThat(jwtDecoder).isNotNull();
        assertThat(jwtProperties.getIssuer()).isEqualTo("chat-local");
        assertThat(authorizationService)
                .isInstanceOf(
                        MembershipRoomAuthorizationService.class);
        assertThat(applicationContext.getBeansOfType(
                RoomAuthorizationService.class))
                .hasSize(1)
                .containsValue(authorizationService);
        assertThat(roomAccessReader)
                .isInstanceOf(MongoRoomAccessReader.class);
        assertThat(applicationContext.getBeansOfType(
                RoomAccessReader.class)).hasSize(1);
        assertThat(authorizationService.authorizeSubscription(
                "user-1", "test-room"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(authorizationService.authorizeMessageSend(
                "user-1", "not-allowed"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(applicationContext.getBeansOfType(
                RecordingChatMessagePipeline.class)).isEmpty();
        assertThat(pipeline.availability())
                .isEqualTo(PipelineAvailability.AVAILABLE);
        assertThat(pipelineHealth.health().getStatus())
                .isEqualTo(Status.UP);

        PipelineAcceptance acceptance = pipeline.tryAccept(
                new AdmittedChatCommand(
                        "local-user-1",
                        "local-connection-1",
                        "test-room",
                        "550e8400-e29b-41d4-a716-446655440000",
                        "hello"));

        assertThat(acceptance).isEqualTo(
                PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        awaitStoredMessages(1, Duration.ofSeconds(5));
        MongoChatMessageDocument storedDocument =
                mongoOperations.findOne(
                        Query.query(Criteria.where(
                                        "clientMessageId")
                                .is("550e8400-e29b-41d4-a716-446655440000")),
                        MongoChatMessageDocument.class);
        assertThat(storedDocument).isNotNull();
        assertThat(storedDocument.roomId()).isEqualTo("test-room");
        assertThat(storedDocument.senderUserId())
                .isEqualTo("local-user-1");
        assertThat(storedDocument.content()).isEqualTo("hello");
        assertThat(storedDocument.roomSequence()).isEqualTo(1);
        assertThat(storedDocument.schemaVersion()).isEqualTo(1);
    }

    @Test
    void lifecyclePhaseTimeoutExceedsPipelineDrainTimeout() {
        assertThat(lifecyclePhaseTimeout)
                .isGreaterThan(Duration.ofMillis(
                        pipelineDrainTimeoutMs));
    }

    private void awaitStoredMessages(
            int expected,
            Duration timeout
    ) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (mongoOperations.count(
                new Query(),
                MongoChatMessageDocument.COLLECTION_NAME) != expected
                && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(mongoOperations.count(
                new Query(),
                MongoChatMessageDocument.COLLECTION_NAME))
                .isEqualTo(expected);
    }
}
