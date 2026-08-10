package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.search.ChatMessageSearchRateLimitDecision;
import com.hamcheeze.chat.message.search.ChatMessageSearchRateLimiter;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@Import(ChatMessageSearchRateLimitApiIntegrationTest.Config.class)
class ChatMessageSearchRateLimitApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsRetryable429WithRetryAfterHint() throws Exception {
        mockMvc.perform(post(
                                "/api/v1/rooms/room-1/messages/search")
                        .with(SecurityMockMvcRequestPostProcessors.jwt()
                                .jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"valid query","limit":20}
                                """))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code")
                        .value("MESSAGE_SEARCH_RATE_LIMITED"))
                .andExpect(jsonPath("$.retryable").value(true))
                .andExpect(jsonPath("$.retryAfterMs").value(250));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {

        @Bean
        @Primary
        ChatMessageSearchRateLimiter rejectingSearchRateLimiter() {
            return ignored ->
                    ChatMessageSearchRateLimitDecision.reject(250);
        }
    }
}
