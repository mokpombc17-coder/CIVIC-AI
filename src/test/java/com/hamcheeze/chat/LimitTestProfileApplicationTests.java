package com.hamcheeze.chat;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import com.hamcheeze.chat.websocket.health.RoomAuthorizationHealthIndicator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("limit-test")
class LimitTestProfileApplicationTests {

    @Autowired
    private ChatMessagePipeline pipeline;

    @Autowired
    private RoomAuthorizationService authorizationService;

    @Autowired
    private ChatPipelineHealthIndicator pipelineHealth;

    @Autowired
    private RoomAuthorizationHealthIndicator authorizationHealth;

    @Test
    void exposesAvailableLimitTestAdapters() {
        assertThat(pipeline.availability())
                .isEqualTo(PipelineAvailability.AVAILABLE);
        assertThat(authorizationService.authorizeSubscription(
                "user-1", "test-room"))
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
        assertThat(authorizationService.authorizeMessageSend(
                "user-1", "not-allowed"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(pipelineHealth.health().getStatus()).isEqualTo(Status.UP);
        assertThat(authorizationHealth.health().getStatus()).isEqualTo(Status.UP);
    }
}
