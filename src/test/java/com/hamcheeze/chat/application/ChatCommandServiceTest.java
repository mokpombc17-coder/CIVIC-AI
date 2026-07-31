package com.hamcheeze.chat.application;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.AdmittedEditMessageCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionOutcome;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionReservation;
import com.hamcheeze.chat.websocket.ratelimit.ChatAdmissionLimiter;
import com.hamcheeze.chat.websocket.ratelimit.ConfiguredMessageTokenCostPolicy;
import com.hamcheeze.chat.websocket.ratelimit.MessageTokenCostPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ChatCommandServiceTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440000";

    private final ActiveConnectionRegistry activeConnections =
            mock(ActiveConnectionRegistry.class);
    private final RoomAuthorizationService authorization =
            mock(RoomAuthorizationService.class);
    private final ChatMessagePipeline pipeline =
            mock(ChatMessagePipeline.class);
    private final ChatAdmissionLimiter limiter =
            mock(ChatAdmissionLimiter.class);
    private final ChatCommandResultSender resultSender =
            mock(ChatCommandResultSender.class);

    private ChatCommandService service;

    @BeforeEach
    void setUp() {
        ChatCommandValidator validator =
                new ChatCommandValidator(new ChatContentProperties());
        MessageTokenCostPolicy costPolicy =
                new ConfiguredMessageTokenCostPolicy(
                        new ChatAdmissionProperties());
        service = new ChatCommandService(
                activeConnections,
                validator,
                authorization,
                pipeline,
                costPolicy,
                limiter,
                resultSender);
        when(activeConnections.isActive("user-1", "connection-1"))
                .thenReturn(true);
    }

    @Test
    void unavailablePipelineDoesNotReserveCapacity() {
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.UNAVAILABLE);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));

        verifyNoInteractions(limiter);
        ChatCommandResult result = capturedResult();
        assertThat(result).isEqualTo(new ChatCommandFailed(
                CLIENT_MESSAGE_ID,
                ChatCommandFailedCode.CHAT_PIPELINE_UNAVAILABLE,
                true,
                null));
    }

    @Test
    void finalRoomAuthorizationUnavailableRollsBackReservation() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.UNAVAILABLE);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1))
                .thenReturn(reservation);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));

        verify(pipeline, never()).tryAccept(any());
        verify(reservation, never()).commit();
        verify(reservation).close();
        assertThat(capturedResult()).isEqualTo(new ChatCommandFailed(
                CLIENT_MESSAGE_ID,
                ChatCommandFailedCode.ROOM_AUTHORIZATION_UNAVAILABLE,
                true,
                null));
    }

    @Test
    void acceptedForProcessingCommitsWithoutFinalAcceptedResult() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any()))
                .thenReturn(PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "  hello  "));

        ArgumentCaptor<AdmittedChatCommand> command =
                ArgumentCaptor.forClass(AdmittedChatCommand.class);
        verify(pipeline).tryAccept(command.capture());
        assertThat(command.getValue().content()).isEqualTo("hello");
        assertThat(command.getValue().clientMessageId())
                .isEqualTo(CLIENT_MESSAGE_ID);
        verify(reservation).commit();
        verify(reservation).close();
        verifyNoInteractions(resultSender);
    }

    @Test
    void busyPipelineRollsBackAndReturnsServerBusy() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any())).thenReturn(PipelineAcceptance.BUSY);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));

        verify(reservation, never()).commit();
        verify(reservation).close();
        assertThat(capturedResult()).isEqualTo(new ChatCommandRejected(
                CLIENT_MESSAGE_ID,
                ChatCommandRejectedCode.SERVER_BUSY,
                true,
                null));
    }

    @Test
    void pipelineBecomingUnavailableAfterReserveRollsBack() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any()))
                .thenReturn(PipelineAcceptance.UNAVAILABLE);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));

        verify(reservation, never()).commit();
        verify(reservation).close();
        assertThat(capturedResult()).isEqualTo(new ChatCommandFailed(
                CLIENT_MESSAGE_ID,
                ChatCommandFailedCode.CHAT_PIPELINE_UNAVAILABLE,
                true,
                null));
    }

    @Test
    void unexpectedPipelineErrorRollsBackAndReturnsInternalError() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any()))
                .thenThrow(new IllegalStateException("unexpected"));

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));

        verify(reservation).close();
        assertThat(capturedResult()).isEqualTo(new ChatCommandFailed(
                CLIENT_MESSAGE_ID,
                ChatCommandFailedCode.INTERNAL_ERROR,
                true,
                null));
    }

    @Test
    void invalidClientMessageIdUsesNullEnvelopeCorrelation() {
        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand("bad id", "hello"));

        assertThat(capturedResult()).isEqualTo(new ChatCommandRejected(
                null,
                ChatCommandRejectedCode.INVALID_CLIENT_MESSAGE_ID,
                false,
                null));
        verifyNoInteractions(authorization, pipeline, limiter);
    }

    @Test
    void canonicalizesUppercaseClientMessageIdBeforeAdmission() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any()))
                .thenReturn(PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

        service.handle(
                "user-1",
                "connection-1",
                "room-1",
                new ChatSendCommand(
                        CLIENT_MESSAGE_ID.toUpperCase(),
                        "hello"));

        ArgumentCaptor<AdmittedChatCommand> command =
                ArgumentCaptor.forClass(AdmittedChatCommand.class);
        verify(pipeline).tryAccept(command.capture());
        assertThat(command.getValue().clientMessageId())
                .isEqualTo(CLIENT_MESSAGE_ID);
    }

    @Test
    void editUsesSameAuthorizationRateLimitAndPipeline() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);
        when(pipeline.tryAccept(any()))
                .thenReturn(PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

        service.handleEdit(
                "user-1",
                "connection-1",
                "room-1",
                new ChatEditCommand(
                        CLIENT_MESSAGE_ID,
                        "message-1",
                        "  edited  "));

        ArgumentCaptor<AdmittedEditMessageCommand> command =
                ArgumentCaptor.forClass(
                        AdmittedEditMessageCommand.class);
        verify(pipeline).tryAccept(command.capture());
        assertThat(command.getValue().clientMutationId())
                .isEqualTo(CLIENT_MESSAGE_ID);
        assertThat(command.getValue().messageId())
                .isEqualTo("message-1");
        assertThat(command.getValue().content())
                .isEqualTo("edited");
        verify(reservation).commit();
        verify(reservation).close();
        verifyNoInteractions(resultSender);
    }

    @Test
    void deleteAuthorizationUnavailableFailsClosed() {
        AdmissionReservation reservation = grantedReservation();
        when(authorization.authorizeMessageSend("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.UNAVAILABLE);
        when(pipeline.availability())
                .thenReturn(PipelineAvailability.AVAILABLE);
        when(limiter.tryReserve("user-1", 1)).thenReturn(reservation);

        service.handleDelete(
                "user-1",
                "connection-1",
                "room-1",
                new ChatDeleteCommand(
                        CLIENT_MESSAGE_ID,
                        "message-1"));

        assertThat(capturedResult()).isEqualTo(
                new ChatMessageMutationCommandResult(
                        com.hamcheeze.chat.message
                                .MessageMutationCommandType
                                .DELETE_MESSAGE,
                        CLIENT_MESSAGE_ID,
                        "FAILED",
                        "ROOM_AUTHORIZATION_UNAVAILABLE",
                        true,
                        null,
                        "message-1",
                        null,
                        null,
                        null,
                        false));
        verify(pipeline, never()).tryAccept(any());
        verify(reservation, never()).commit();
        verify(reservation).close();
    }

    private AdmissionReservation grantedReservation() {
        AdmissionReservation reservation =
                mock(AdmissionReservation.class);
        when(reservation.granted()).thenReturn(true);
        when(reservation.outcome()).thenReturn(AdmissionOutcome.GRANTED);
        return reservation;
    }

    private ChatCommandResult capturedResult() {
        ArgumentCaptor<ChatCommandResult> result =
                ArgumentCaptor.forClass(ChatCommandResult.class);
        verify(resultSender).send(
                eq("user-1"), eq("connection-1"), result.capture());
        return result.getValue();
    }
}
