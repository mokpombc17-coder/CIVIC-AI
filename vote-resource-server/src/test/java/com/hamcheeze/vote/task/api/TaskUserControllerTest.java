package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
                                userIds, tasks, predictions,
                                predictionQueries),
                        new TaskSubmissionController(
                                userIds, submissions, submissionQueries))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
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
    void submissionDetailIsAlwaysScopedToJwtSubject() throws Exception {
        MyTaskSubmissionQueryService.MyTaskSubmission view =
                new MyTaskSubmissionQueryService.MyTaskSubmission(
                        submissionId(), taskId(), "테스트 과업", "설명",
                        personaGenerationId(), personaVersionId(),
                        predictionId(),
                        NOW.plusSeconds(30),
                        questionId(3), shortTextQuestion(),
                        new com.hamcheeze.vote.task.domain.common.TaskOptionId(
                                UUID.randomUUID()),
                        TaskReasonSource.USER_WRITTEN,
                        null,
                        "직접 작성한 이유");
        when(submissionQueries.findById(any(), any()))
                .thenReturn(Optional.of(view));

        mockMvc.perform(get("/api/v1/me/submissions/{submissionId}",
                        submissionId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$.personaVersionId")
                        .value(personaVersionId().value().toString()))
                .andExpect(jsonPath("$.reasonSource")
                        .value("USER_WRITTEN"))
                .andExpect(jsonPath("$.finalReason")
                        .value("직접 작성한 이유"));

        verify(submissionQueries).findById(
                eq(new TaskUserId("user-a")),
                eq(new TaskSubmissionId(submissionId().value())));
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
