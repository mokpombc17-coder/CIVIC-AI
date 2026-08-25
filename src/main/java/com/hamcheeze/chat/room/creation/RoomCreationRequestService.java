package com.hamcheeze.chat.room.creation;

import com.hamcheeze.chat.room.RoomCreationResult;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipLimitMode;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaDecision;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaGuard;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaMetrics;
import com.hamcheeze.chat.room.application.ApprovedRoomCreation;
import com.hamcheeze.chat.room.application.ApprovedRoomCreationOutcome;
import com.hamcheeze.chat.room.application.ApprovedRoomCreationResult;
import com.hamcheeze.chat.room.application.ApprovedRoomCreator;
import com.hamcheeze.chat.room.application.RoomCommandIdGenerator;
import com.hamcheeze.chat.room.application.RoomCommandPostCommitCoordinator;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.idempotency.RoomCommandFingerprintFactory;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestInsertOutcome;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestInsertResult;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestSlice;
import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestStore;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

public final class RoomCreationRequestService {

    private static final int MAX_TRANSITION_ATTEMPTS = 3;

    private final RoomCreationRequestStore store;
    private final RoomCreationRequestIdGenerator requestIdGenerator;
    private final RoomCommandIdGenerator roomIdGenerator;
    private final RoomCommandFingerprintFactory fingerprintFactory;
    private final ApprovedRoomCreator approvedRoomCreator;
    private final RoomCommandPostCommitCoordinator postCommitCoordinator;
    private final ActiveRoomMembershipQuotaGuard quotaGuard;
    private final ActiveRoomMembershipQuotaMetrics quotaMetrics;
    private final RoomMembershipProperties membershipProperties;
    private final RoomCreationProperties creationProperties;
    private final RoomCreationRequestCursorCodec cursorCodec;
    private final AdminRoomCreationRequestCursorCodec adminCursorCodec;
    private final TransactionOperations transactions;
    private final MongoRoomCommandExceptionClassifier
            transactionExceptionClassifier;
    private final Clock clock;

