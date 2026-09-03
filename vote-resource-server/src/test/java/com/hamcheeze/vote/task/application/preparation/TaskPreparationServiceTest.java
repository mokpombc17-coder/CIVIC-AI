package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TaskPreparationServiceTest {

    private static final TaskId TASK_ID = new TaskId(UUID.randomUUID());
    private static final UUID REQUEST_ID = UUID.randomUUID();
    private static final String FINGERPRINT = "sha256:" + "a".repeat(64);
    private static final Instant NOW =
            Instant.parse("2026-09-03T03:03:00Z");

    private final TaskPreparationStateService states =
            mock(TaskPreparationStateService.class);
    private final TaskPreparationProvider provider =
            mock(TaskPreparationProvider.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<TaskPreparationProvider> providers =
            mock(ObjectProvider.class);
    private final TaskPreparationService service =
            new TaskPreparationService(states, providers);

    @Test
    void verifiesReadyWithRuntimeBeforePublication() {
        TaskPreparationVerification verification = verification();
        TaskPreparationRemoteStatus remote = readyRemote();
        when(providers.getIfAvailable()).thenReturn(provider);
        when(states.verification(TASK_ID)).thenReturn(verification);
        when(provider.findStatus(verification)).thenReturn(remote);
        when(states.applyVerification(verification, remote))
                .thenReturn(readyRecord());

        assertThatCode(() -> service.verifyReady(TASK_ID))
                .doesNotThrowAnyException();
    }

    @Test
    void processingRuntimeStatusBlocksPublication() {
        TaskPreparationVerification verification = verification();
        TaskPreparationRemoteStatus remote = new TaskPreparationRemoteStatus(
                1, REQUEST_ID, TASK_ID, FINGERPRINT,
                TaskPreparationStatus.PROCESSING,
                NOW.minusSeconds(10), null, null, NOW);
        when(providers.getIfAvailable()).thenReturn(provider);
        when(states.verification(TASK_ID)).thenReturn(verification);
        when(provider.findStatus(verification)).thenReturn(remote);
        when(states.applyVerification(verification, remote))
                .thenReturn(processingRecord());

        assertThatThrownBy(() -> service.verifyReady(TASK_ID))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(
                                exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREPARATION_NOT_READY"));
    }

    @Test
    void runtimeOutageBlocksPublicationAsUnavailable() {
        TaskPreparationVerification verification = verification();
        when(providers.getIfAvailable()).thenReturn(provider);
        when(states.verification(TASK_ID)).thenReturn(verification);
        when(provider.findStatus(verification)).thenThrow(
                new TaskPreparationProviderException(
                        true, 503, "SERVICE_UNAVAILABLE",
                        "runtime unavailable", null));

        assertThatThrownBy(() -> service.verifyReady(TASK_ID))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(
                                exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREPARATION_VERIFICATION_UNAVAILABLE"));
    }

    private static TaskPreparationVerification verification() {
        return new TaskPreparationVerification(
                1, REQUEST_ID, TASK_ID, FINGERPRINT);
    }

    private static TaskPreparationRemoteStatus readyRemote() {
        return new TaskPreparationRemoteStatus(
                1, REQUEST_ID, TASK_ID, FINGERPRINT,
                TaskPreparationStatus.READY,
                NOW.minusSeconds(10), NOW, null, NOW);
    }

    private static TaskPreparationRecord readyRecord() {
        return new TaskPreparationRecord(
                TASK_ID, REQUEST_ID, FINGERPRINT, "{}",
                TaskPreparationStatus.READY, 1,
                null, null, NOW, null, null, NOW, NOW);
    }

    private static TaskPreparationRecord processingRecord() {
        return new TaskPreparationRecord(
                TASK_ID, REQUEST_ID, FINGERPRINT, "{}",
                TaskPreparationStatus.PROCESSING, 1,
                NOW, null, null, null, null, NOW, NOW);
    }
}
