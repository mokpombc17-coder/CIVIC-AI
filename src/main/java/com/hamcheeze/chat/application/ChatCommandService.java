package com.hamcheeze.chat.application;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionOutcome;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionReservation;
import com.hamcheeze.chat.websocket.ratelimit.ChatAdmissionLimiter;
import com.hamcheeze.chat.websocket.ratelimit.MessageTokenCostPolicy;
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

            RoomAuthorizationDecision authorization =
                    roomAuthorizationService.authorizeMessageSend(userId, roomId);
            if (authorization == RoomAuthorizationDecision.FORBIDDEN) {
                reject(
                        userId, connectionId, clientMessageId,
                        ChatCommandRejectedCode.ROOM_SEND_FORBIDDEN,
                        false, null);
                return;
            }
            if (authorization == RoomAuthorizationDecision.UNAVAILABLE) {
                fail(
                        userId, connectionId, clientMessageId,
                        ChatCommandFailedCode.ROOM_AUTHORIZATION_UNAVAILABLE,
                        true);
                return;
            }

            if (pipeline.availability() == PipelineAvailability.UNAVAILABLE) {
                fail(
                        userId, connectionId, clientMessageId,
                        ChatCommandFailedCode.CHAT_PIPELINE_UNAVAILABLE,
                        true);
                return;
            }

            int tokenCost = tokenCostPolicy.calculate(content.codePointCount());
            AdmittedChatCommand admittedCommand = new AdmittedChatCommand(
                    userId,
                    connectionId,
                    roomId,
                    clientMessageId,
                    content.normalizedContent());

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
