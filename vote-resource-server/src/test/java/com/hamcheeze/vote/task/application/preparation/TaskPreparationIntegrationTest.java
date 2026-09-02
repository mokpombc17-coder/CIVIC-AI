package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.preparation.enabled=true",
        "vote.task.preparation.provider=fake"
})
@ActiveProfiles({"local", "test"})
class TaskPreparationIntegrationTest {

    private static final TaskActorId ADMIN =
            new TaskActorId("task-preparation-admin");

    @Autowired
    private TaskAdministrationService administration;

    @Autowired
    private TaskPreparationService preparationService;

    @Autowired
    private TaskPreparationRepository preparations;

    @Autowired
    private TaskRepository tasks;

    @Test
    void normalPublicationDoesNotTriggerPreparation() {
        Task draft = draft("일반 발행 과업");

        Task opened = administration.openImmediately(
                        draft.id(),
                        Instant.now().plus(2, ChronoUnit.HOURS),
                        "즉시 발행",
                        ADMIN)
                .task();

        assertThat(opened.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(preparations.findByTaskIdForUpdate(draft.id())).isEmpty();
    }

    @Test
    void explicitPreparationDoesNotPublishTask() {
        Task draft = draft("명시적 준비 과업");

        TaskPreparationReceipt receipt = preparationService.prepare(draft.id());

        assertThat(receipt.taskId()).isEqualTo(draft.id());
        assertThat(preparations.findByTaskIdForUpdate(draft.id()))
                .get()
                .extracting(TaskPreparationRecord::status)
                .isEqualTo(TaskPreparationStatus.READY);
        assertThat(tasks.findById(draft.id()))
                .get()
                .extracting(Task::status)
                .isEqualTo(TaskStatus.DRAFT);
    }

    private Task draft(String title) {
        return administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        title,
                        "과업 배경",
                        question()),
                ADMIN);
    }

    private static TaskQuestion question() {
        return new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "하나를 선택하세요",
                "질문 배경",
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()),
                                1,
                                "선택지 A"),
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()),
                                2,
                                "선택지 B")));
    }
}
