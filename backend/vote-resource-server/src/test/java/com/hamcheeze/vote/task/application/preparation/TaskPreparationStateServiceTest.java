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
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
    void expiredProcessingClaimResendsTheSameRequest() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord processing = new TaskPreparationRecord(
                task.id(),
                requestId,
                FINGERPRINT,
                "{}",
                TaskPreparationStatus.PROCESSING,
                1,
                NOW.minus(policy.processingLeaseDuration()),
                null,
                null,
                null,
                null,
                null,
                NOW.minus(policy.processingLeaseDuration()),
                NOW.minus(policy.processingLeaseDuration()));
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(processing));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
        when(payloads.create(task, requestId)).thenReturn(
                new TaskPreparationCommand(
                        1, requestId, task.id(), FINGERPRINT, "{}"));
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        TaskPreparationClaim claim = service.claim(task.id());

        assertThat(claim.requiresProviderCall()).isTrue();
        assertThat(claim.command().requestId()).isEqualTo(requestId);
        ArgumentCaptor<TaskPreparationRecord> saved =
                ArgumentCaptor.forClass(TaskPreparationRecord.class);
        verify(preparations).save(saved.capture());
        assertThat(saved.getValue().attemptCount()).isEqualTo(2);
        assertThat(saved.getValue().processingStartedAt()).isEqualTo(NOW);
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

    @Test
    void callbackMovesCurrentProcessingAttemptToReady() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord processing = processing(task, requestId);
        prepareCallback(task, processing);
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        TaskPreparationRecord result = service.applyCallback(
                readyResult(task, requestId));

        assertThat(result.status()).isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.preparedAt()).isEqualTo(NOW);
        assertThat(result.processingStartedAt()).isNull();
    }

    @Test
    void identicalReadyCallbackIsIdempotent() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord ready = ready(task, requestId);
        prepareCallback(task, ready);

        TaskPreparationRecord result = service.applyCallback(
                readyResult(task, requestId));

        assertThat(result).isSameAs(ready);
        verify(preparations, never()).save(any());
    }

    @Test
    void lateReadyCallbackRecoversRetryableFailure() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord failed = failed(task, requestId);
        prepareCallback(task, failed);
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        TaskPreparationRecord result = service.applyCallback(
                readyResult(task, requestId));

        assertThat(result.status()).isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.lastErrorCode()).isNull();
        assertThat(result.nextRetryAt()).isNull();
    }

    @Test
    void callbackRejectsAnOlderRequestId() {
        Task task = draftTask();
        UUID currentRequestId = UUID.randomUUID();
        TaskPreparationRecord processing =
                processing(task, currentRequestId);
        when(preparations.findByRequestId(any()))
                .thenReturn(Optional.empty());
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(processing));

        assertThatThrownBy(() -> service.applyCallback(
                readyResult(task, UUID.randomUUID())))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(
                                exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREPARATION_STALE_RESULT"));
    }

    @Test
    void callbackNeverDowngradesReadyToFailed() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord ready = ready(task, requestId);
        prepareCallback(task, ready);

        TaskPreparationResult failedResult = new TaskPreparationResult(
                1,
                requestId,
                task.id(),
                FINGERPRINT,
                TaskPreparationStatus.FAILED,
                null,
                new TaskPreparationResult.Error(
                        "MODEL_UNAVAILABLE", "runtime unavailable", true));

        assertThatThrownBy(() -> service.applyCallback(failedResult))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(
                                exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREPARATION_TERMINAL_STATE_CONFLICT"));
        verify(preparations, never()).save(any());
    }

    @Test
    void runtimeVerificationRecoversMissedReadyCallback() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord processing = processing(task, requestId);
        TaskPreparationVerification verification =
                new TaskPreparationVerification(
                        1, requestId, task.id(), FINGERPRINT);
        TaskPreparationRemoteStatus remote =
                new TaskPreparationRemoteStatus(
                        1, requestId, task.id(), FINGERPRINT,
                        TaskPreparationStatus.READY,
                        NOW.minusSeconds(10), NOW, null, NOW);
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(processing));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        TaskPreparationRecord result = service.applyVerification(
                verification, remote);

        assertThat(result.status()).isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.preparedAt()).isEqualTo(NOW);
    }

    @Test
    void localPublicationGuardRequiresCurrentReadyFingerprint() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(preparations.findByTaskId(task.id()))
                .thenReturn(Optional.of(ready(task, requestId)));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);

        assertThatCode(() -> service.requireLocallyReady(task.id()))
                .doesNotThrowAnyException();
    }

    @Test
    void failedPublicationVerificationStoresRetryBoundary() {
        Task task = draftTask();
        UUID requestId = UUID.randomUUID();
        TaskPreparationRecord ready = ready(task, requestId);
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(ready));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
        when(preparations.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        service.deferPublicationVerification(task.id());

        ArgumentCaptor<TaskPreparationRecord> saved =
                ArgumentCaptor.forClass(TaskPreparationRecord.class);
        verify(preparations).save(saved.capture());
        assertThat(saved.getValue().publicationVerificationNextRetryAt())
                .isEqualTo(NOW.plusSeconds(30));
        assertThat(saved.getValue().status())
                .isEqualTo(TaskPreparationStatus.READY);
    }

    private void prepareCallback(
            Task task,
            TaskPreparationRecord preparation
    ) {
        when(preparations.findByRequestId(preparation.requestId()))
                .thenReturn(Optional.of(preparation));
        when(tasks.findByIdForUpdate(task.id()))
                .thenReturn(Optional.of(task));
        when(preparations.findByTaskIdForUpdate(task.id()))
                .thenReturn(Optional.of(preparation));
        when(payloads.fingerprint(task)).thenReturn(FINGERPRINT);
    }

    private static TaskPreparationResult readyResult(
            Task task,
            UUID requestId
    ) {
        return new TaskPreparationResult(
                1,
                requestId,
                task.id(),
                FINGERPRINT,
                TaskPreparationStatus.READY,
                NOW,
                null);
    }

    private static TaskPreparationRecord processing(Task task) {
        return processing(task, UUID.randomUUID());
    }

    private static TaskPreparationRecord processing(
            Task task,
            UUID requestId
    ) {
        return new TaskPreparationRecord(
                task.id(),
                requestId,
                FINGERPRINT,
                "{}",
                TaskPreparationStatus.PROCESSING,
                1,
                NOW,
                null,
                null,
                null,
                null,
                null,
                NOW,
                NOW);
    }

    private static TaskPreparationRecord ready(
            Task task,
            UUID requestId
    ) {
        return new TaskPreparationRecord(
                task.id(), requestId, FINGERPRINT, "{}",
                TaskPreparationStatus.READY, 1,
                null, null, null, NOW, null, null, NOW, NOW);
    }

    private static TaskPreparationRecord failed(
            Task task,
            UUID requestId
    ) {
        return new TaskPreparationRecord(
                task.id(), requestId, FINGERPRINT, "{}",
                TaskPreparationStatus.FAILED, 1,
                null, NOW.plusSeconds(30), null, null,
                "TIMEOUT", "runtime timed out", NOW, NOW);
    }
}
