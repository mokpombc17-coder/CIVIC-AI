package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.USER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MyTaskSubmissionQueryServiceTest {

    @Mock
    private TaskSubmissionRepository submissions;

    @Mock
    private TaskRepository tasks;

    @Mock
    private TaskPredictionRepository predictions;

    private MyTaskSubmissionQueryService service;

    @BeforeEach
    void setUp() {
        service = new MyTaskSubmissionQueryService(
                submissions, tasks, predictions);
    }

    @Test
    void returnsFinalAnswerSourceAndAdoptedCandidateSnapshot() {
        Task task = TaskQueryFixtures.openTask(
                "내 제출 과업", NOW.plusSeconds(600));
        TaskPrediction prediction = TaskQueryFixtures
                .succeededPrediction(task);
        TaskSubmission submission = TaskQueryFixtures.aiSubmission(
                task, prediction);
        when(submissions.findByUserAndTask(USER, task.id()))
                .thenReturn(Optional.of(submission));
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(predictions.findById(prediction.id()))
                .thenReturn(Optional.of(prediction));

        var result = service.findByTask(USER, task.id()).orElseThrow();

        assertThat(result.submissionId()).isEqualTo(submission.id());
        assertThat(result.submittedAt()).isEqualTo(NOW.minusSeconds(10));
        assertThat(result.answers()).singleElement().satisfies(answer -> {
            assertThat(answer.question().content())
                    .isEqualTo("하나를 선택해주세요.");
            assertThat(answer.source()).isEqualTo(
                    TaskAnswerSource.AI_ACCEPTED);
            assertThat(answer.adoptedCandidate()).isNotNull();
            assertThat(answer.adoptedCandidate().candidateId())
                    .isEqualTo(prediction.candidates().getFirst().id());
            assertThat(answer.adoptedCandidate().rationale())
                    .isEqualTo("첫 번째 예상 근거");
            assertThat(answer.finalAnswerValue())
                    .isEqualTo(prediction.candidates().getFirst().answerValue());
        });
    }

    @Test
    void submissionIdLookupNeverHydratesAnotherUsersRawAnswers() {
        Task task = TaskQueryFixtures.openTask(
                "소유권 과업", NOW.plusSeconds(600));
        TaskPrediction prediction = TaskQueryFixtures.failedPrediction(task);
        TaskSubmission submission = TaskQueryFixtures.directSubmission(
                task, prediction);
        TaskUserId otherUser = new TaskUserId("other-user");
        when(submissions.findById(submission.id()))
                .thenReturn(Optional.of(submission));

        assertThat(service.findById(otherUser, submission.id())).isEmpty();
        verifyNoInteractions(tasks, predictions);
    }
}
