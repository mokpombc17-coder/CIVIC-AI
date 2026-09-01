package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.application.idempotency.IdempotentRoomCommandExecutor;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomCommandEventMapper;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.application.event.RoomEventIdGenerator;
import com.hamcheeze.chat.room.application.event.UuidRoomEventIdGenerator;
import com.hamcheeze.chat.room.application.idempotency.RoomCommandFingerprintFactory;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCodec;
import com.hamcheeze.chat.room.creation.RoomCreationProperties;
import com.hamcheeze.chat.room.creation.AdminRoomCreationRequestCursorCodec;
import com.hamcheeze.chat.room.creation.RoomCreationRequestCursorCodec;
import com.hamcheeze.chat.room.creation.RoomCreationRequestIdGenerator;
import com.hamcheeze.chat.room.creation.RoomCreationRequestService;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.creation.UuidRoomCreationRequestIdGenerator;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestStore;
import com.hamcheeze.chat.room.delivery.SimpleBrokerRoomEventDeliveryAdapter;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({
        RoomCommandProperties.class,
        RoomMembershipProperties.class,
        RoomCreationProperties.class
})
public class RoomCommandApplicationConfiguration {

    @Bean
    RoomCommandFingerprintFactory roomCommandFingerprintFactory() {
        return new RoomCommandFingerprintFactory();
    }

    @Bean
    RoomCommandResultCodec roomCommandResultCodec(
            ObjectMapper objectMapper
    ) {
        return new RoomCommandResultCodec(objectMapper);
    }

    @Bean
    RoomCommandIdGenerator roomCommandIdGenerator() {
        return new UuidRoomCommandIdGenerator();
    }

    @Bean
    RoomCreationRequestIdGenerator roomCreationRequestIdGenerator() {
        return new UuidRoomCreationRequestIdGenerator();
    }

