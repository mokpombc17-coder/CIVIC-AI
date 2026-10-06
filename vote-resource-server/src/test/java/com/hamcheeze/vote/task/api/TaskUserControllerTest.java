package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.query.CompletedTaskQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskLifecycleStatus;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskResultStatus;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.TaskSearchCursorException;
import com.hamcheeze.vote.task.application.query.TaskSearchQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.result.MyTaskOpinionMap;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultViewIntegrityException;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionExecutionService;
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
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
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
import static com.hamcheeze.vote.task.TaskTestFixtures.predictionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.shortTextQuestion;
import static com.hamcheeze.vote.task.TaskTestFixtures.submissionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.hasKey;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
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
    private final ParticipatedTaskQueryService participatedTasks =
            mock(ParticipatedTaskQueryService.class);
    private final CompletedTaskQueryService completedTasks =
            mock(CompletedTaskQueryService.class);
    private final TaskSearchQueryService taskSearch =
            mock(TaskSearchQueryService.class);
    private final MyTaskResultQueryService taskResults =
            mock(MyTaskResultQueryService.class);
    private final TaskPredictionService predictions =
            mock(TaskPredictionService.class);
    private final TaskPredictionQueryService predictionQueries =
            mock(TaskPredictionQueryService.class);
    private final TaskSubmissionExecutionService submissions =
            mock(TaskSubmissionExecutionService.class);
    private final MyTaskSubmissionQueryService submissionQueries =
            mock(MyTaskSubmissionQueryService.class);
    private final Authentication authentication = mock(Authentication.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("user-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TaskUserController(
                                userIds, tasks, participatedTasks,
                                completedTasks, taskSearch, taskResults, predictions,
                                predictionQueries),
                        new TaskSubmissionController(
                                userIds, submissions, submissionQueries))
                .setControllerAdvice(new TaskApiExceptionHandler())
                .build();
    }

    @Test
    void searchReturnsUnifiedPrivateNoStorePage() throws Exception {
        TaskSearchQueryService.TaskSearchSummary open =
                new TaskSearchQueryService.TaskSearchSummary(
                        taskId(), "진행 중 투표", null, TaskStatus.OPEN,
                        NOW.minusSeconds(3600), NOW.plusSeconds(3600),
                        null, null, null, false);
        TaskSearchQueryService.TaskSearchSummary closed =
                new TaskSearchQueryService.TaskSearchSummary(
                        new TaskId(new UUID(31, 2)), "완료 투표", "완료 설명",
                        TaskStatus.CLOSED, NOW.minusSeconds(7200),
                        NOW.minusSeconds(3600), NOW.minusSeconds(1800),
                        TaskClosureType.DEADLINE_REACHED,
                        new TaskSearchQueryService.MySubmission(
                                submissionId(), NOW.minusSeconds(5400)),
                        true);
        when(taskSearch.findByUser(
                userId(), "교통", "current-cursor", 2))
                .thenReturn(new TaskSearchQueryService.TaskSearchPage(
                        List.of(open, closed), "next-cursor"));

        mockMvc.perform(get("/api/v1/me/tasks/search")
                        .principal(authentication)
                        .queryParam("query", "교통")
                        .queryParam("cursor", "current-cursor")
                        .queryParam("size", "2"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "private, no-store"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].taskStatus")
                        .value("OPEN"))
                .andExpect(jsonPath("$.items[0].description")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].mySubmission")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].resultAvailable")
                        .value(false))
                .andExpect(jsonPath("$.items[1].taskStatus")
                        .value("CLOSED"))
                .andExpect(jsonPath("$.items[1].closureType")
                        .value("DEADLINE_REACHED"))
                .andExpect(jsonPath("$.items[1].mySubmission.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$.items[1].resultAvailable")
                        .value(true))
                .andExpect(jsonPath("$.nextCursor")
                        .value("next-cursor"));

        verify(taskSearch).findByUser(
                userId(), "교통", "current-cursor", 2);
    }

    @Test
    void searchReturnsEmptyOkPageAndMapsCursorFailure() throws Exception {
        when(taskSearch.findByUser(userId(), "없음", null, 20))
                .thenReturn(new TaskSearchQueryService.TaskSearchPage(
                        List.of(), null));

        mockMvc.perform(get("/api/v1/me/tasks/search")
                        .principal(authentication)
                        .queryParam("query", "없음"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "private, no-store"))
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.nextCursor").isEmpty());

        when(taskSearch.findByUser(userId(), "검색", "invalid", 20))
                .thenThrow(new TaskSearchCursorException(
                        "task search cursor is invalid"));

        mockMvc.perform(get("/api/v1/me/tasks/search")
                        .principal(authentication)
                        .queryParam("query", "검색")
                        .queryParam("cursor", "invalid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void searchRequiresQuery() throws Exception {
        mockMvc.perform(get("/api/v1/me/tasks/search")
                        .principal(authentication))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void participatedTasksExposeIndependentStateAxesAndPrivateCache()
            throws Exception {
        ParticipatedTaskQueryService.ParticipatedTaskSummary item =
                new ParticipatedTaskQueryService.ParticipatedTaskSummary(
                        taskId(),
                        "참여한 과업",
                        "결과 확인 가능한 과업",
                        NOW.minusSeconds(3_600),
                        NOW.minusSeconds(60),
                        NOW.minusSeconds(59),
                        TaskClosureType.DEADLINE_REACHED,
                        ParticipatedTaskLifecycleStatus.CLOSED,
                        false,
                        new ParticipatedTaskQueryService.Participation(
                                ParticipatedTaskQueryService
                                        .ParticipationStatus.SUBMITTED,
                                submissionId(),
                                NOW.minusSeconds(600)),
                        new ParticipatedTaskQueryService.Result(
                                ParticipatedTaskResultStatus.AVAILABLE,
                                1,
                                NOW.minusSeconds(59),
                                true));
        when(participatedTasks.findByUser(
                new TaskUserId("user-a"), "환경", null, 10))
                .thenReturn(new ParticipatedTaskQueryService
                        .ParticipatedTaskPage(List.of(item), "next-cursor"));

        mockMvc.perform(get("/api/v1/me/tasks/participated")
                        .param("query", "환경")
                        .param("size", "10")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "private, no-cache"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].taskStatus")
                        .value("CLOSED"))
                .andExpect(jsonPath("$.items[0].canSubmit").value(false))
                .andExpect(jsonPath("$.items[0].participation.status")
                        .value("SUBMITTED"))
                .andExpect(jsonPath("$.items[0].participation.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$.items[0].result.status")
                        .value("AVAILABLE"))
                .andExpect(jsonPath("$.items[0].result.version").value(1))
                .andExpect(jsonPath("$.items[0].result.accessAllowed")
                        .value(true))
                .andExpect(jsonPath("$.nextCursor").value("next-cursor"));
    }

    @Test
    void openTasksExposeSubmittedAndNotSubmittedContract() throws Exception {
        TaskId availableTaskId = new TaskId(new UUID(11, 1));
        TaskId submittedTaskId = new TaskId(new UUID(11, 2));
        when(tasks.findOpenTasks(new TaskUserId("user-a"))).thenReturn(List.of(
                new UserTaskQueryService.UserTaskSummary(
                        availableTaskId,
                        "참여할 과업",
                        "아직 제출하지 않은 진행 중 과업",
                        NOW.minusSeconds(600),
                        NOW.plusSeconds(600),
                        new UserTaskQueryService.SubmissionState(
                                false, null, null)),
                new UserTaskQueryService.UserTaskSummary(
                        submittedTaskId,
                        "참여 완료한 진행 중 과업",
                        "제출 후에도 마감 전까지 목록에 유지되는 과업",
                        NOW.minusSeconds(600),
                        NOW.plusSeconds(1_200),
                        new UserTaskQueryService.SubmissionState(
                                true,
                                submissionId(),
                                NOW.minusSeconds(30)))));

        mockMvc.perform(get("/api/v1/me/tasks")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].taskId")
                        .value(availableTaskId.value().toString()))
                .andExpect(jsonPath("$[0].submission.submitted")
                        .value(false))
                .andExpect(jsonPath("$[0].submission.submissionId")
                        .doesNotExist())
                .andExpect(jsonPath("$[0].submission.submittedAt")
                        .doesNotExist())
                .andExpect(jsonPath("$[1].taskId")
                        .value(submittedTaskId.value().toString()))
                .andExpect(jsonPath("$[1].submission.submitted")
                        .value(true))
                .andExpect(jsonPath("$[1].submission.submissionId")
                        .value(submissionId().value().toString()))
                .andExpect(jsonPath("$[1].submission.submittedAt")
                        .value(NOW.minusSeconds(30).toString()));
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
                .andExpect(jsonPath("$.opinionMap.status")
                        .value("UNAVAILABLE"))
                .andExpect(jsonPath("$.opinionMap").value(allOf(
                        hasKey("sameChoice"),
                        hasKey("otherChoices"))))
                .andExpect(jsonPath("$.opinionMap.sameChoice")
                        .doesNotExist())
                .andExpect(jsonPath("$.opinionMap.otherChoices")
                        .doesNotExist())
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
    void participantResultExposesOnlySelectedOpinionMapAreas()
            throws Exception {
        MyTaskOpinionMap opinionMap = new MyTaskOpinionMap(
                MyTaskOpinionMap.Status.AVAILABLE,
                new MyTaskOpinionMap.Area(
                        MyTaskOpinionMap.AreaStatus.AVAILABLE,
                        "같은 선택을 한 사람들의 이유입니다."),
                new MyTaskOpinionMap.Area(
                        MyTaskOpinionMap.AreaStatus.INSUFFICIENT_REASON,
                        null));
        when(taskResults.findByTask(any(), any()))
                .thenReturn(Optional.of(myTaskResult(opinionMap)));

        mockMvc.perform(get("/api/v1/me/tasks/{taskId}/result",
                        taskId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.opinionMap.status")
                        .value("AVAILABLE"))
                .andExpect(jsonPath("$.opinionMap.sameChoice.status")
                        .value("AVAILABLE"))
                .andExpect(jsonPath("$.opinionMap.sameChoice.body")
                        .value("같은 선택을 한 사람들의 이유입니다."))
                .andExpect(jsonPath("$.opinionMap.otherChoices.status")
                        .value("INSUFFICIENT_REASON"))
                .andExpect(jsonPath("$.opinionMap.otherChoices")
                        .value(hasKey("body")))
                .andExpect(jsonPath("$.opinionMap.otherChoices.body")
                        .doesNotExist())
                .andExpect(jsonPath("$.opinionMap.optionKey")
                        .doesNotExist())
                .andExpect(jsonPath(
                        "$.opinionMap.sameChoice.sourceOptionKeys")
                        .doesNotExist())
                .andExpect(jsonPath(
                        "$.opinionMap.otherChoices.sourceOptionKeys")
                        .doesNotExist());
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
                .andExpect(jsonPath("$.waiting").value(true))
                .andExpect(jsonPath("$.predictionRequestAllowed")
                        .value(false));
    }

    @Test
    void remoteProcessingStatusPassesThroughProviderDetailAndRequestsRecheck()
            throws Exception {
        TaskPredictionRuntimeStatus runtimeStatus =
                new TaskPredictionRuntimeStatus(
                        "PREDICTION_NOT_READY",
                        "AI 예상 이유를 준비 중입니다.", true, 10);
        TaskPredictionQueryService.TaskPredictionView view =
                new TaskPredictionQueryService.TaskPredictionView(
                        taskId(),
                        TaskPredictionQueryService.TaskPredictionViewState
                                .REMOTE_PROCESSING,
                        personaGenerationId(),
                        new com.hamcheeze.vote.task.domain.common
                                .TaskPersonaId("persona-a"),
                        predictionId(),
                        TaskPredictionStatus.REMOTE_PROCESSING,
                        List.of(), true, true, false, null,
                        false, false, false, false, true,
                        List.of(), null, NOW.plusSeconds(30),
                        null, null, runtimeStatus);
        when(predictionQueries.findCurrent(any(), any())).thenReturn(view);

        mockMvc.perform(get(
                        "/api/v1/me/tasks/{taskId}/prediction",
                        taskId().value()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state")
                        .value("REMOTE_PROCESSING"))
                .andExpect(jsonPath("$.submissionAllowed").value(false))
                .andExpect(jsonPath("$.runtimeStatus.code")
                        .value("PREDICTION_NOT_READY"))
                .andExpect(jsonPath("$.runtimeStatus.detail")
                        .value("AI 예상 이유를 준비 중입니다."))
                .andExpect(jsonPath("$.runtimeStatus.retryable")
                        .value(true))
                .andExpect(jsonPath("$.runtimeStatus.maxWaitMinutes")
                        .value(10));

        verify(predictions).requestRemoteRecheckIfDue(
                eq(userId()), eq(taskId()));
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
                .thenReturn(
                        new TaskSubmissionExecutionService.SubmissionExecution(
                                outcome, true, false));

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
                eq(userId()), eq("request-key"), argThat(command ->
                        command.reasonSource()
                                == TaskReasonSource.USER_WRITTEN
                                && command.predictedReasonId() == null
                                && command.reason().equals("직접 작성한 이유")));
    }

    @Test
    void simulatedLocalSubmissionKeepsCreatedContractAndSignalsSimulation()
            throws Exception {
        TaskSubmissionOutcome outcome = new TaskSubmissionOutcome(
                201, "TASK_SUBMISSION_CREATED", taskId(),
                submissionId(), NOW.plusSeconds(30), List.of());
        when(submissions.submit(any(), eq("request-key"), any()))
                .thenReturn(
                        new TaskSubmissionExecutionService.SubmissionExecution(
                                outcome, false, true));

        mockMvc.perform(post(
                        "/api/v1/me/tasks/{taskId}/submission",
                        taskId().value()).principal(authentication)
                        .header("Idempotency-Key", "request-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submitBody()))
                .andExpect(status().isCreated())
                .andExpect(header().string("X-Local-Simulated", "true"))
                .andExpect(header().string("Location",
                        "/api/v1/me/submissions/"
                                + submissionId().value()))
                .andExpect(jsonPath("$.code")
                        .value("TASK_SUBMISSION_CREATED"))
                .andExpect(jsonPath("$.replayed").value(false));
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
                .thenReturn(
                        new TaskSubmissionExecutionService.SubmissionExecution(
                                outcome, false, false));

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
                        personaGenerationId(),
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
        return myTaskResult(MyTaskOpinionMap.unavailable());
    }

    private static MyTaskResultQueryService.MyTaskResult myTaskResult(
            MyTaskOpinionMap opinionMap
    ) {
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
                        NOW.minusSeconds(600)),
                opinionMap);
    }

    private static TaskOptionId resultOptionId(long value) {
        return new TaskOptionId(new UUID(100, value));
    }

    private static String submitBody() {
        return """
                {
                  "selectedOptionId": "%s",
                  "reasonSource": "USER_WRITTEN",
                  "reason": "직접 작성한 이유"
                }
                """.formatted(UUID.randomUUID());
    }

    private static TaskPredictionQueryService.TaskPredictionView unavailable(
            TaskPredictionQueryService.TaskPredictionViewState state
    ) {
        return new TaskPredictionQueryService.TaskPredictionView(
                taskId(), state, null, null, null, null,
                List.of(), false, false, false, false, false,
                List.of(), null, null, null, null);
    }
}
