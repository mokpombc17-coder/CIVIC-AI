package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RoomApiFailureIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static JwtRequestPostProcessor jwt() {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .authorities(
                        new SimpleGrantedAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_READ)),
                        new SimpleGrantedAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_WRITE)));
    }

    @jakarta.annotation.Resource
    private MockMvc mockMvc;

    @MockitoSpyBean
    private RoomCommandService commandService;

    @Test
    void mapsInfrastructureFailuresWithoutLeakingInternals()
            throws Exception {
        assertFailure(
                RoomCommandFailureKind.TRANSIENT,
                503,
                true);
        assertFailure(
                RoomCommandFailureKind
                        .CONCURRENCY_RETRY_EXHAUSTED,
                503,
                true);
        assertFailure(
                RoomCommandFailureKind.OUTCOME_UNKNOWN,
                503,
                true);
        assertFailure(
                RoomCommandFailureKind.ACCESS_REVOCATION_FAILED,
                503,
                true);
        assertFailure(
                RoomCommandFailureKind.DATA_INTEGRITY,
                500,
                false);
        assertFailure(
                RoomCommandFailureKind.PERMANENT,
                500,
                false);
    }

    private void assertFailure(
            RoomCommandFailureKind kind,
            int status,
            boolean retryable
    ) throws Exception {
        reset(commandService);
        doThrow(new RoomCommandExecutionException(
                kind,
                "chat_rooms MongoException secret internal detail",
                new IllegalStateException("internal stack")))
                .when(commandService)
                .createRoom(any(CreateRoomCommand.class));

        var result = mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().is(status))
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code")
                        .value(kind.name()))
                .andExpect(jsonPath("$.retryable")
                        .value(retryable))
                .andReturn();

        String body = result.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain(
                        "chat_rooms",
                        "MongoException",
                        "internal stack");
        if (kind == RoomCommandFailureKind.OUTCOME_UNKNOWN
                || kind == RoomCommandFailureKind
                .ACCESS_REVOCATION_FAILED) {
            org.assertj.core.api.Assertions.assertThat(body)
                    .contains("same Idempotency-Key");
        }
    }
}
