package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.application.task.TaskLifecycleChange;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.time.Instant;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
    void createsDraftWithAuthenticatedActorAndSingleQuestionContent()
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
                                  "question": {
                                    "content": "하나를 선택하세요",
                                    "options": [
                                      {"content": "A"},
                                      {"content": "B"}
                                    ]
                                  }
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/admin/tasks/" + task.id().value()))
                .andExpect(jsonPath("$.id")
                        .value(task.id().value().toString()))
                .andExpect(jsonPath("$.question.content")
                        .value("하나를 선택하세요"))
                .andExpect(jsonPath("$.question.options[0].displayOrder")
                        .value(1))
                .andExpect(jsonPath("$.question.type").doesNotExist())
                .andExpect(jsonPath("$.questions").doesNotExist());

        ArgumentCaptor<TaskAdministrationService.CreateDraftCommand> command =
                ArgumentCaptor.forClass(
                        TaskAdministrationService.CreateDraftCommand.class);
        verify(administration).createDraft(command.capture(), eq(actorId()));
        assertThat(command.getValue().question().type())
                .isEqualTo(TaskQuestionType.SINGLE_CHOICE);
        assertThat(command.getValue().question().displayOrder()).isEqualTo(1);
        assertThat(command.getValue().question().options())
                .extracting(option -> option.kind())
                .containsOnly(TaskOptionKind.STANDARD);
        assertThat(command.getValue().question().options())
                .extracting(option -> option.displayOrder())
                .containsExactly(1, 2);
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

    @Test
    void beanValidationReturnsFieldViolationsAsUnprocessableEntity()
            throws Exception {
        mockMvc.perform(post("/api/v1/admin/tasks")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": " ",
                                  "question": {
                                    "content": " ",
                                    "options": [
                                      {"content": " "}
                                    ]
                                  }
                                }
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code")
                        .value("TASK_VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[*].code")
                        .value(containsInAnyOrder(
                                "TASK_FIELD_INVALID",
                                "TASK_FIELD_INVALID",
                                "TASK_FIELD_INVALID")))
                .andExpect(jsonPath("$.violations[*].path")
                        .value(containsInAnyOrder(
                                "title",
                                "question.content",
                                "question.options[0].content")));

        mockMvc.perform(post(
                        "/api/v1/admin/tasks/{taskId}/schedule",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"예약\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code")
                        .value("TASK_VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[*].path")
                        .value(containsInAnyOrder(
                                "opensAt",
                                "closesAt")));
    }

    @Test
    void malformedJsonRemainsBadRequestWithoutFieldViolations()
            throws Exception {
        mockMvc.perform(post("/api/v1/admin/tasks")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.violations").doesNotExist());
    }

    @Test
    void replacesListsAndReturnsTaskDetailWithLifecycleHistory()
            throws Exception {
        Task task = draftTask();
        when(administration.replaceDraft(any(), any(), any()))
                .thenReturn(task);
        when(queries.findAll()).thenReturn(List.of(
                new AdminTaskQueryService.AdminTaskSummary(
                        task.id(), task.title(), task.status(),
                        task.schedule(), task.publishedAt(), task.openedAt(),
                        task.closedAt(), task.closureType(), task.createdAt(),
                        task.updatedAt())));
        when(queries.findById(task.id())).thenReturn(Optional.of(
                new AdminTaskQueryService.AdminTaskDetail(task, List.of())));

        mockMvc.perform(put("/api/v1/admin/tasks/{taskId}",
                        task.id().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title":"수정된 과업",
                                  "description":"수정 설명",
                                  "question":{
                                    "content":"수정 질문",
                                    "options":[
                                      {"content":"찬성"},
                                      {"content":"반대"}
                                    ]
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id")
                        .value(task.id().value().toString()));

        ArgumentCaptor<TaskAdministrationService.ReplaceDraftCommand>
                replaceCommand = ArgumentCaptor.forClass(
                        TaskAdministrationService.ReplaceDraftCommand.class);
        verify(administration).replaceDraft(
                eq(task.id()), replaceCommand.capture(), eq(actorId()));
        assertThat(replaceCommand.getValue().title())
                .isEqualTo("수정된 과업");
        assertThat(replaceCommand.getValue().question().content())
                .isEqualTo("수정 질문");
        assertThat(replaceCommand.getValue().question().options())
                .extracting(option -> option.displayOrder())
                .containsExactly(1, 2);

        mockMvc.perform(get("/api/v1/admin/tasks")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].taskId")
                        .value(task.id().value().toString()))
                .andExpect(jsonPath("$[0].status").value("DRAFT"));

        mockMvc.perform(get("/api/v1/admin/tasks/{taskId}",
                        task.id().value())
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.id")
                        .value(task.id().value().toString()))
                .andExpect(jsonPath("$.lifecycleHistory.length()")
                        .value(0));
    }

    @Test
    void mapsEveryLifecycleEndpointToItsAdministrationCommand()
            throws Exception {
        TaskLifecycleChange change = scheduledChange();
        when(administration.schedule(any(), any(), any(), any()))
                .thenReturn(change);
        when(administration.reschedule(any(), any(), any(), any()))
                .thenReturn(change);
        when(administration.openImmediately(any(), any(), any(), any()))
                .thenReturn(change);
        when(administration.openScheduledNow(any(), any(), any()))
                .thenReturn(change);
        when(administration.changeDeadline(any(), any(), any(), any()))
                .thenReturn(change);
        when(administration.closeEarly(any(), any(), any()))
                .thenReturn(change);
        when(administration.cancel(any(), any(), any()))
                .thenReturn(change);

        Instant opensAt = Instant.parse("2026-02-01T00:00:00Z");
        Instant closesAt = Instant.parse("2026-02-02T00:00:00Z");
        Instant changedClosesAt = Instant.parse("2026-02-03T00:00:00Z");

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/schedule",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "opensAt":"2026-02-01T00:00:00Z",
                                  "closesAt":"2026-02-02T00:00:00Z",
                                  "reason":"예약"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id")
                        .value(taskId().value().toString()));
        verify(administration).schedule(
                eq(taskId()),
                eq(new TaskSchedule(opensAt, closesAt)),
                eq("예약"),
                eq(actorId()));

        mockMvc.perform(put("/api/v1/admin/tasks/{taskId}/schedule",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "opensAt":"2026-02-01T00:00:00Z",
                                  "closesAt":"2026-02-03T00:00:00Z",
                                  "reason":"예약 변경"
                                }
                                """))
                .andExpect(status().isOk());
        verify(administration).reschedule(
                eq(taskId()),
                eq(new TaskSchedule(opensAt, changedClosesAt)),
                eq("예약 변경"),
                eq(actorId()));

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/open-now",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "closesAt":"2026-02-02T00:00:00Z",
                                  "reason":"즉시 발행"
                                }
                                """))
                .andExpect(status().isOk());
        verify(administration).openImmediately(
                eq(taskId()), eq(closesAt), eq("즉시 발행"), eq(actorId()));

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/start-now",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"즉시 시작\"}"))
                .andExpect(status().isOk());
        verify(administration).openScheduledNow(
                eq(taskId()), eq("즉시 시작"), eq(actorId()));

        mockMvc.perform(put("/api/v1/admin/tasks/{taskId}/deadline",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "closesAt":"2026-02-03T00:00:00Z",
                                  "reason":"마감 변경"
                                }
                                """))
                .andExpect(status().isOk());
        verify(administration).changeDeadline(
                eq(taskId()), eq(changedClosesAt),
                eq("마감 변경"), eq(actorId()));

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/close",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"조기 종료\"}"))
                .andExpect(status().isOk());
        verify(administration).closeEarly(
                eq(taskId()), eq("조기 종료"), eq(actorId()));

        mockMvc.perform(post("/api/v1/admin/tasks/{taskId}/cancel",
                        taskId().value())
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"취소\"}"))
                .andExpect(status().isOk());
        verify(administration).cancel(
                eq(taskId()), eq("취소"), eq(actorId()));
    }

    private static TaskLifecycleChange scheduledChange() {
        Task task = draftTask();
        TaskSchedule schedule = new TaskSchedule(
                NOW.plusSeconds(60), NOW.plusSeconds(3_600));
        return new TaskLifecycleChange(
                task,
                task.schedule(
                        historyId(1), schedule, actorId(),
                        "fixture schedule", NOW.plusSeconds(1)));
    }
}
