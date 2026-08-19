package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.task.bootstrap.enabled=false",
        "vote.task.prediction.enabled=false",
        "vote.survey.bootstrap.enabled=false",
        "vote.survey.persona.enabled=false"
})
@ActiveProfiles({"local", "test"})
class LocalTaskBootstrapIntegrationTest {

    @Autowired
    private LocalTaskBootstrapService bootstrap;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetTaskData() {
        jdbcTemplate.execute("TRUNCATE TABLE tasks CASCADE");
    }

    @AfterEach
    void cleanTaskData() {
        resetTaskData();
    }

    @Test
    void createsExactFixtureOnceAndThenReturnsNoOp() {
        assertThat(bootstrap.initialize())
                .isEqualTo(LocalTaskBootstrapResult.CREATED);
        assertThat(bootstrap.initialize())
                .isEqualTo(LocalTaskBootstrapResult.ALREADY_PRESENT);

        var task = tasks.findById(LocalTaskFixture.TASK_ID).orElseThrow();
        assertThat(LocalTaskFixture.matches(task)).isTrue();
        assertThat(task.questions())
                .extracting(question -> question.type())
                .containsExactly(
                        com.hamcheeze.vote.task.domain.task.TaskQuestionType
                                .SINGLE_CHOICE);
        assertThat(tasks.findLifecycleHistory(LocalTaskFixture.TASK_ID))
                .singleElement()
                .matches(LocalTaskFixture::matches);
    }

    @Test
    void rejectsPartialFixtureWithoutOverwritingIt() {
        tasks.save(LocalTaskFixture.draft());

        assertThatThrownBy(bootstrap::initialize)
                .isInstanceOf(LocalTaskBootstrapException.class)
                .hasMessageContaining(LocalTaskBootstrapException.CODE);

        assertThat(tasks.findById(LocalTaskFixture.TASK_ID))
                .get()
                .extracting(task -> task.status())
                .isEqualTo(TaskStatus.DRAFT);
        assertThat(tasks.findLifecycleHistory(LocalTaskFixture.TASK_ID))
                .isEmpty();
    }
}
