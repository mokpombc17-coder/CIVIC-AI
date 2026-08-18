package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TaskAdminControllerTest {

    private final TaskAdministrationService administration =
            mock(TaskAdministrationService.class);
    private final AdminTaskQueryService queries =
            mock(AdminTaskQueryService.class);
    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final Authentication authentication = mock(Authentication.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("admin-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskAdminController(
                                administration, queries, userIds))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void createsDraftWithAuthenticatedActorAndTypedContent()
            throws Exception {
        Task task = draftTask();
        when(administration.createDraft(any(), any())).thenReturn(task);

        mockMvc.perform(post("/api/v1/admin/tasks")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "테스트 과업",
                                  "description": "설명",
                                  "questions": [{
                                    "displayOrder": 1,
                                    "type": "SHORT_TEXT",
                                    "content": "의견을 입력하세요",
                                    "constraint": {"maxLength": 200},
                                    "options": []
                                  }]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/admin/tasks/" + task.id().value()))
                .andExpect(jsonPath("$.id")
                        .value(task.id().value().toString()))
                .andExpect(jsonPath("$.questions[0].type")
                        .value("SINGLE_CHOICE"));

        verify(administration).createDraft(any(), eq(actorId()));
    }

    @Test
    void adminDetailNotFoundUsesStableProblemCode() throws Exception {
        when(queries.findById(eq(taskId()))).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/admin/tasks/{taskId}",
                        taskId().value()).principal(authentication)
                        .header("X-Trace-Id", "admin-trace-1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"))
                .andExpect(jsonPath("$.traceId")
                        .value("admin-trace-1"));
    }

    @Test
    void lifecycleConflictKeepsDomainErrorCode() throws Exception {
        when(administration.closeEarly(
                any(TaskId.class), any(), any(TaskActorId.class)))
                .thenThrow(TaskDomainException.invariant(
                        "TASK_CLOSE_NOT_ALLOWED",
                        "task.status",
                        "only an open task can be closed"));

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/close",
                        taskId().value()).principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"운영 종료\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("TASK_CLOSE_NOT_ALLOWED"))
                .andExpect(jsonPath("$.violations[0].path")
                        .value("task.status"));
    }
}
