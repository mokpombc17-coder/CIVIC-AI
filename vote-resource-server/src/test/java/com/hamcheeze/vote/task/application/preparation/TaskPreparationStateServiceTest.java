package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationPayloadFactory;
import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskPreparationStateServiceTest {

    private static final String FINGERPRINT = "sha256:"
            + "a".repeat(64);

    private final TaskRepository tasks = mock(TaskRepository.class);
    private final TaskPreparationRepository preparations =
            mock(TaskPreparationRepository.class);
    private final TaskPreparationPayloadFactory payloads =
            mock(TaskPreparationPayloadFactory.class);
    private final TaskPreparationPolicy policy = new TaskPreparationPolicy(
            Duration.ofSeconds(30),
            Duration.ofMinutes(1));
    private final TaskPreparationStateService service =
            new TaskPreparationStateService(
                    tasks,
                    preparations,
                    payloads,
                    policy,
                    Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void immediatePublicationClaimsFrozenDraftContent() {
        Task task = draftTask();
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.empty());
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
        when(payloads.create(any(), any())).thenAnswer(invocation -> {
            UUID requestId = invocation.getArgument(1);
            return new TaskPreparationCommand(
                    1, requestId, task.id(), FINGERPRINT, "{}");
        });
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        TaskPreparationClaim claim = service.claim(task.id());

        assertThat(claim.requiresProviderCall()).isTrue();
        ArgumentCaptor<TaskPreparationRecord> saved =
                ArgumentCaptor.forClass(TaskPreparationRecord.class);
        verify(preparations).save(saved.capture());
        assertThat(saved.getValue().status())
                .isEqualTo(TaskPreparationStatus.PROCESSING);
        assertThat(saved.getValue().attemptCount()).isEqualTo(1);
        assertThat(saved.getValue().processingStartedAt()).isEqualTo(NOW);
    }

    @Test
    void freshProcessingClaimIsReplayedWithoutAnotherProviderCall() {
        Task task = draftTask();
        TaskPreparationRecord processing = processing(task);
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(processing));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);

        TaskPreparationClaim claim = service.claim(task.id());

        assertThat(claim.requiresProviderCall()).isFalse();
        assertThat(claim.existing()).isEqualTo(processing);
    }

    @Test
    void processingPreparationLocksCurrentDraftContent() {
        Task task = draftTask();
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(processing(task)));

        assertThatThrownBy(() -> service.requireContentEditable(task))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(
                                exception.violation().code())
                                .isEqualTo(
                                        "TASK_CONTENT_LOCKED_BY_PREPARATION"));
    }

    private static TaskPreparationRecord processing(Task task) {
        return new TaskPreparationRecord(
                task.id(),
                UUID.randomUUID(),
                FINGERPRINT,
                "{}",
                TaskPreparationStatus.PROCESSING,
                1,
                NOW,
                null,
                null,
                null,
                null,
                NOW,
                NOW);
    }
}
