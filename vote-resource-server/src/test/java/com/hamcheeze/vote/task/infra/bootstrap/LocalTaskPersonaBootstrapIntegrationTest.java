package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.task.application.bootstrap.LocalTaskFixture;
import com.hamcheeze.vote.task.application.bootstrap.LocalTaskParticipationFixture;
import com.hamcheeze.vote.task.application.bootstrap.LocalTaskPersonaFixture;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.task.bootstrap.enabled=true",
        "vote.task.bootstrap.persona-ready-enabled=true",
        "vote.task.bootstrap.participation-enabled=true",
        "vote.task.bootstrap.persona-subject=local-user-1",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=true",
        "vote.task.prediction.provider=fake",
        "vote.task.prediction.dispatcher-delay=1h",
        "vote.survey.bootstrap.enabled=true",
        "vote.survey.round-activation.enabled=false",
        "vote.integration.outbox.dispatcher-enabled=true",
        "vote.integration.outbox.poller-delay=1h",
        "vote.persona.enabled=true",
        "vote.persona.provider=fake",
        "vote.persona.dispatcher-delay=1h",
        "vote.persona.lease-reaper-delay=1h"
})
@ActiveProfiles({"local", "test"})
class LocalTaskPersonaBootstrapIntegrationTest {

    @Autowired
    private LocalTaskPersonaBootstrapService bootstrap;

    @Autowired
    private LocalTaskParticipationBootstrapService participationBootstrap;

    @Autowired
    private CurrentPersonaQueryService currentPersonas;

    @Autowired
    private TaskPredictionQueryService predictions;

    @Autowired
    private TaskSubmissionRepository submissions;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private UserTaskQueryService userTasks;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanBootstrapData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    integration_outbox,
                    persona_inbox,
                    persona_generations,
                    tasks,
                    survey_content_versions
                CASCADE
                """);
    }

    @Test
    void preparesOneParticipatedAndOneAvailableOpenTask() {
        String subject = LocalTaskPersonaFixture.DEFAULT_USER_SUBJECT;
        var persona = currentPersonas.findCurrent(
                new PersonaUserId(subject));

        assertThat(bootstrap.userSubject()).isEqualTo(subject);
        assertThat(persona.status())
                .isEqualTo(CurrentPersonaStatus.Status.SUCCEEDED);
        assertThat(persona.personaReady()).isTrue();
        assertThat(persona.generationId()).isPresent();
        assertThat(persona.personaVersionId()).isPresent();
        assertThat(persona.personaId()).isPresent();
        assertThat(bootstrap.initialize())
                .isEqualTo(LocalTaskPersonaBootstrapResult.ALREADY_PRESENT);
        assertThat(participationBootstrap.userSubject()).isEqualTo(subject);
        assertThat(participationBootstrap.initialize())
                .isEqualTo(
                        LocalTaskParticipationBootstrapResult.ALREADY_PRESENT);

        assertThat(count(
                "SELECT count(*) FROM survey_responses WHERE user_id = ?",
                subject)).isEqualTo(1);
        assertThat(count(
                "SELECT count(*) FROM persona_generations "
                        + "WHERE generation_id = ?",
                persona.generationId().orElseThrow().value()))
                .isEqualTo(1);
        assertThat(count(
                "SELECT count(*) FROM persona_versions "
                        + "WHERE generation_id = ?",
                persona.generationId().orElseThrow().value()))
                .isEqualTo(1);
        assertThat(count(
                "SELECT count(*) FROM task_predictions WHERE user_id = ?",
                subject)).isZero();
        assertThat(count(
                "SELECT count(*) FROM task_submissions WHERE user_id = ?",
                subject)).isEqualTo(1);

        var userId = new TaskUserId(subject);
        var firstTask = tasks.findById(
                LocalTaskFixture.TASK_ID).orElseThrow();
        var secondTask = tasks.findById(
                LocalTaskFixture.SECOND_TASK_ID).orElseThrow();
        var submission = submissions.findByUserAndTask(
                userId, firstTask.id()).orElseThrow();

        assertThat(submission.taskId()).isEqualTo(firstTask.id());
        assertThat(submission.predictionId()).isNull();
        assertThat(submission.reasonSource())
                .isEqualTo(TaskReasonSource.USER_WRITTEN);
        assertThat(submission.finalReason())
                .isEqualTo(LocalTaskParticipationFixture.REASON);
        assertThat(submission.questionId())
                .isEqualTo(firstTask.questions().getFirst().id());
        assertThat(submission.selectedOptionId()).isEqualTo(
                firstTask.questions().getFirst().options().getFirst().id());
        assertThat(submissions.findByUserAndTask(
                userId, secondTask.id())).isEmpty();

        var openTasks = userTasks.findOpenTasks(userId);
        var firstSummary = openTasks.stream()
                .filter(task -> task.taskId().equals(firstTask.id()))
                .findFirst().orElseThrow();
        var secondSummary = openTasks.stream()
                .filter(task -> task.taskId().equals(secondTask.id()))
                .findFirst().orElseThrow();

        assertThat(openTasks).hasSize(2);
        assertThat(firstSummary.submission().submitted()).isTrue();
        assertThat(firstSummary.submission().submissionId())
                .isEqualTo(submission.id());
        assertThat(firstSummary.submission().submittedAt())
                .isEqualTo(submission.submittedAt());
        assertThat(secondSummary.submission().submitted()).isFalse();
        assertThat(secondSummary.submission().submissionId()).isNull();
        assertThat(secondSummary.submission().submittedAt()).isNull();

        assertThat(predictions.findCurrent(
                userId, firstTask.id()).state())
                .isEqualTo(TaskPredictionViewState.ALREADY_SUBMITTED);
        var availablePrediction = predictions.findCurrent(
                userId, secondTask.id());
        assertThat(availablePrediction.state())
                .isEqualTo(TaskPredictionViewState.NOT_REQUESTED);
        assertThat(availablePrediction.personaGenerationId()).isNotNull();
        assertThat(availablePrediction.personaVersionId()).isNotNull();
        assertThat(availablePrediction.predictionId()).isNull();
        assertThat(availablePrediction.submissionAllowed()).isTrue();
        assertThat(availablePrediction.directAnswerAllowed()).isTrue();
        assertThat(availablePrediction.allowedReasonSources())
                .containsExactly(TaskReasonSource.USER_WRITTEN);
    }

    private int count(String sql, Object argument) {
        Integer result = jdbcTemplate.queryForObject(
                sql, Integer.class, argument);
        return result == null ? 0 : result;
    }
}
