package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailableItem;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailablePage;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Execution;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OpinionMapGenerationAdminControllerTest {

    private static final UUID TASK_UUID = new UUID(0, 20);
    private static final TaskId TASK_ID = new TaskId(TASK_UUID);
    private static final Instant NOW =
            Instant.parse("2026-09-11T05:00:00Z");

    private final OpinionMapGenerationAdminService commands =
            mock(OpinionMapGenerationAdminService.class);
    private final OpinionMapGenerationAdminQueryService queries =
            mock(OpinionMapGenerationAdminQueryService.class);
    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final Authentication authentication = mock(Authentication.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("admin-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new OpinionMapGenerationAdminController(
                                commands, queries, userIds))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void manuallyRetriesGeneration() throws Exception {
        OpinionMapGeneration generation = pending();
        when(commands.request(eq(TASK_ID), eq("admin-a")))
                .thenReturn(new Execution(
                        generation,
                        OpinionMapGenerationAdminService.Action.RETRIED));

        mockMvc.perform(post(
                        "/api/v1/admin/tasks/{taskId}/opinion-map-generation",
                        TASK_UUID).principal(authentication))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.taskId")
                        .value(TASK_UUID.toString()))
                .andExpect(jsonPath("$.resultVersion").value(1))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.attemptCount").value(0))
                .andExpect(jsonPath("$.action").value("RETRIED"));
    }

    @Test
    void listsUnavailableGenerations() throws Exception {
        when(queries.findUnavailable(null, 20)).thenReturn(
                new UnavailablePage(
                        List.of(new UnavailableItem(
                                TASK_ID,
                                "생활 개선 과업",
                                1,
                                3,
                                "OPINION_MAP_OPENROUTER_TIMEOUT",
                                NOW,
                                true)),
                        "next-page"));

        mockMvc.perform(get(
                        "/api/v1/admin/opinion-map-generations/unavailable"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].taskId")
                        .value(TASK_UUID.toString()))
                .andExpect(jsonPath("$.items[0].taskTitle")
                        .value("생활 개선 과업"))
                .andExpect(jsonPath("$.items[0].attemptCount").value(3))
                .andExpect(jsonPath("$.items[0].lastErrorCode")
                        .value("OPINION_MAP_OPENROUTER_TIMEOUT"))
                .andExpect(jsonPath("$.items[0].canRetry").value(true))
                .andExpect(jsonPath("$.nextCursor").value("next-page"));
    }

    private static OpinionMapGeneration pending() {
        return OpinionMapGeneration.pending(
                new OpinionMapGenerationId(new UUID(0, 21)),
                TASK_ID,
                1,
                "a".repeat(64),
                "task-result-prompt/v1",
                NOW);
    }
}
