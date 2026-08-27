package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.query.CompletedTaskQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaGenerationId;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaVersionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.predictionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.shortTextQuestion;
import static com.hamcheeze.vote.task.TaskTestFixtures.submissionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
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

class TaskUserControllerTest {

    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final UserTaskQueryService tasks =
            mock(UserTaskQueryService.class);
    private final CompletedTaskQueryService completedTasks =
            mock(CompletedTaskQueryService.class);
    private final MyTaskResultQueryService taskResults =
            mock(MyTaskResultQueryService.class);
    private final TaskPredictionService predictions =
            mock(TaskPredictionService.class);
    private final TaskPredictionQueryService predictionQueries =
            mock(TaskPredictionQueryService.class);
    private final TaskSubmissionService submissions =
            mock(TaskSubmissionService.class);
    private final MyTaskSubmissionQueryService submissionQueries =
            mock(MyTaskSubmissionQueryService.class);
    private final Authentication authentication = mock(Authentication.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("user-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskUserController(
                                userIds, tasks, completedTasks, taskResults,
                                predictions, predictionQueries),
                        new TaskSubmissionController(
                                userIds, submissions, submissionQueries))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void participantResultMatchesContractAndUsesPrivateCache()
            throws Exception {
        when(taskResults.findByTask(any(), any()))
                .thenReturn(Optional.of(myTaskResult()));

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}/result",
                        taskId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "private, no-cache"))
                .andExpect(jsonPath("$.taskId")
                        .value(taskId().value().toString()))
                .andExpect(jsonPath("$.title").value("결과 Task"))
                .andExpect(jsonPath("$.description").value("결과 설명"))
                .andExpect(jsonPath("$.closedAt").value(NOW.toString()))
                .andExpect(jsonPath("$.closureType")
                        .value("DEADLINE_REACHED"))
                .andExpect(jsonPath("$.resultVersion").value(1))
                .andExpect(jsonPath("$.finalizedAt")
                        .value(NOW.plusSeconds(10).toString()))
                .andExpect(jsonPath("$.responseCount").value(3))
                .andExpect(jsonPath("$.question.id")
                        .value(questionId(1).value().toString()))
                .andExpect(jsonPath("$.options[0].count").value(2))
                .andExpect(jsonPath("$.options[0].selectedByMe")
                        .value(false))
                .andExpect(jsonPath("$.options[1].selectedByMe")
                        .value(true))
                .andExpect(jsonPath("$.mySubmission.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$.mySubmission.selectedOptionId")
                        .value(resultOptionId(2).value().toString()))
                .andExpect(jsonPath("$.mySubmission.reasonSource")
                        .value("USER_WRITTEN"))
                .andExpect(jsonPath("$.mySubmission.finalReason")
                        .value("내 최종 이유"))
                .andExpect(jsonPath("$.schemaVersion").doesNotExist())
                .andExpect(jsonPath("$.percentage").doesNotExist())
                .andExpect(jsonPath("$.options[0].key").doesNotExist())
                .andExpect(jsonPath("$.options[0].reason").doesNotExist())
                .andExpect(jsonPath(
                        "$.mySubmission.personaGenerationId")
                        .doesNotExist())
                .andExpect(jsonPath("$.responses").doesNotExist());

        verify(taskResults).findByTask(eq(userId()), eq(taskId()));
    }

    @Test
    void unavailableParticipantResultUsesOnePrivacySafeNotFound()
            throws Exception {
        when(taskResults.findByTask(any(), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}/result",
                        taskId().value()).principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_NOT_FOUND"))
                .andExpect(jsonPath("$.detail")
                        .value("The task result is not available."))
                .andExpect(jsonPath("$.instance")
                        .value("/api/v1/me/tasks/"
                                + taskId().value() + "/result"));
    }

    @Test
    void participantResultIntegrityFailureRemainsServerError()
            throws Exception {
        when(taskResults.findByTask(any(), any()))
                .thenThrow(new TaskResultViewIntegrityException(
                        taskId(), "test mismatch"));

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}/result",
                        taskId().value()).principal(authentication))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code")
                        .value("TASK_RESULT_VIEW_INTEGRITY_FAILURE"));
    }

    @Test
    void completedTasksExposeOnlyTheFixedCardContract() throws Exception {
        CompletedTaskQueryService.CompletedTaskPage page =
                new CompletedTaskQueryService.CompletedTaskPage(
                        List.of(new CompletedTaskQueryService
                                .CompletedTaskSummary(
                                taskId(),
                                "완료 Task",
                                "완료 목록 설명",
                                NOW.minusSeconds(3600),
                                NOW,
                                TaskClosureType.DEADLINE_REACHED,
                                new CompletedTaskQueryService.MySubmission(
                                        submissionId(),
                                        NOW.minusSeconds(1800)))),
                        "next-cursor");
        when(completedTasks.findByUser(
                any(), eq("current-cursor"), eq(1)))
                .thenReturn(page);

        mockMvc.perform(get("/api/v1/me/tasks/completed")
                        .principal(authentication)
                        .queryParam("cursor", "current-cursor")
                        .queryParam("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].taskId")
                        .value(taskId().value().toString()))
                .andExpect(jsonPath("$.items[0].title")
                        .value("완료 Task"))
                .andExpect(jsonPath("$.items[0].description")
                        .value("완료 목록 설명"))
                .andExpect(jsonPath("$.items[0].openedAt")
                        .value(NOW.minusSeconds(3600).toString()))
                .andExpect(jsonPath("$.items[0].closedAt")
                        .value(NOW.toString()))
                .andExpect(jsonPath("$.items[0].closureType")
                        .value("DEADLINE_REACHED"))
                .andExpect(jsonPath(
                        "$.items[0].mySubmission.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath(
                        "$.items[0].mySubmission.submittedAt")
                        .value(NOW.minusSeconds(1800).toString()))
                .andExpect(jsonPath("$.items[0].responseCount")
                        .doesNotExist())
                .andExpect(jsonPath("$.nextCursor")
                        .value("next-cursor"));

        verify(completedTasks).findByUser(
                eq(userId()), eq("current-cursor"), eq(1));
    }

    @Test
    void completedTasksDefaultToTwentyAndReturnEmptyPage() throws Exception {
        when(completedTasks.findByUser(any(), eq(null), eq(20)))
                .thenReturn(new CompletedTaskQueryService.CompletedTaskPage(
                        List.of(), null));

        mockMvc.perform(get("/api/v1/me/tasks/completed")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.nextCursor").isEmpty());

        verify(completedTasks).findByUser(
                eq(userId()), eq(null), eq(20));
    }

    @Test
    void completedTasksMapInvalidPaginationToBadRequest()
            throws Exception {
        when(completedTasks.findByUser(any(), eq("invalid"), eq(101)))
                .thenThrow(new IllegalArgumentException("invalid page"));

        mockMvc.perform(get("/api/v1/me/tasks/completed")
                        .principal(authentication)
                        .queryParam("cursor", "invalid")
                        .queryParam("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void predictionEnsureUsesJwtSubjectAndReturnsCreated()
            throws Exception {
        TaskPrediction prediction = pendingPrediction();
        when(predictions.ensureTaskPrediction(any(), any()))
                .thenReturn(new EnsureTaskPredictionResult(
                        prediction, true, false, false));

        mockMvc.perform(post(
                        "/api/v1/me/tasks/{taskId}/prediction",
                        taskId().value()).principal(authentication))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/me/tasks/" + taskId().value()
                                + "/prediction"))
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.waiting").value(true))
                .andExpect(jsonPath("$.personaVersionId")
                        .value(personaVersionId().value().toString()))
                .andExpect(jsonPath("$.personaId").value("persona-a"));

        verify(predictions).ensureTaskPrediction(
                eq(userId()), eq(taskId()));
    }

    @Test
    void predictionStatusExposesExplicitWaitingState() throws Exception {
        TaskPredictionQueryService.TaskPredictionView view =
                new TaskPredictionQueryService.TaskPredictionView(
                        taskId(),
                        TaskPredictionQueryService.TaskPredictionViewState
                                .PENDING,
                        personaGenerationId(),
                        personaVersionId(),
                        new com.hamcheeze.vote.task.domain.common
                                .TaskPersonaId("persona-a"),
                        predictionId(),
                        com.hamcheeze.vote.task.domain.prediction
                                .TaskPredictionStatus.PENDING,
                        List.of(), true, false, false,
                        false, false, List.of(), null,
                        null, null, null);
        when(predictionQueries.findCurrent(any(), any())).thenReturn(view);

        mockMvc.perform(get(
                        "/api/v1/me/tasks/{taskId}/prediction",
                        taskId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("PENDING"))
                .andExpect(jsonPath("$.personaVersionId")
                        .value(personaVersionId().value().toString()))
                .andExpect(jsonPath("$.waiting").value(true))
                .andExpect(jsonPath("$.predictionRequestAllowed")
                        .value(false));
    }

    @Test
    void taskDetailDistinguishesUnpublishedTask() throws Exception {
        when(tasks.findOpenTask(any(), any())).thenReturn(Optional.empty());
        when(predictionQueries.findCurrent(any(), any())).thenReturn(
                unavailable(TaskPredictionQueryService
                        .TaskPredictionViewState.TASK_UNPUBLISHED));

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}", taskId().value())
                        .principal(authentication))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TASK_UNPUBLISHED"));
    }

    @Test
    void taskDetailDistinguishesClosedTask() throws Exception {
        when(tasks.findOpenTask(any(), any())).thenReturn(Optional.empty());
        when(predictionQueries.findCurrent(any(), any())).thenReturn(
                unavailable(TaskPredictionQueryService
                        .TaskPredictionViewState.TASK_CLOSED));

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}", taskId().value())
                        .principal(authentication))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TASK_CLOSED"));
    }

    @Test
    void submissionRequiresIdempotencyKey() throws Exception {
        mockMvc.perform(post(
                        "/api/v1/me/tasks/{taskId}/submission",
                        taskId().value()).principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submitBody()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void successfulSubmissionReturnsReceiptCompatibleResponse()
            throws Exception {
        TaskSubmissionOutcome outcome = new TaskSubmissionOutcome(
                201, "TASK_SUBMISSION_CREATED", taskId(),
                submissionId(), NOW.plusSeconds(30), List.of());
        when(submissions.submit(any(), eq("request-key"), any()))
                .thenReturn(new TaskSubmissionService.SubmissionExecution(
                        outcome, true));

        mockMvc.perform(post(
                        "/api/v1/me/tasks/{taskId}/submission",
                        taskId().value()).principal(authentication)
                        .header("Idempotency-Key", "request-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submitBody()))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/me/submissions/"
                                + submissionId().value()))
                .andExpect(jsonPath("$.code")
                        .value("TASK_SUBMISSION_CREATED"))
                .andExpect(jsonPath("$.replayed").value(true));

        verify(submissions).submit(
                eq(userId()), eq("request-key"), any());
    }

    @Test
    void rejectedCandidateKeepsStatusCodeViolationsAndTraceId()
            throws Exception {
        TaskSubmissionOutcome outcome = TaskSubmissionOutcome.rejected(
                422, "TASK_PREDICTION_CANDIDATE_INVALID", taskId(),
                List.of(TaskViolation.of(
                        "TASK_PREDICTION_CANDIDATE_INVALID",
                        "candidateId", "candidate is invalid")));
        when(submissions.submit(any(), any(), any()))
                .thenReturn(new TaskSubmissionService.SubmissionExecution(
                        outcome, false));

        mockMvc.perform(post(
                        "/api/v1/me/tasks/{taskId}/submission",
                        taskId().value()).principal(authentication)
                        .header("Idempotency-Key", "request-key")
                        .header("X-Trace-Id", "task-trace-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submitBody()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code")
                        .value("TASK_PREDICTION_CANDIDATE_INVALID"))
                .andExpect(jsonPath("$.violations[0].path")
                        .value("candidateId"))
                .andExpect(jsonPath("$.traceId")
                        .value("task-trace-1"));
    }

    @Test
    void directSubmissionWithoutPredictionIsNullSafeByTaskAndId()
            throws Exception {
        MyTaskSubmissionQueryService.MyTaskSubmission view =
                new MyTaskSubmissionQueryService.MyTaskSubmission(
                        submissionId(), taskId(), "테스트 과업", "설명",
                        personaGenerationId(), personaVersionId(),
                        null,
                        NOW.plusSeconds(30),
                        questionId(3), shortTextQuestion(),
                        new com.hamcheeze.vote.task.domain.common.TaskOptionId(
                                UUID.randomUUID()),
                        TaskReasonSource.USER_WRITTEN,
                        null,
                        "직접 작성한 이유");
        when(submissionQueries.findById(any(), any()))
                .thenReturn(Optional.of(view));
        when(submissionQueries.findByTask(any(), any()))
                .thenReturn(Optional.of(view));

        mockMvc.perform(get("/api/v1/me/submissions")
                        .param("taskId", taskId().value().toString())
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.predictionId").doesNotExist())
                .andExpect(jsonPath("$.reasonSource")
                        .value("USER_WRITTEN"))
                .andExpect(jsonPath("$.finalReason")
                        .value("직접 작성한 이유"));

        mockMvc.perform(get("/api/v1/me/submissions/{submissionId}",
                        submissionId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$.personaVersionId")
                        .value(personaVersionId().value().toString()))
                .andExpect(jsonPath("$.predictionId").doesNotExist())
                .andExpect(jsonPath("$.reasonSource")
                        .value("USER_WRITTEN"))
                .andExpect(jsonPath("$.finalReason")
                        .value("직접 작성한 이유"));

        verify(submissionQueries).findById(
                eq(new TaskUserId("user-a")),
                eq(new TaskSubmissionId(submissionId().value())));
    }

    private static MyTaskResultQueryService.MyTaskResult myTaskResult() {
        return new MyTaskResultQueryService.MyTaskResult(
                taskId(),
                "결과 Task",
                "결과 설명",
                NOW,
                TaskClosureType.DEADLINE_REACHED,
                1,
                NOW.plusSeconds(10),
                3,
                new MyTaskResultQueryService.ResultQuestion(
                        questionId(1), "선호 질문", null),
                List.of(
                        new MyTaskResultQueryService.ResultOption(
                                resultOptionId(1), 1, "첫 번째", 2, false),
                        new MyTaskResultQueryService.ResultOption(
                                resultOptionId(2), 2, "두 번째", 1, true)),
                new MyTaskResultQueryService.ResultSubmission(
                        submissionId(),
                        resultOptionId(2),
                        TaskReasonSource.USER_WRITTEN,
                        "내 최종 이유",
                        NOW.minusSeconds(600)));
    }

    private static TaskOptionId resultOptionId(long value) {
        return new TaskOptionId(new UUID(100, value));
    }

    private static String submitBody() {
        return """
                {
                  "personaGenerationId": "%s",
                  "personaVersionId": "%s",
                  "predictionId": "%s",
                  "questionId": "%s",
                  "selectedOptionId": "%s",
                  "reasonSource": "USER_WRITTEN",
                  "reason": "직접 작성한 이유"
                }
                """.formatted(
                        personaGenerationId().value(),
                        personaVersionId().value(),
                        predictionId().value(), questionId(3).value(),
                        UUID.randomUUID());
    }

    private static TaskPredictionQueryService.TaskPredictionView unavailable(
            TaskPredictionQueryService.TaskPredictionViewState state
    ) {
        return new TaskPredictionQueryService.TaskPredictionView(
                taskId(), state, null, null, null, null, null,
                List.of(), false, false, false, false, false,
                List.of(), null, null, null, null);
    }
}
