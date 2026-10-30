package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static org.assertj.core.api.Assertions.assertThat;

class TaskPreparationJsonPayloadFactoryTest {

    private final TaskPreparationJsonPayloadFactory factory =
            new TaskPreparationJsonPayloadFactory(new ObjectMapper());

    @Test
    void createsMinimalOrderedSingleChoicePayloadAndStableFingerprint() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();

        var first = factory.create(task, requestId);
        var second = factory.create(task, requestId);

        assertThat(first.contentFingerprint())
                .matches("sha256:[0-9a-f]{64}")
                .isEqualTo(second.contentFingerprint())
                .isEqualTo(factory.fingerprint(task));
        assertThat(first.requestPayload())
                .isEqualTo(second.requestPayload())
                .contains("\"taskId\"")
                .contains("\"questionId\"")
                .contains("\"optionId\"")
                .contains("\"content\"")
                .doesNotContain("displayOrder")
                .doesNotContain("constraint")
                .doesNotContain("\"type\"")
                .doesNotContain("\"kind\"");
    }
}
