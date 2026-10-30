package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapResultQueryService;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService.MyTaskSubmission;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MyTaskResultQueryServiceTest {

    private static final TaskUserId USER_ID =
            new TaskUserId("my-result-user");
    private static final TaskId TASK_ID = new TaskId(uuid(1));
    private static final TaskSubmissionId SUBMISSION_ID =
            new TaskSubmissionId(uuid(2));
    private static final TaskQuestionId QUESTION_ID =
            new TaskQuestionId(uuid(3));
    private static final TaskOptionId OPTION_ONE_ID =
            new TaskOptionId(uuid(4));
    private static final TaskOptionId OPTION_TWO_ID =
            new TaskOptionId(uuid(5));
    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-27T12:00:00Z");
    private static final Instant FINALIZED_AT = CLOSED_AT.plusSeconds(10);
    private static final Instant SUBMITTED_AT = CLOSED_AT.minusSeconds(600);

    @Mock
    private MyTaskSubmissionQueryService submissions;

    @Mock
    private TaskResultViewVerificationService verification;

    @Mock
    private TaskResultSummaryAssembler summaries;

    @Mock
    private OpinionMapResultQueryService opinionMaps;

    private MyTaskResultQueryService service;

    @BeforeEach
    void setUp() {
        lenient().when(opinionMaps.findForTask(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.anyInt(),
                        org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(MyTaskOpinionMap.unavailable());
        service = new MyTaskResultQueryService(
                submissions, verification, summaries, opinionMaps);
    }

    @Test
    void checksParticipationBeforeReadingAnyFinalizedResult() {
        when(submissions.findByTask(USER_ID, TASK_ID))
                .thenReturn(Optional.empty());

        assertThat(service.findByTask(USER_ID, TASK_ID)).isEmpty();

        verifyNoInteractions(verification, summaries, opinionMaps);
    }

    @Test
    void hidesUnfinalizedOrUnavailableResultAfterParticipation() {
        when(submissions.findByTask(USER_ID, TASK_ID))
                .thenReturn(Optional.of(submission(OPTION_TWO_ID)));
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.empty());

        assertThat(service.findByTask(USER_ID, TASK_ID)).isEmpty();

        verifyNoInteractions(summaries, opinionMaps);
    }

    @Test
    void assemblesVerifiedCountsWithOnlyMySubmission() {
        MyTaskSubmission submission = submission(OPTION_TWO_ID);
        VerifiedTaskResultView verified = verified();
        TaskResultSummaryV1 summary = summary();
        when(submissions.findByTask(USER_ID, TASK_ID))
                .thenReturn(Optional.of(submission));
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        when(summaries.assemble(verified.view())).thenReturn(summary);

        MyTaskResultQueryService.MyTaskResult result =
                service.findByTask(USER_ID, TASK_ID).orElseThrow();

        assertThat(result.taskId()).isEqualTo(TASK_ID);
        assertThat(result.title()).isEqualTo("결과 Task");
        assertThat(result.description()).isEqualTo("결과 설명");
        assertThat(result.closedAt()).isEqualTo(CLOSED_AT);
        assertThat(result.closureType())
                .isEqualTo(TaskClosureType.EARLY_CLOSED);
        assertThat(result.resultVersion()).isEqualTo(1);
        assertThat(result.finalizedAt()).isEqualTo(FINALIZED_AT);
        assertThat(result.responseCount()).isEqualTo(3);
        assertThat(result.question().id()).isEqualTo(QUESTION_ID);
        assertThat(result.question().content()).isEqualTo("선호 질문");
        assertThat(result.options())
                .extracting(option -> option.count())
                .containsExactly(2, 1);
        assertThat(result.options())
                .filteredOn(option -> option.selectedByMe())
                .singleElement()
                .satisfies(option -> assertThat(option.id())
                        .isEqualTo(OPTION_TWO_ID));
        assertThat(result.mySubmission().submissionId())
                .isEqualTo(SUBMISSION_ID);
        assertThat(result.mySubmission().selectedOptionId())
                .isEqualTo(OPTION_TWO_ID);
        assertThat(result.mySubmission().reasonSource())
                .isEqualTo(TaskReasonSource.USER_WRITTEN);
        assertThat(result.mySubmission().finalReason())
                .isEqualTo("내 최종 이유");
        assertThat(result.mySubmission().submittedAt())
                .isEqualTo(SUBMITTED_AT);
        assertThat(result.opinionMap())
                .isEqualTo(MyTaskOpinionMap.unavailable());

        InOrder privacyOrder = inOrder(
                submissions, verification, summaries);
        privacyOrder.verify(submissions).findByTask(USER_ID, TASK_ID);
        privacyOrder.verify(verification).findByTaskId(TASK_ID);
        privacyOrder.verify(summaries).assemble(verified.view());
    }

    @Test
    void rejectsSubmissionOptionMissingFromVerifiedTask() {
        TaskOptionId unknownOption = new TaskOptionId(uuid(999));
        MyTaskSubmission submission = submission(unknownOption);
        VerifiedTaskResultView verified = verified();
        when(submissions.findByTask(USER_ID, TASK_ID))
                .thenReturn(Optional.of(submission));
        when(verification.findByTaskId(TASK_ID))
                .thenReturn(Optional.of(verified));
        when(summaries.assemble(verified.view())).thenReturn(summary());

        assertThatThrownBy(() -> service.findByTask(USER_ID, TASK_ID))
                .isInstanceOf(TaskResultViewIntegrityException.class)
                .hasMessageContaining(
                        "submission option does not exist");
    }

    private MyTaskSubmission submission(TaskOptionId selectedOptionId) {
        return new MyTaskSubmission(
                SUBMISSION_ID,
                TASK_ID,
                "결과 Task",
                "결과 설명",
                new TaskPersonaGenerationId(uuid(10)),
                null,
                SUBMITTED_AT,
                QUESTION_ID,
                question(),
                selectedOptionId,
                TaskReasonSource.USER_WRITTEN,
                null,
                "내 최종 이유");
    }

    private TaskQuestion question() {
        return new TaskQuestion(
                QUESTION_ID,
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "선호 질문",
                null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                OPTION_ONE_ID, 1, "첫 번째"),
                        TaskOption.standard(
                                OPTION_TWO_ID, 2, "두 번째")));
    }

    private VerifiedTaskResultView verified() {
        TaskResultViewV1 view = new TaskResultViewV1(
                1,
                CLOSED_AT,
                TaskClosureType.EARLY_CLOSED,
                new TaskData("결과 Task", "결과 설명"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "선호 질문",
                        null),
                List.of(
                        new OptionData(1, "첫 번째"),
                        new OptionData(2, "두 번째")),
                List.of(
                        new ResponseData(
                                1, 1, "첫 이유",
                                TaskReasonSource.USER_WRITTEN),
                        new ResponseData(
                                2, 1, "둘째 이유",
                                TaskReasonSource.AI_ACCEPTED),
                        new ResponseData(
                                3, 2, "내 최종 이유",
                                TaskReasonSource.USER_WRITTEN)));
        TaskResultManifest manifest = new TaskResultManifest(
                TASK_ID,
                1,
                TaskResultViewV1.SCHEMA_VERSION,
                CLOSED_AT,
                3,
                "0".repeat(64),
                FINALIZED_AT);
        return new VerifiedTaskResultView(
                manifest,
                view,
                new RenderedTaskResultView("{}", "0".repeat(64)));
    }

    private TaskResultSummaryV1 summary() {
        return new TaskResultSummaryV1(
                TaskResultSummaryV1.SCHEMA_VERSION,
                1,
                3,
                List.of(
                        new OptionCount("O1", "첫 번째", 2),
                        new OptionCount("O2", "두 번째", 1)));
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
