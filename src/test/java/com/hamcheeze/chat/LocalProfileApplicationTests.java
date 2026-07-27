package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.application.local.LocalAllowListRoomAuthorizationService;
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
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.support.RecordingChatMessagePipeline;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.config.LocalRoomProperties;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import com.mongodb.ReadConcern;
import com.mongodb.ReadPreference;
import com.mongodb.TransactionOptions;
import com.mongodb.WriteConcern;
import com.mongodb.client.MongoClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.health.contributor.Status;
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
    private JwtDecoder jwtDecoder;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private LocalRoomProperties roomProperties;

    @Autowired
    private RoomAuthorizationService authorizationService;

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
        assertThat(mongoClient).isNotNull();
        assertThat(mongoDatabaseFactory).isNotNull();
        assertThat(mongoTransactionManager).isNotNull();
        assertThat(mongoTransactionTemplate).isNotNull();
        assertThat(applicationContext.getBeansOfType(
                TransactionOptions.class))
                .hasSize(1)
                .containsEntry(
                        "chatMessageMongoTransactionOptions",
                        transactionOptions);
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
        assertThat(jwtDecoder).isNotNull();
        assertThat(jwtProperties.getIssuer()).isEqualTo("chat-local");
        assertThat(roomProperties.getAllowedRooms())
                .containsExactly("test-room");
        assertThat(authorizationService)
                .isInstanceOf(
                        LocalAllowListRoomAuthorizationService.class);
        assertThat(authorizationService.authorizeSubscription(
                "user-1", "test-room"))
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
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
