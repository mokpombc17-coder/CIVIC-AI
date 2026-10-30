package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false"
})
@ActiveProfiles({"local", "test"})
@Transactional
class TaskProgressSummaryQueryIntegrationTest {

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskProgressSummaryQueryService summaries;

    @Autowired
    private TaskProgressResponsesQueryService responses;

    @Test
    void executesAggregateQueryAgainstTheMigratedSchema() {
        Task task = TaskQueryFixtures.openTask(
                "집계 SQL 검증", NOW.plusSeconds(600));
        tasks.save(task);

        var summary = summaries.findByTaskId(task.id()).orElseThrow();

        assertThat(summary.submissionCount()).isZero();
        assertThat(summary.options()).hasSize(2)
                .allSatisfy(option -> {
                    assertThat(option.count()).isZero();
                    assertThat(option.rate()).isZero();
                });
    }

    @Test
    void executesAnonymousResponseQueryAgainstTheMigratedSchema() {
        Task task = TaskQueryFixtures.openTask(
                "익명 응답 SQL 검증", NOW.plusSeconds(600));
        tasks.save(task);

        var page = responses.findByTaskId(
                task.id(), null, 100).orElseThrow();

        assertThat(page.responses()).isEmpty();
        assertThat(page.hasMore()).isFalse();
        assertThat(page.nextCursor()).isNull();
    }
}