    public RoomCreationRequestService(
            RoomCreationRequestStore store,
            RoomCreationRequestIdGenerator requestIdGenerator,
            RoomCommandIdGenerator roomIdGenerator,
            RoomCommandFingerprintFactory fingerprintFactory,
            ApprovedRoomCreator approvedRoomCreator,
            RoomCommandPostCommitCoordinator postCommitCoordinator,
            ActiveRoomMembershipQuotaGuard quotaGuard,
            ActiveRoomMembershipQuotaMetrics quotaMetrics,
            RoomMembershipProperties membershipProperties,
            RoomCreationProperties creationProperties,
            RoomCreationRequestCursorCodec cursorCodec,
            AdminRoomCreationRequestCursorCodec adminCursorCodec,
            TransactionOperations transactions,
            MongoRoomCommandExceptionClassifier
                    transactionExceptionClassifier,
            Clock clock
    ) {
        this.store = Objects.requireNonNull(store, "store");
        this.requestIdGenerator = Objects.requireNonNull(
                requestIdGenerator,
                "requestIdGenerator");
        this.roomIdGenerator = Objects.requireNonNull(
                roomIdGenerator,
                "roomIdGenerator");
        this.fingerprintFactory = Objects.requireNonNull(
                fingerprintFactory,
                "fingerprintFactory");
        this.approvedRoomCreator = Objects.requireNonNull(
                approvedRoomCreator,
                "approvedRoomCreator");
        this.postCommitCoordinator = Objects.requireNonNull(
                postCommitCoordinator,
                "postCommitCoordinator");
        this.quotaGuard = Objects.requireNonNull(
                quotaGuard,
                "quotaGuard");
        this.quotaMetrics = Objects.requireNonNull(
                quotaMetrics,
                "quotaMetrics");
        this.membershipProperties = Objects.requireNonNull(
                membershipProperties,
                "membershipProperties");
        this.creationProperties = Objects.requireNonNull(
                creationProperties,
                "creationProperties");
        this.cursorCodec = Objects.requireNonNull(
                cursorCodec,
                "cursorCodec");
        this.adminCursorCodec = Objects.requireNonNull(
                adminCursorCodec,
                "adminCursorCodec");
        this.transactions = Objects.requireNonNull(
                transactions,
                "transactions");
        this.transactionExceptionClassifier = Objects.requireNonNull(
                transactionExceptionClassifier,
                "transactionExceptionClassifier");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public RoomCreationRequestExecution submit(
            CreateRoomCommand command,
            ActiveRoomMembershipLimitMode limitMode
    ) {
        CreateRoomCommand request = Objects.requireNonNull(
                command,
                "command");
        ActiveRoomMembershipLimitMode resolvedLimitMode =
                Objects.requireNonNull(limitMode, "limitMode");
        String fingerprint = fingerprintFactory.create(request);

        RoomCreationRequest existing = store.findByRequest(
                        request.requesterUserId(),
                        request.clientRequestId())
                .orElse(null);
        if (existing != null) {
            requireSameFingerprint(existing, fingerprint);
            return completeSubmission(
                    existing,
                    resolvedLimitMode,
                    true);
        }

        Instant requestedAt = clock.instant();
        requireActiveRoomQuota(
                request.requesterUserId(),
                resolvedLimitMode,
                requestedAt);
        RoomCreationRequest pending = RoomCreationRequest.pending(
                requestIdGenerator.newCreationRequestId(),
                request.clientRequestId(),
                fingerprint,
                request.requesterUserId(),
                request.name(),
                request.description(),
                request.categories(),
                request.visibility(),
                request.joinPolicy(),
                requestedAt);
        RoomCreationRequestInsertResult inserted = store.insertPending(
                pending,
                creationProperties.maxPendingRequestsPerUser());
        if (inserted.outcome()
                == RoomCreationRequestInsertOutcome
                .PENDING_LIMIT_REACHED) {
            throw error(
                    RoomCreationRequestErrorCode
                            .ROOM_CREATION_PENDING_LIMIT_EXCEEDED,
                    "The pending Room creation request limit was exceeded");
        }
        RoomCreationRequest persisted = inserted.request();
        requireSameFingerprint(persisted, fingerprint);
        return completeSubmission(
                persisted,
                resolvedLimitMode,
                inserted.outcome()
                        == RoomCreationRequestInsertOutcome
                        .EXISTING_REQUEST);
    }

    public RoomCreationRequestExecution findOwn(
            String requesterUserId,
            String creationRequestId
    ) {
        return new RoomCreationRequestExecution(
                requireOwn(requesterUserId, creationRequestId),
                false);
    }

    public CursorPage<RoomCreationRequest> findOwn(
            String requesterUserId,
            String cursor,
            int limit
    ) {
        String requester = requireUserId(requesterUserId);
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
        RoomCreationRequestCursor decoded = cursorCodec.decode(
                cursor,
                requester);
        RoomCreationRequestSlice slice = store.findByRequester(
                requester,
                decoded == null ? null : decoded.lastRequestedAt(),
                decoded == null
                        ? null
                        : decoded.lastCreationRequestId(),
                limit);
        String nextCursor = null;
        if (slice.hasNext()) {
            RoomCreationRequest last = slice.items().getLast();
            nextCursor = cursorCodec.encode(
                    new RoomCreationRequestCursor(
                            RoomCreationRequestCursor.CURRENT_VERSION,
                            requester,
                            last.requestedAt(),
                            last.creationRequestId()));
        }
        return new CursorPage<>(
                slice.items(),
                nextCursor,
                slice.hasNext());
    }

    public RoomCreationRequestExecution cancelOwn(
            String requesterUserId,
            String creationRequestId
    ) {
        String requester = requireUserId(requesterUserId);
        for (int attempt = 0;
                attempt < MAX_TRANSITION_ATTEMPTS;
                attempt++) {
            RoomCreationRequest current = requireOwn(
                    requester,
                    creationRequestId);
            if (current.status()
                    == RoomCreationRequestStatus.CANCELED) {
                return new RoomCreationRequestExecution(current, true);
            }
            if (current.status() != RoomCreationRequestStatus.PENDING) {
                throw decisionConflict();
            }
            RoomCreationRequest canceled = current.cancel(
                    clock.instant());
            if (store.replacePendingIfVersionMatches(
                    canceled,
                    current.version())) {
                return new RoomCreationRequestExecution(
                        canceled,
                        false);
            }
        }
        RoomCreationRequest current = requireOwn(
                requester,
                creationRequestId);
        if (current.status() == RoomCreationRequestStatus.CANCELED) {
            return new RoomCreationRequestExecution(current, true);
        }
        throw decisionConflict();
    }

    public RoomCreationRequestExecution findForAdmin(
            String creationRequestId
    ) {
        return new RoomCreationRequestExecution(
                requireAny(creationRequestId),
                false);
    }

    public CursorPage<RoomCreationRequest> findForAdmin(
            RoomCreationRequestStatus status,
            String cursor,
            int limit
    ) {
        RoomCreationRequestStatus requestedStatus =
                Objects.requireNonNull(status, "status");
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
        AdminRoomCreationRequestCursor decoded =
                adminCursorCodec.decode(cursor, requestedStatus);
        RoomCreationRequestSlice slice = store.findByStatus(
                requestedStatus,
                decoded == null ? null : decoded.lastRequestedAt(),
                decoded == null
                        ? null
                        : decoded.lastCreationRequestId(),
                limit);
        String nextCursor = null;
        if (slice.hasNext()) {
            RoomCreationRequest last = slice.items().getLast();
            nextCursor = adminCursorCodec.encode(
                    new AdminRoomCreationRequestCursor(
                            AdminRoomCreationRequestCursor
                                    .CURRENT_VERSION,
                            requestedStatus,
                            last.requestedAt(),
                            last.creationRequestId()));
        }
        return new CursorPage<>(
                slice.items(),
                nextCursor,
                slice.hasNext());
    }

    public RoomCreationRequestExecution approveByAdmin(
            String adminUserId,
            String creationRequestId
    ) {
        String admin = requireUserId(adminUserId);
        RuntimeException lastTransientFailure = null;
        for (int attempt = 0;
                attempt < MAX_TRANSITION_ATTEMPTS;
                attempt++) {
            String roomId = roomIdGenerator.newRoomId();
            String membershipId = roomIdGenerator.newMembershipId();
            Instant approvedAt = clock.instant();
            try {
                DirectApprovalResult result = transactions.execute(
                        status -> approveByAdminInTransaction(
                                admin,
                                creationRequestId,
                                roomId,
                                membershipId,
                                approvedAt));
                DirectApprovalResult approval = Objects.requireNonNull(
                        result,
                        "admin approval result");
                if (approval.quotaExceeded()) {
                    throw error(
                            RoomCreationRequestErrorCode
                                    .USER_ACTIVE_ROOM_LIMIT_EXCEEDED,
                            "The active Room membership limit "
                                    + "was exceeded");
                }
                if (approval.commandExecution() != null) {
                    postCommitCoordinator.afterCommand(
                            approval.commandExecution());
                }
                return new RoomCreationRequestExecution(
                        approval.request(),
                        !approval.transitioned());
            } catch (TransitionRaceException ignored) {
                // Reload and retry only while the request remains pending.
            } catch (RuntimeException exception) {
                if (!retryableTransactionFailure(exception)) {
                    throw exception;
                }
                lastTransientFailure = exception;
            }
            RoomCreationRequest current = requireAny(creationRequestId);
            if (current.status()
                    == RoomCreationRequestStatus.APPROVED) {
                return new RoomCreationRequestExecution(current, true);
            }
            if (current.status() != RoomCreationRequestStatus.PENDING) {
                throw decisionConflict();
            }
        }
        if (lastTransientFailure != null) {
            throw retryExhausted(lastTransientFailure);
        }
        throw decisionConflict();
    }

    public RoomCreationRequestExecution rejectByAdmin(
            String adminUserId,
            String creationRequestId,
            String reason
    ) {
        String admin = requireUserId(adminUserId);
        String rejectionReason =
                RoomCreationRejectionReason.requireValid(reason);
        for (int attempt = 0;
                attempt < MAX_TRANSITION_ATTEMPTS;
                attempt++) {
            RoomCreationRequest current = requireAny(
                    creationRequestId);
            if (current.status()
                    == RoomCreationRequestStatus.REJECTED) {
                if (rejectionReason.equals(
                        current.rejectionReason())) {
                    return new RoomCreationRequestExecution(
                            current,
                            true);
                }
                throw decisionConflict();
            }
            if (current.status() != RoomCreationRequestStatus.PENDING) {
                throw decisionConflict();
            }
            RoomCreationRequest rejected = current.reject(
                    admin,
                    rejectionReason,
                    clock.instant());
            if (store.replacePendingIfVersionMatches(
                    rejected,
                    current.version())) {
                return new RoomCreationRequestExecution(
                        rejected,
                        false);
            }
        }
        RoomCreationRequest current = requireAny(creationRequestId);
        if (current.status() == RoomCreationRequestStatus.REJECTED
                && rejectionReason.equals(
                        current.rejectionReason())) {
            return new RoomCreationRequestExecution(current, true);
        }
        throw decisionConflict();
    }

    private RoomCreationRequestExecution completeSubmission(
            RoomCreationRequest request,
            ActiveRoomMembershipLimitMode limitMode,
            boolean replayed
    ) {
        if (creationProperties.approvalRequired()
                || request.status()
                != RoomCreationRequestStatus.PENDING) {
            return new RoomCreationRequestExecution(
                    request,
                    replayed);
        }
        DirectApprovalResult approval = approveAutomatically(
                request,
                limitMode);
        if (approval.quotaExceeded()) {
            throw error(
                    RoomCreationRequestErrorCode
                            .USER_ACTIVE_ROOM_LIMIT_EXCEEDED,
                    "The active Room membership limit was exceeded");
        }
        if (approval.commandExecution() != null) {
            postCommitCoordinator.afterCommand(
                    approval.commandExecution());
        }
        return new RoomCreationRequestExecution(
                approval.request(),
                replayed || !approval.transitioned());
    }

    private DirectApprovalResult approveAutomatically(
            RoomCreationRequest submitted,
            ActiveRoomMembershipLimitMode limitMode
    ) {
        RuntimeException lastTransientFailure = null;
        for (int attempt = 0;
                attempt < MAX_TRANSITION_ATTEMPTS;
                attempt++) {
            String roomId = roomIdGenerator.newRoomId();
            String membershipId = roomIdGenerator.newMembershipId();
            Instant approvedAt = clock.instant();
            try {
                DirectApprovalResult result = transactions.execute(
                        status -> approveAutomaticallyInTransaction(
                                submitted.creationRequestId(),
                                roomId,
                                membershipId,
                                approvedAt,
                                limitMode));
                return Objects.requireNonNull(
                        result,
                        "automatic approval result");
            } catch (TransitionRaceException ignored) {
                // Reload and retry only while the request remains pending.
            } catch (RuntimeException exception) {
                if (!retryableTransactionFailure(exception)) {
                    throw exception;
                }
                lastTransientFailure = exception;
            }
            RoomCreationRequest current = requireOwn(
                    submitted.requesterUserId(),
                    submitted.creationRequestId());
            if (current.status()
                    != RoomCreationRequestStatus.PENDING) {
                return DirectApprovalResult.existing(current);
            }
        }
        if (lastTransientFailure != null) {
            throw retryExhausted(lastTransientFailure);
        }
        throw decisionConflict();
    }

    private DirectApprovalResult approveAutomaticallyInTransaction(
            String creationRequestId,
            String roomId,
            String membershipId,
            Instant approvedAt,
            ActiveRoomMembershipLimitMode limitMode
    ) {
        RoomCreationRequest current = store.findById(creationRequestId)
                .orElseThrow(() -> error(
                        RoomCreationRequestErrorCode
                                .ROOM_CREATION_REQUEST_NOT_FOUND,
                        "The Room creation request was not found"));
        if (current.status() != RoomCreationRequestStatus.PENDING) {
            return DirectApprovalResult.existing(current);
        }
        ApprovedRoomCreationResult creation = approvedRoomCreator.create(
                new ApprovedRoomCreation(
                        roomId,
                        membershipId,
                        current.requesterUserId(),
                        current.name(),
                        current.description(),
                        current.categories(),
                        current.visibility(),
                        current.joinPolicy(),
                        approvedAt,
                        limitMode));
        if (creation.outcome()
                == ApprovedRoomCreationOutcome
                .USER_ACTIVE_ROOM_LIMIT_EXCEEDED) {
            return DirectApprovalResult.quotaExceeded(current);
        }
        RoomCreationResult roomCreation = creation.creation();
        RoomCreationRequest approved = current.approveAutomatically(
                roomCreation.room().roomId(),
                roomCreation.ownerMembership().membershipId(),
                roomCreation.room().version(),
                roomCreation.ownerMembership().version(),
                approvedAt);
        if (!store.replacePendingIfVersionMatches(
                approved,
                current.version())) {
            throw new TransitionRaceException();
        }
        RoomCommandExecution commandExecution =
                new RoomCommandExecution(
                        current.clientRequestId(),
                        RoomCommandResult.created(
                                roomCreation.room(),
                                roomCreation.ownerMembership()),
                        false);
        return DirectApprovalResult.transitioned(
                approved,
                commandExecution);
    }

    private DirectApprovalResult approveByAdminInTransaction(
            String adminUserId,
            String creationRequestId,
            String roomId,
            String membershipId,
            Instant approvedAt
    ) {
        RoomCreationRequest current = requireAny(creationRequestId);
        if (current.status()
                == RoomCreationRequestStatus.APPROVED) {
            return DirectApprovalResult.existing(current);
        }
        if (current.status() != RoomCreationRequestStatus.PENDING) {
            throw decisionConflict();
        }
        ApprovedRoomCreationResult creation = approvedRoomCreator.create(
                new ApprovedRoomCreation(
                        roomId,
                        membershipId,
                        current.requesterUserId(),
                        current.name(),
                        current.description(),
                        current.categories(),
                        current.visibility(),
                        current.joinPolicy(),
                        approvedAt,
                        ActiveRoomMembershipLimitMode.ENFORCED));
        if (creation.outcome()
                == ApprovedRoomCreationOutcome
                .USER_ACTIVE_ROOM_LIMIT_EXCEEDED) {
            return DirectApprovalResult.quotaExceeded(current);
        }
        RoomCreationResult roomCreation = creation.creation();
        RoomCreationRequest approved = current.approveByAdmin(
                adminUserId,
                roomCreation.room().roomId(),
                roomCreation.ownerMembership().membershipId(),
                roomCreation.room().version(),
                roomCreation.ownerMembership().version(),
                approvedAt);
        if (!store.replacePendingIfVersionMatches(
                approved,
                current.version())) {
            throw new TransitionRaceException();
        }
        RoomCommandExecution commandExecution =
                new RoomCommandExecution(
                        current.clientRequestId(),
                        RoomCommandResult.created(
                                roomCreation.room(),
                                roomCreation.ownerMembership()),
                        false);
        return DirectApprovalResult.transitioned(
                approved,
                commandExecution);
    }

    private void requireActiveRoomQuota(
            String requesterUserId,
            ActiveRoomMembershipLimitMode limitMode,
            Instant requestedAt
    ) {
        if (limitMode == ActiveRoomMembershipLimitMode.EXEMPT) {
            quotaMetrics.recordExempted(RoomCommandType.CREATE_ROOM);
            return;
        }
        ActiveRoomMembershipQuotaDecision decision = null;
        RuntimeException lastTransientFailure = null;
        for (int attempt = 0;
                attempt < MAX_TRANSITION_ATTEMPTS;
                attempt++) {
            try {
                decision = transactions.execute(
                        status -> quotaMetrics.recordCheck(
                                RoomCommandType.CREATE_ROOM,
                                () -> quotaGuard.checkBeforeIncrease(
                                        requesterUserId,
                                        membershipProperties
                                                .maxActiveRoomsPerUser(),
                                        requestedAt)));
                break;
            } catch (RuntimeException exception) {
                if (!retryableTransactionFailure(exception)) {
                    throw exception;
                }
                lastTransientFailure = exception;
            }
        }
        if (decision == null && lastTransientFailure != null) {
            throw retryExhausted(lastTransientFailure);
        }
        Objects.requireNonNull(decision, "quota decision");
        if (decision
                == ActiveRoomMembershipQuotaDecision.LIMIT_REACHED) {
            throw error(
                    RoomCreationRequestErrorCode
                            .USER_ACTIVE_ROOM_LIMIT_EXCEEDED,
                    "The active Room membership limit was exceeded");
        }
    }

    private RoomCreationRequest requireOwn(
            String requesterUserId,
            String creationRequestId
    ) {
        String requester = requireUserId(requesterUserId);
        if (creationRequestId == null
                || creationRequestId.isBlank()) {
            throw notFound();
        }
        RoomCreationRequest request = store.findById(
                        creationRequestId)
                .orElseThrow(RoomCreationRequestService::notFound);
        if (!request.requesterUserId().equals(requester)) {
            throw notFound();
        }
        return request;
    }

    private RoomCreationRequest requireAny(String creationRequestId) {
        if (creationRequestId == null
                || creationRequestId.isBlank()) {
            throw notFound();
        }
        return store.findById(creationRequestId)
                .orElseThrow(RoomCreationRequestService::notFound);
    }

    private static void requireSameFingerprint(
            RoomCreationRequest request,
            String expectedFingerprint
    ) {
        if (!request.requestFingerprint().equals(
                expectedFingerprint)) {
            throw error(
                    RoomCreationRequestErrorCode.IDEMPOTENCY_CONFLICT,
                    "The Idempotency-Key was already used for a "
                            + "different Room creation request");
        }
    }

    private boolean retryableTransactionFailure(
            RuntimeException exception
    ) {
        return transactionExceptionClassifier.isTransient(exception)
                || transactionExceptionClassifier
                        .isUnknownCommitResult(exception);
    }

    private static RoomCommandExecutionException retryExhausted(
            RuntimeException cause
    ) {
        return new RoomCommandExecutionException(
                RoomCommandFailureKind.CONCURRENCY_RETRY_EXHAUSTED,
                "Room creation request transaction retries exhausted",
                cause);
    }

    private static String requireUserId(String requesterUserId) {
        if (requesterUserId == null || requesterUserId.isBlank()) {
            throw new IllegalArgumentException(
                    "requesterUserId must not be blank");
        }
        return requesterUserId;
    }

    private static RoomCreationRequestException notFound() {
        return error(
                RoomCreationRequestErrorCode
                        .ROOM_CREATION_REQUEST_NOT_FOUND,
                "The Room creation request was not found");
    }

    private static RoomCreationRequestException decisionConflict() {
        return error(
                RoomCreationRequestErrorCode
                        .ROOM_CREATION_DECISION_CONFLICT,
                "The Room creation request was already resolved");
    }

    private static RoomCreationRequestException error(
            RoomCreationRequestErrorCode code,
            String message
    ) {
        return new RoomCreationRequestException(code, message);
    }

    private record DirectApprovalResult(
            RoomCreationRequest request,
            RoomCommandExecution commandExecution,
            boolean transitioned,
            boolean quotaExceeded
    ) {

        private DirectApprovalResult {
            Objects.requireNonNull(request, "request");
        }

        private static DirectApprovalResult transitioned(
                RoomCreationRequest request,
                RoomCommandExecution execution
        ) {
            return new DirectApprovalResult(
                    request,
                    Objects.requireNonNull(execution, "execution"),
                    true,
                    false);
        }

        private static DirectApprovalResult existing(
                RoomCreationRequest request
        ) {
            return new DirectApprovalResult(
                    request,
                    null,
                    false,
                    false);
        }

        private static DirectApprovalResult quotaExceeded(
                RoomCreationRequest request
        ) {
            return new DirectApprovalResult(
                    request,
                    null,
                    false,
                    true);
        }
    }

    private static final class TransitionRaceException
            extends RuntimeException {
    }
}
