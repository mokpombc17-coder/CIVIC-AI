package com.hamcheeze.chat.application;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.AdmittedDeleteMessageCommand;
import com.hamcheeze.chat.pipeline.AdmittedEditMessageCommand;
import com.hamcheeze.chat.pipeline.AdmittedMessageCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionOutcome;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionReservation;
import com.hamcheeze.chat.websocket.ratelimit.ChatAdmissionLimiter;
import com.hamcheeze.chat.websocket.ratelimit.MessageTokenCostPolicy;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public final class ChatCommandService {

    private static final Logger log =
            LoggerFactory.getLogger(ChatCommandService.class);

    private final ActiveConnectionRegistry activeConnections;
    private final ChatCommandValidator validator;
    private final RoomAuthorizationService roomAuthorizationService;
    private final ChatMessagePipeline pipeline;
    private final MessageTokenCostPolicy tokenCostPolicy;
    private final ChatAdmissionLimiter limiter;
    private final ChatCommandResultSender resultSender;

    public ChatCommandService(
            ActiveConnectionRegistry activeConnections,
            ChatCommandValidator validator,
            RoomAuthorizationService roomAuthorizationService,
            ChatMessagePipeline pipeline,
            MessageTokenCostPolicy tokenCostPolicy,
            ChatAdmissionLimiter limiter,
            ChatCommandResultSender resultSender
    ) {
        this.activeConnections = activeConnections;
        this.validator = validator;
        this.roomAuthorizationService = roomAuthorizationService;
        this.pipeline = pipeline;
        this.tokenCostPolicy = tokenCostPolicy;
        this.limiter = limiter;
        this.resultSender = resultSender;
    }

    public void handle(
            String userId,
            String connectionId,
            String roomId,
            ChatSendCommand command
    ) {
        if (!activeConnections.isActive(userId, connectionId)) {
            return;
        }

        String responseClientMessageId = null;
        try {
            String clientMessageId = validator.validateClientMessageId(
                    command == null ? null : command.clientMessageId());
            responseClientMessageId = clientMessageId;
            ValidatedChatContent content = validator.validateContent(
                    command.content(), clientMessageId);

            if (pipeline.availability() == PipelineAvailability.UNAVAILABLE) {
                fail(
                        userId, connectionId, clientMessageId,
                        ChatCommandFailedCode.CHAT_PIPELINE_UNAVAILABLE,
                        true);
                return;
            }

            int tokenCost = tokenCostPolicy.calculate(content.codePointCount());
            try (AdmissionReservation reservation =
                         limiter.tryReserve(userId, tokenCost)) {
                if (!reservation.granted()) {
                    if (reservation.outcome()
                            == AdmissionOutcome.USER_RATE_LIMITED) {
                        reject(
                                userId, connectionId, clientMessageId,
                                ChatCommandRejectedCode.USER_RATE_LIMITED,
                                true, reservation.retryAfterMs());
                    } else {
                        reject(
                                userId, connectionId, clientMessageId,
                                ChatCommandRejectedCode.SERVER_BUSY,
                                true, reservation.retryAfterMs());
                    }
                    return;
                }

                RoomMessageSendAuthorization authorization =
                        roomAuthorizationService
                                .authorizeMessageSendWithContext(
                                userId,
                                roomId);
                if (authorization.decision()
                        == RoomAuthorizationDecision.FORBIDDEN) {
                    reject(
                            userId, connectionId, clientMessageId,
                            ChatCommandRejectedCode.ROOM_SEND_FORBIDDEN,
                            false, null);
                    return;
                }
                if (authorization.decision()
                        == RoomAuthorizationDecision.UNAVAILABLE) {
                    fail(
                            userId, connectionId, clientMessageId,
                            ChatCommandFailedCode
                                    .ROOM_AUTHORIZATION_UNAVAILABLE,
                            true);
                    return;
                }

                AdmittedChatCommand admittedCommand =
                        new AdmittedChatCommand(
                                userId,
                                authorization.membershipId(),
                                authorization.participationId(),
                                connectionId,
                                roomId,
                                clientMessageId,
                                content.normalizedContent());
                PipelineAcceptance acceptance =
                        pipeline.tryAccept(admittedCommand);
                if (acceptance == PipelineAcceptance.ACCEPTED_FOR_PROCESSING) {
                    reservation.commit();
                    return;
                }
                if (acceptance == PipelineAcceptance.BUSY) {
                    reject(
                            userId, connectionId, clientMessageId,
                            ChatCommandRejectedCode.SERVER_BUSY,
                            true, null);
                    return;
                }
                fail(
                        userId, connectionId, clientMessageId,
                        ChatCommandFailedCode.CHAT_PIPELINE_UNAVAILABLE,
                        true);
            }
        } catch (ChatValidationException exception) {
            reject(
                    userId,
                    connectionId,
                    exception.responseClientMessageId(),
                    exception.code(),
                    false,
                    null);
        } catch (RuntimeException exception) {
            log.error(
                    "Unexpected chat command failure: userId={}, connectionId={}, roomId={}, clientMessageId={}",
                    userId, connectionId, roomId, responseClientMessageId, exception);
            try {
                fail(
                        userId, connectionId, responseClientMessageId,
                        ChatCommandFailedCode.INTERNAL_ERROR,
                        true);
            } catch (RuntimeException sendFailure) {
                log.error(
                        "Failed to send INTERNAL_ERROR result: connectionId={}",
                        connectionId, sendFailure);
            }
        }
    }

    public void handleEdit(
            String userId,
            String connectionId,
            String roomId,
            ChatEditCommand command
    ) {
        if (!activeConnections.isActive(userId, connectionId)) {
            return;
        }
        String responseMutationId = null;
        try {
            String clientMutationId =
                    validator.validateClientMutationId(
                            command == null
                                    ? null
                                    : command.clientMutationId());
            responseMutationId = clientMutationId;
            String messageId = validator.validateMessageId(
                    command.messageId(),
                    clientMutationId);
            ValidatedChatContent content = validator.validateContent(
                    command.content(),
                    clientMutationId);
            admitMutation(
                    userId,
                    connectionId,
                    roomId,
                    clientMutationId,
                    messageId,
                    MessageMutationCommandType.EDIT_MESSAGE,
                    tokenCostPolicy.calculate(content.codePointCount()),
                    new AdmittedEditMessageCommand(
                            userId,
                            connectionId,
                            roomId,
                            clientMutationId,
                            messageId,
                            content.normalizedContent()));
        } catch (ChatValidationException exception) {
            sendMutationResult(
                    userId,
                    connectionId,
                    MessageMutationCommandType.EDIT_MESSAGE,
                    exception.responseClientMessageId(),
                    "REJECTED",
                    exception.code().name(),
                    false,
                    null,
                    null);
        } catch (RuntimeException exception) {
            logUnexpectedMutation(
                    userId,
                    connectionId,
                    roomId,
                    responseMutationId,
                    MessageMutationCommandType.EDIT_MESSAGE,
                    exception);
        }
    }

    public void handleDelete(
            String userId,
            String connectionId,
            String roomId,
            ChatDeleteCommand command
    ) {
        if (!activeConnections.isActive(userId, connectionId)) {
            return;
        }
        String responseMutationId = null;
        try {
            String clientMutationId =
                    validator.validateClientMutationId(
                            command == null
                                    ? null
                                    : command.clientMutationId());
            responseMutationId = clientMutationId;
            String messageId = validator.validateMessageId(
                    command.messageId(),
                    clientMutationId);
            admitMutation(
                    userId,
                    connectionId,
                    roomId,
                    clientMutationId,
                    messageId,
                    MessageMutationCommandType.DELETE_MESSAGE,
                    1,
                    new AdmittedDeleteMessageCommand(
                            userId,
                            connectionId,
                            roomId,
                            clientMutationId,
                            messageId));
        } catch (ChatValidationException exception) {
            sendMutationResult(
                    userId,
                    connectionId,
                    MessageMutationCommandType.DELETE_MESSAGE,
                    exception.responseClientMessageId(),
                    "REJECTED",
                    exception.code().name(),
                    false,
                    null,
                    null);
        } catch (RuntimeException exception) {
            logUnexpectedMutation(
                    userId,
                    connectionId,
                    roomId,
                    responseMutationId,
                    MessageMutationCommandType.DELETE_MESSAGE,
                    exception);
        }
    }

    private void admitMutation(
            String userId,
            String connectionId,
            String roomId,
            String clientMutationId,
            String messageId,
            MessageMutationCommandType commandType,
            int tokenCost,
            AdmittedMessageCommand command
    ) {
        if (pipeline.availability()
                == PipelineAvailability.UNAVAILABLE) {
            sendMutationResult(
                    userId,
                    connectionId,
                    commandType,
                    clientMutationId,
                    "FAILED",
                    ChatCommandFailedCode
                            .CHAT_PIPELINE_UNAVAILABLE.name(),
                    true,
                    null,
                    messageId);
            return;
        }
        try (AdmissionReservation reservation =
                     limiter.tryReserve(userId, tokenCost)) {
            if (!reservation.granted()) {
                String code = reservation.outcome()
                        == AdmissionOutcome.USER_RATE_LIMITED
                        ? ChatCommandRejectedCode
                        .USER_RATE_LIMITED.name()
                        : ChatCommandRejectedCode.SERVER_BUSY.name();
                sendMutationResult(
                        userId,
                        connectionId,
                        commandType,
                        clientMutationId,
                        "REJECTED",
                        code,
                        true,
                        reservation.retryAfterMs(),
                        messageId);
                return;
            }
            RoomAuthorizationDecision authorization =
                    roomAuthorizationService.authorizeMessageSend(
                            userId,
                            roomId);
            if (authorization
                    == RoomAuthorizationDecision.FORBIDDEN) {
                sendMutationResult(
                        userId,
                        connectionId,
                        commandType,
                        clientMutationId,
                        "REJECTED",
                        ChatCommandRejectedCode
                                .ROOM_SEND_FORBIDDEN.name(),
                        false,
                        null,
                        messageId);
                return;
            }
            if (authorization
                    == RoomAuthorizationDecision.UNAVAILABLE) {
                sendMutationResult(
                        userId,
                        connectionId,
                        commandType,
                        clientMutationId,
                        "FAILED",
                        ChatCommandFailedCode
                                .ROOM_AUTHORIZATION_UNAVAILABLE.name(),
                        true,
                        null,
                        messageId);
                return;
            }
            PipelineAcceptance acceptance =
                    pipeline.tryAccept(command);
            if (acceptance
                    == PipelineAcceptance.ACCEPTED_FOR_PROCESSING) {
                reservation.commit();
                return;
            }
            if (acceptance == PipelineAcceptance.BUSY) {
                sendMutationResult(
                        userId,
                        connectionId,
                        commandType,
                        clientMutationId,
                        "REJECTED",
                        ChatCommandRejectedCode.SERVER_BUSY.name(),
                        true,
                        null,
                        messageId);
                return;
            }
            sendMutationResult(
                    userId,
                    connectionId,
                    commandType,
                    clientMutationId,
                    "FAILED",
                    ChatCommandFailedCode
                            .CHAT_PIPELINE_UNAVAILABLE.name(),
                    true,
                    null,
                    messageId);
        }
    }

    private void logUnexpectedMutation(
            String userId,
            String connectionId,
            String roomId,
            String clientMutationId,
            MessageMutationCommandType commandType,
            RuntimeException exception
    ) {
        log.error(
                "Unexpected chat mutation command failure: commandType={}, userId={}, connectionId={}, roomId={}, clientMutationId={}",
                commandType,
                userId,
                connectionId,
                roomId,
                clientMutationId,
                exception);
        try {
            sendMutationResult(
                    userId,
                    connectionId,
                    commandType,
                    clientMutationId,
                    "FAILED",
                    ChatCommandFailedCode.INTERNAL_ERROR.name(),
                    true,
                    null,
                    null);
        } catch (RuntimeException sendFailure) {
            log.error(
                    "Failed to send mutation INTERNAL_ERROR result: connectionId={}",
                    connectionId,
                    sendFailure);
        }
    }

    private void sendMutationResult(
            String userId,
            String connectionId,
            MessageMutationCommandType commandType,
            String clientMutationId,
            String status,
            String code,
            boolean retryable,
            Long retryAfterMs,
            String messageId
    ) {
        resultSender.send(
                userId,
                connectionId,
                new ChatMessageMutationCommandResult(
                        commandType,
                        clientMutationId,
                        status,
                        code,
                        retryable,
                        retryAfterMs,
                        messageId,
                        null,
                        null,
                        null,
                        false));
    }

    private void reject(
            String userId,
            String connectionId,
            String clientMessageId,
            ChatCommandRejectedCode code,
            boolean retryable,
            Long retryAfterMs
    ) {
        resultSender.send(
                userId,
                connectionId,
                new ChatCommandRejected(
                        clientMessageId, code, retryable, retryAfterMs));
    }

    private void fail(
            String userId,
            String connectionId,
            String clientMessageId,
            ChatCommandFailedCode code,
            boolean retryable
    ) {
        resultSender.send(
                userId,
                connectionId,
                new ChatCommandFailed(
                        clientMessageId, code, retryable, null));
    }
}
