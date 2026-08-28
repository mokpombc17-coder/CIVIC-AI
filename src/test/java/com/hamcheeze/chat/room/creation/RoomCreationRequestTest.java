package com.hamcheeze.chat.room.creation;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCreationRequestTest {

    private static final Instant REQUESTED_AT =
            Instant.parse("2026-08-25T01:00:00Z");

    @Test
    void createsCanonicalPendingRequest() {
        RoomCreationRequest request = pending();

        assertThat(request.creationRequestId())
                .isEqualTo("request-1");
        assertThat(request.name()).isEqualTo("정책 토론");
        assertThat(request.description()).isEqualTo("설명");
        assertThat(request.status())
                .isEqualTo(RoomCreationRequestStatus.PENDING);
        assertThat(request.requestedAt()).isEqualTo(REQUESTED_AT);
        assertThat(request.resolvedAt()).isNull();
        assertThat(request.decisionActorType()).isNull();
        assertThat(request.approvedRoomId()).isNull();
        assertThat(request.version()).isZero();
    }

    @Test
    void approvesByAdminAndSystemWithAllocatedRoomIdentity() {
        RoomCreationRequest adminApproved = pending().approveByAdmin(
                "admin-1",
                List.of(RoomCategoryDefaults.POLICY_CATEGORY_ID),
                "room-1",
                "membership-1",
                0,
                0,
                REQUESTED_AT.plusSeconds(10));
        RoomCreationRequest autoApproved = pending()
                .approveAutomatically(
                        List.of(RoomCategoryDefaults.POLICY_CATEGORY_ID),
                        "room-2",
                        "membership-2",
                        0,
                        0,
                        REQUESTED_AT);

        assertThat(adminApproved.status())
                .isEqualTo(RoomCreationRequestStatus.APPROVED);
        assertThat(adminApproved.decisionActorType())
                .isEqualTo(RoomCreationDecisionActorType.ADMIN);
        assertThat(adminApproved.decidedByAdminId())
                .isEqualTo("admin-1");
        assertThat(adminApproved.approvedRoomId())
                .isEqualTo("room-1");
        assertThat(adminApproved.version()).isEqualTo(1);
        assertThat(autoApproved.decisionActorType())
                .isEqualTo(
                        RoomCreationDecisionActorType
                                .SYSTEM_AUTO_APPROVAL);
        assertThat(autoApproved.decidedByAdminId()).isNull();
    }

    @Test
    void rejectsWithCanonicalReasonAndCancelsByRequester() {
        RoomCreationRequest rejected = pending().reject(
                "admin-1",
                "  생성 목적을 확인할 수 없습니다.  ",
                REQUESTED_AT.plusSeconds(20));
        RoomCreationRequest canceled = pending().cancel(
                REQUESTED_AT.plusSeconds(30));

        assertThat(rejected.status())
                .isEqualTo(RoomCreationRequestStatus.REJECTED);
        assertThat(rejected.decisionActorType())
                .isEqualTo(RoomCreationDecisionActorType.ADMIN);
        assertThat(rejected.rejectionReason())
                .isEqualTo("생성 목적을 확인할 수 없습니다.");
        assertThat(canceled.status())
                .isEqualTo(RoomCreationRequestStatus.CANCELED);
        assertThat(canceled.decisionActorType())
                .isEqualTo(RoomCreationDecisionActorType.REQUESTER);
        assertThat(canceled.rejectionReason()).isNull();
    }

    @Test
    void refusesTerminalTransitionAndBackdatedResolution() {
        RoomCreationRequest rejected = pending().reject(
                "admin-1",
                "요건 미충족",
                REQUESTED_AT);

        assertThatThrownBy(() -> rejected.cancel(
                REQUESTED_AT.plusSeconds(1)))
                .isInstanceOf(
                        RoomCreationRequestDomainException.class)
                .extracting(exception ->
                        ((RoomCreationRequestDomainException)
                                exception).code())
                .isEqualTo(
                        RoomCreationRequestDomainErrorCode
                                .INVALID_TRANSITION);
        assertThatThrownBy(() -> pending().cancel(
                REQUESTED_AT.minusNanos(1)))
                .isInstanceOf(
                        RoomCreationRequestDomainException.class);
    }

    @Test
    void restoreRejectsImpossibleState() {
        assertThatThrownBy(() -> RoomCreationRequest.restore(
                "request-1",
                "00000000-0000-0000-0000-000000000001",
                "sha256:" + "a".repeat(64),
                "user-1",
                "정책 토론",
                "",
                List.of(RoomCategoryDefaults.POLICY_CATEGORY_ID),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                RoomCreationRequestStatus.APPROVED,
                REQUESTED_AT,
                REQUESTED_AT,
                RoomCreationDecisionActorType.ADMIN,
                "admin-1",
                null,
                null,
                null,
                null,
                null,
                1))
                .isInstanceOf(
                        RoomCreationRequestDomainException.class)
                .extracting(exception ->
                        ((RoomCreationRequestDomainException)
                                exception).code())
                .isEqualTo(
                        RoomCreationRequestDomainErrorCode
                                .INVALID_STATE);
    }

    private static RoomCreationRequest pending() {
        return RoomCreationRequest.pending(
                "request-1",
                "00000000-0000-0000-0000-000000000001",
                "sha256:" + "a".repeat(64),
                "user-1",
                "  정책 토론  ",
                "  설명  ",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                REQUESTED_AT);
    }
}
