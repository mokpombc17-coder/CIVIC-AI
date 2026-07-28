package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RoomHttpSecurityTest extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void roomApiRequiresBearerJwtAndAcceptsJwtSubject()
            throws Exception {
        mockMvc.perform(post("/api/v1/rooms")
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("jwt-user")))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerUserId")
                        .value("jwt-user"));
        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject(" ")))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));
    }

    @Test
    void healthAndWebSocketHandshakeRemainPermitAll()
            throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
        int status = mockMvc.perform(get("/ws"))
                .andReturn()
                .getResponse()
                .getStatus();
        assertThat(status).isNotEqualTo(401);
    }

    private String createBody() {
        return """
                {
                  "visibility":"LISTED",
                  "joinPolicy":"OPEN"
                }
                """;
    }
}