    @Bean
    RoomCreationRequestCursorCodec roomCreationRequestCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new RoomCreationRequestCursorCodec(objectMapper);
    }

    @Bean
    AdminRoomCreationRequestCursorCodec
    adminRoomCreationRequestCursorCodec(ObjectMapper objectMapper) {
        return new AdminRoomCreationRequestCursorCodec(objectMapper);
    }

    @Bean
    MongoRoomCommandExceptionClassifier
    mongoRoomCommandExceptionClassifier() {
        return new MongoRoomCommandExceptionClassifier();
    }

    @Bean
    IdempotentRoomCommandExecutor idempotentRoomCommandExecutor(
            @Qualifier("mongoTransactionTemplate")
            TransactionOperations transactionOperations,
            RoomCommandReceiptStore receiptStore,
            RoomCommandResultCodec resultCodec,
            MongoRoomCommandExceptionClassifier exceptionClassifier,
            RoomCommandProperties properties
    ) {
        return new IdempotentRoomCommandExecutor(
                transactionOperations,
                receiptStore,
                resultCodec,
                exceptionClassifier,
                properties);
    }

    @Bean
    ApprovedRoomCreator approvedRoomCreator(
            RoomStore roomStore,
            MembershipStore membershipStore,
            RoomMembershipProperties membershipProperties,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics
    ) {
        return new ApprovedRoomCreator(
                roomStore,
                membershipStore,
                membershipProperties,
                membershipQuotaGuard,
                membershipQuotaMetrics);
    }

    @Bean
    RoomCommandService roomCommandService(
            RoomStore roomStore,
            MembershipStore membershipStore,
            RoomMessageBoundaryPort messageBoundaryPort,
            IdempotentRoomCommandExecutor executor,
            RoomCommandFingerprintFactory fingerprintFactory,
            RoomCommandIdGenerator idGenerator,
            ApprovedRoomCreator approvedRoomCreator,
            RoomCommandProperties properties,
            RoomMembershipProperties membershipProperties,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics,
            RoomCommandPostCommitCoordinator postCommitCoordinator
    ) {
        return new RoomCommandService(
                roomStore,
                membershipStore,
                messageBoundaryPort,
                executor,
                fingerprintFactory,
                idGenerator,
                approvedRoomCreator,
                Clock.systemUTC(),
                properties,
                membershipProperties,
                membershipQuotaGuard,
                membershipQuotaMetrics,
                postCommitCoordinator);
    }

    @Bean
    RoomCreationRequestService roomCreationRequestService(
            RoomCreationRequestStore store,
            RoomCreationRequestIdGenerator requestIdGenerator,
            RoomCommandIdGenerator roomIdGenerator,
            RoomCommandFingerprintFactory fingerprintFactory,
            RoomCategoryService categoryService,
            ApprovedRoomCreator approvedRoomCreator,
            RoomCommandPostCommitCoordinator postCommitCoordinator,
            ActiveRoomMembershipQuotaGuard membershipQuotaGuard,
            ActiveRoomMembershipQuotaMetrics membershipQuotaMetrics,
            RoomMembershipProperties membershipProperties,
            RoomCreationProperties creationProperties,
            RoomCreationRequestCursorCodec cursorCodec,
            AdminRoomCreationRequestCursorCodec adminCursorCodec,
            @Qualifier("mongoTransactionTemplate")
            TransactionOperations transactionOperations,
            MongoRoomCommandExceptionClassifier exceptionClassifier
    ) {
        return new RoomCreationRequestService(
                store,
                requestIdGenerator,
                roomIdGenerator,
                fingerprintFactory,
                categoryService,
                approvedRoomCreator,
                postCommitCoordinator,
                membershipQuotaGuard,
                membershipQuotaMetrics,
                membershipProperties,
                creationProperties,
                cursorCodec,
                adminCursorCodec,
                transactionOperations,
                exceptionClassifier,
                Clock.systemUTC());
    }

    @Bean
    ActiveRoomMembershipQuotaMetrics
    activeRoomMembershipQuotaMetrics(
            MeterRegistry meterRegistry
    ) {
        return new ActiveRoomMembershipQuotaMetrics(meterRegistry);
    }

    @Bean
    RoomCommandAccessRevocationCoordinator
    roomCommandAccessRevocationCoordinator(
            RoomAccessReader accessReader,
            RoomAccessRevocationPort revocationPort
    ) {
        return new RoomCommandAccessRevocationCoordinator(
                accessReader,
                revocationPort);
    }

    @Bean
    RoomCommandEventMapper roomCommandEventMapper(
            MembershipStore membershipStore,
            UserLabelDirectory userLabels
    ) {
        return new RoomCommandEventMapper(
                membershipStore,
                userLabels);
    }

    @Bean
    RoomEventIdGenerator roomEventIdGenerator() {
        return new UuidRoomEventIdGenerator();
    }

    @Bean
    RoomEventDeliveryPort roomEventDeliveryPort(
            SimpMessagingTemplate messagingTemplate,
            ActiveConnectionRegistry activeConnections,
            MeterRegistry meterRegistry
    ) {
        return new SimpleBrokerRoomEventDeliveryAdapter(
                messagingTemplate,
                activeConnections,
                meterRegistry);
    }

    @Bean
    RoomCommandEventPropagationCoordinator
    roomCommandEventPropagationCoordinator(
            RoomCommandEventMapper mapper,
            RoomEventIdGenerator eventIdGenerator,
            RoomEventDeliveryPort deliveryPort
    ) {
        return new RoomCommandEventPropagationCoordinator(
                mapper,
                eventIdGenerator,
                Clock.systemUTC(),
                deliveryPort);
    }

    @Bean
    RoomCommandPostCommitCoordinator roomCommandPostCommitCoordinator(
            RoomCommandEventPropagationCoordinator eventCoordinator,
            RoomCommandAccessRevocationCoordinator accessCoordinator
    ) {
        return new RoomCommandPostCommitCoordinator(
                eventCoordinator,
                accessCoordinator);
    }
}
