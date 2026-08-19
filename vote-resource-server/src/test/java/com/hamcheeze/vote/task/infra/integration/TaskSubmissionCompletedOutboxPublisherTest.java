package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerSource;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerType;
import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskSubmissionCompletedOutboxPublisherTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-19T00:00:00Z");

    private final IntegrationOutboxRepository outbox =
            mock(IntegrationOutboxRepository.class);
    private final ObjectMapper objectMapper = mock(ObjectMapper.class);
    private final TaskSubmissionCompletedOutboxPublisher publisher =
            new TaskSubmissionCompletedOutboxPublisher(outbox, objectMapper);

    @Test
    void mapsSubmissionProvenanceAndAllAnswerShapesIntoPendingV1Event()
            throws Exception {
        TaskSubmission submission = submission();
        when(objectMapper.writeValueAsString(any()))
                .thenReturn("{\"schema\":\"fixture\"}");

        publisher.publish(submission);

        ArgumentCaptor<Object> serialized =
                ArgumentCaptor.forClass(Object.class);
        verify(objectMapper).writeValueAsString(serialized.capture());
        assertThat(serialized.getValue())
                .isInstanceOfSatisfying(
                        TaskSubmissionCompletedV1.class,
                        payload -> {
                            assertThat(payload.userId()).isEqualTo("user-a");
                            assertThat(payload.submissionId())
                                    .isEqualTo(submission.id().value());
                            assertThat(payload.taskId())
                                    .isEqualTo(submission.taskId().value());
                            assertThat(payload.predictionId())
                                    .isEqualTo(submission.predictionId().value());
                            assertThat(payload.personaGenerationId())
                                    .isEqualTo(submission
                                            .personaGenerationId().value());
                            assertThat(payload.personaVersionId())
                                    .isEqualTo(submission
                                            .personaVersionId().value());
                            assertThat(payload.answers())
                                    .extracting(answer -> answer.answerType())
                                    .containsExactly(
                                            AnswerType.SINGLE_CHOICE,
                                            AnswerType.MULTIPLE_CHOICE,
                                            AnswerType.SHORT_TEXT,
                                            AnswerType.LONG_TEXT,
                                            AnswerType.NUMBER,
                                            AnswerType.SCALE);
                            assertThat(payload.answers().getFirst().source())
                                    .isEqualTo(AnswerSource.AI_ACCEPTED);
                            assertThat(payload.answers().getFirst()
                                    .adoptedPredictionCandidateId())
                                    .isNotNull();
                            assertThat(payload.answers().get(1).selections())
                                    .extracting(selection -> selection.otherText())
                                    .containsExactly(null, "기타 입력");
                        });

        ArgumentCaptor<IntegrationOutboxMessage> message =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).insert(message.capture());
        assertThat(message.getValue()).satisfies(pending -> {
            assertThat(pending.nextAttemptAt()).isEqualTo(SUBMITTED_AT);
            assertThat(pending.event().eventType())
                    .isEqualTo(TaskSubmissionCompletedV1.EVENT_TYPE);
            assertThat(pending.event().aggregateType())
                    .isEqualTo(TaskSubmissionCompletedV1.AGGREGATE_TYPE);
            assertThat(pending.event().aggregateId())
                    .isEqualTo(submission.id().value());
            assertThat(pending.event().payload())
                    .isEqualTo("{\"schema\":\"fixture\"}");
        });
    }

    private static TaskSubmission submission() {
        TaskSubmission submission = mock(TaskSubmission.class);
        when(submission.userId()).thenReturn(new TaskUserId("user-a"));
        when(submission.id()).thenReturn(
                new TaskSubmissionId(UUID.randomUUID()));
        when(submission.taskId()).thenReturn(new TaskId(UUID.randomUUID()));
        when(submission.predictionId()).thenReturn(
                new TaskPredictionId(UUID.randomUUID()));
        when(submission.personaGenerationId()).thenReturn(
                new TaskPersonaGenerationId(UUID.randomUUID()));
        when(submission.personaVersionId()).thenReturn(
                new TaskPersonaVersionId(UUID.randomUUID()));
        when(submission.submittedAt()).thenReturn(SUBMITTED_AT);
        when(submission.answers()).thenReturn(List.of(
                TaskSubmissionAnswer.aiAccepted(
                        questionId(),
                        new TaskPredictionCandidateId(UUID.randomUUID()),
                        new SingleChoiceValue(selection(null))),
                TaskSubmissionAnswer.userAnswered(
                        questionId(),
                        new MultipleChoiceValue(List.of(
                                selection(null), selection("기타 입력")))),
                TaskSubmissionAnswer.userAnswered(
                        questionId(), new ShortTextValue("짧은 답변")),
                TaskSubmissionAnswer.userAnswered(
                        questionId(), new LongTextValue("긴 답변")),
                TaskSubmissionAnswer.userAnswered(
                        questionId(), new NumberValue(
                                new BigDecimal("12.5"))),
                TaskSubmissionAnswer.userAnswered(
                        questionId(), new ScaleValue(4))));
        return submission;
    }

    private static TaskQuestionId questionId() {
        return new TaskQuestionId(UUID.randomUUID());
    }

    private static TaskOptionSelection selection(String otherText) {
        return new TaskOptionSelection(
                new TaskOptionId(UUID.randomUUID()), otherText);
    }
}
