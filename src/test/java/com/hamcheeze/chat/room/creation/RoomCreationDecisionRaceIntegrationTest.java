package com.hamcheeze.chat.room.creation;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.ActiveRoomMembershipLimitMode;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties =
        "chat.room.creation.mode=APPROVAL_REQUIRED")
@ActiveProfiles("local")
class RoomCreationDecisionRaceIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private RoomCreationRequestService service;

    @Test
    void concurrentApprovalsCreateExactlyOneRoomAndReplayTheOther()
            throws Exception {
        String requestId = pending("approval-race-user");

        List<DecisionAttempt> attempts = race(
                () -> service.approveByAdmin(
                        "admin-1",
                        requestId),
                () -> service.approveByAdmin(
                        "admin-2",
                        requestId));

        assertThat(attempts)
                .allSatisfy(attempt -> {
                    assertThat(attempt.errorCode()).isNull();
                    assertThat(attempt.execution()).isNotNull();
                    assertThat(attempt.execution().request().status())
                            .isEqualTo(
                                    RoomCreationRequestStatus.APPROVED);
                });
        assertThat(attempts)
                .extracting(attempt -> attempt.execution().replayed())
                .containsExactlyInAnyOrder(false, true);
        assertExactlyOneApprovedRoom(requestId);
    }

    @Test
    void approvalAndRejectionRaceCommitsOnlyOneTerminalDecision()
            throws Exception {
        String requestId = pending("approve-reject-race-user");

        List<DecisionAttempt> attempts = race(
                () -> service.approveByAdmin(
                        "admin-1",
                        requestId),
                () -> service.rejectByAdmin(
                        "admin-2",
                        requestId,
                        "승인 요건 미충족"));

        assertOneSuccessAndOneConflict(attempts);
        RoomCreationRequest request = service.findForAdmin(requestId)
                .request();
        if (request.status()
                == RoomCreationRequestStatus.APPROVED) {
            assertExactlyOneApprovedRoom(requestId);
        } else {
            assertThat(request.status())
                    .isEqualTo(RoomCreationRequestStatus.REJECTED);
            assertNoApprovedRoom();
        }
    }

    @Test
    void approvalAndCancellationRaceNeverLeavesAnOrphanRoom()
            throws Exception {
        String requester = "approve-cancel-race-user";
        String requestId = pending(requester);

        List<DecisionAttempt> attempts = race(
                () -> service.approveByAdmin(
                        "admin-1",
                        requestId),
                () -> service.cancelOwn(requester, requestId));

        assertOneSuccessAndOneConflict(attempts);
        RoomCreationRequest request = service.findForAdmin(requestId)
                .request();
        if (request.status()
                == RoomCreationRequestStatus.APPROVED) {
            assertExactlyOneApprovedRoom(requestId);
        } else {
            assertThat(request.status())
                    .isEqualTo(RoomCreationRequestStatus.CANCELED);
            assertNoApprovedRoom();
        }
    }

    @Test
    void concurrentSameReasonRejectionsReplayWithoutChangingReason()
            throws Exception {
        String requestId = pending("rejection-race-user");

        List<DecisionAttempt> attempts = race(
                () -> service.rejectByAdmin(
                        "admin-1",
                        requestId,
                        "동일한 반려 사유"),
                () -> service.rejectByAdmin(
                        "admin-2",
                        requestId,
                        "동일한 반려 사유"));

        assertThat(attempts)
                .allSatisfy(attempt -> {
                    assertThat(attempt.errorCode()).isNull();
                    assertThat(attempt.execution()).isNotNull();
                    assertThat(attempt.execution().request().status())
                            .isEqualTo(
                                    RoomCreationRequestStatus.REJECTED);
                    assertThat(attempt.execution().request()
                            .rejectionReason())
                            .isEqualTo("동일한 반려 사유");
                });
        assertThat(attempts)
                .extracting(attempt -> attempt.execution().replayed())
                .containsExactlyInAnyOrder(false, true);
        assertNoApprovedRoom();
    }

    private String pending(String requesterUserId) {
        RoomCreationRequestExecution execution = service.submit(
                new CreateRoomCommand(
                        requesterUserId,
                        UUID.randomUUID().toString(),
                        "승인 경합 테스트",
                        "결정 경합 중 하나의 상태만 저장되어야 합니다.",
                        List.of(RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN),
                ActiveRoomMembershipLimitMode.ENFORCED);
        assertThat(execution.request().status())
                .isEqualTo(RoomCreationRequestStatus.PENDING);
        return execution.request().creationRequestId();
    }

    private List<DecisionAttempt> race(
            Supplier<RoomCreationRequestExecution> first,
            Supplier<RoomCreationRequestExecution> second
    ) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<DecisionAttempt> firstFuture = executor.submit(
                    () -> attempt(ready, start, first));
            Future<DecisionAttempt> secondFuture = executor.submit(
                    () -> attempt(ready, start, second));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(
                    firstFuture.get(30, TimeUnit.SECONDS),
                    secondFuture.get(30, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }
    }

    private static DecisionAttempt attempt(
            CountDownLatch ready,
            CountDownLatch start,
            Supplier<RoomCreationRequestExecution> action
    ) {
        ready.countDown();
        try {
            if (!start.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException(
                        "decision race start timed out");
            }
            return DecisionAttempt.succeeded(action.get());
        } catch (RoomCreationRequestException exception) {
            return DecisionAttempt.failed(exception.code());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "decision race was interrupted",
                    exception);
        }
    }

    private void assertOneSuccessAndOneConflict(
            List<DecisionAttempt> attempts
    ) {
        assertThat(attempts)
                .filteredOn(attempt -> attempt.execution() != null)
                .hasSize(1);
        assertThat(attempts)
                .extracting(DecisionAttempt::errorCode)
                .containsExactlyInAnyOrder(
                        null,
                        RoomCreationRequestErrorCode
                                .ROOM_CREATION_DECISION_CONFLICT);
    }

    private void assertExactlyOneApprovedRoom(String requestId) {
        RoomCreationRequest request = service.findForAdmin(requestId)
                .request();
        assertThat(request.status())
                .isEqualTo(RoomCreationRequestStatus.APPROVED);
        assertThat(mongoOperations.count(
                new Query(),
                MongoRoomDocument.COLLECTION_NAME)).isEqualTo(1);
        assertThat(mongoOperations.count(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME)).isEqualTo(1);
        assertThat(roomStore.findById(request.approvedRoomId()))
                .isPresent();
        assertThat(membershipStore.findById(
                request.ownerMembershipId())).isPresent();
    }

    private void assertNoApprovedRoom() {
        assertThat(mongoOperations.count(
                new Query(),
                MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(mongoOperations.count(
                new Query(),
                MongoMembershipDocument.COLLECTION_NAME)).isZero();
    }

    private record DecisionAttempt(
            RoomCreationRequestExecution execution,
            RoomCreationRequestErrorCode errorCode
    ) {

        private static DecisionAttempt succeeded(
                RoomCreationRequestExecution execution
        ) {
            return new DecisionAttempt(execution, null);
        }

        private static DecisionAttempt failed(
                RoomCreationRequestErrorCode errorCode
        ) {
            return new DecisionAttempt(null, errorCode);
        }
    }
}
