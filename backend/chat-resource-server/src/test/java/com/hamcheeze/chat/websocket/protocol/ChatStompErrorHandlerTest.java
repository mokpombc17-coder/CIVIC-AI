package com.hamcheeze.chat.websocket.protocol;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ChatStompErrorHandlerTest {

    private final ChatStompErrorHandler handler =
            new ChatStompErrorHandler();

    @Test
    void rendersAuthenticationRequiredAsStructuredStompError() {
        Message<byte[]> result =
                handler.handleClientMessageProcessingError(
                        null,
                        new RuntimeException(new StompPolicyException(
                                "AUTHENTICATION_REQUIRED")));
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);

        assertThat(accessor.getCommand()).isEqualTo(StompCommand.ERROR);
        assertThat(accessor.getMessage())
                .isEqualTo("AUTHENTICATION_REQUIRED");
        assertThat(accessor.getContentType())
                .isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(new String(
                result.getPayload(),
                StandardCharsets.UTF_8))
                .isEqualTo("{\"code\":\"AUTHENTICATION_REQUIRED\","
                        + "\"retryable\":false}");
    }

    @Test
    void keepsExistingDefaultErrorContractForOtherPolicyFailures() {
        Message<byte[]> result =
                handler.handleClientMessageProcessingError(
                        null,
                        new StompPolicyException("FORBIDDEN"));
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);

        assertThat(accessor.getCommand()).isEqualTo(StompCommand.ERROR);
        assertThat(accessor.getMessage())
                .isNotEqualTo("AUTHENTICATION_REQUIRED");
        assertThat(new String(
                result.getPayload(),
                StandardCharsets.UTF_8))
                .doesNotContain("AUTHENTICATION_REQUIRED");
    }
}
