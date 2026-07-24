package com.hamcheeze.chat.websocket.protocol;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

@Component
public final class ChatStompErrorHandler
        extends StompSubProtocolErrorHandler {

    private static final Logger log =
            LoggerFactory.getLogger(ChatStompErrorHandler.class);

    @Override
    public Message<byte[]> handleClientMessageProcessingError(
            Message<byte[]> clientMessage,
            Throwable exception
    ) {
        StompPolicyException policyException =
                findPolicyException(exception);
        if (policyException != null) {
            log.info(
                    "STOMP client message rejected: code={}",
                    policyException.code());
        } else {
            log.error(
                    "STOMP client message processing failed",
                    exception);
        }
        return super.handleClientMessageProcessingError(
                clientMessage,
                exception);
    }

    private static StompPolicyException findPolicyException(
            Throwable exception
    ) {
        Throwable current = exception;
        while (current != null) {
            if (current instanceof StompPolicyException policyException) {
                return policyException;
            }
            if (current.getCause() == current) {
                return null;
            }
            current = current.getCause();
        }
        return null;
    }
}
