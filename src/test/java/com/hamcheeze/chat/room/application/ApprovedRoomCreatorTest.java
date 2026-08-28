package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("local")
class ApprovedRoomCreatorTest extends MongoRuntimeIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-25T03:00:00Z");

    @Autowired
    private ApprovedRoomCreator creator;

    @Autowired
    @Qualifier("mongoTransactionTemplate")
    private TransactionOperations transactionOperations;

    @Test
    void createsActiveRoomAndOwnerInCallerTransaction() {
        ApprovedRoomCreationResult result = create(
                approvedRoom(
                        "room-approved",
                        "membership-approved",
                        "user-1",
                        ActiveRoomMembershipLimitMode.ENFORCED));

        assertThat(result.outcome())
                .isEqualTo(ApprovedRoomCreationOutcome.CREATED);
        assertThat(result.creation().room().status())
                .isEqualTo(RoomStatus.ACTIVE);
        assertThat(result.creation().ownerMembership().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(result.creation().ownerMembership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(roomStore.findById("room-approved"))
                .hasValueSatisfying(room -> {
                    assertThat(room.ownerUserId()).isEqualTo("user-1");
                    assertThat(room.ownerMembershipId())
                            .isEqualTo("membership-approved");
                });
        assertThat(membershipStore.findById("membership-approved"))
                .hasValueSatisfying(membership -> {
                    assertThat(membership.roomId())
                            .isEqualTo("room-approved");
                    assertThat(membership.userId())
                            .isEqualTo("user-1");
                });
    }

    @Test
    void refusesToCreateOutsideTransaction() {
        assertThatThrownBy(() -> creator.create(approvedRoom(
                "room-no-transaction",
                "membership-no-transaction",
                "user-1",
                ActiveRoomMembershipLimitMode.ENFORCED)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("requires a transaction");

        assertThat(roomStore.findById("room-no-transaction"))
                .isEmpty();
        assertThat(membershipStore.findById(
                "membership-no-transaction")).isEmpty();
    }

    @Test
    void callerRollbackRemovesBothRoomAndMembership() {
        assertThatThrownBy(() -> transactionOperations.execute(status -> {
            creator.create(approvedRoom(
                    "room-rollback",
                    "membership-rollback",
                    "user-1",
                    ActiveRoomMembershipLimitMode.ENFORCED));
            throw new IllegalStateException("forced rollback");
        })).isInstanceOf(IllegalStateException.class)
                .hasMessage("forced rollback");

        assertThat(roomStore.findById("room-rollback")).isEmpty();
        assertThat(membershipStore.findById("membership-rollback"))
                .isEmpty();
    }

    @Test
    void enforcedQuotaRejectsWithoutCreatingDocuments() {
        for (int index = 0; index < 20; index++) {
            seedActiveRoom("existing-room-" + index, "quota-user");
        }

        ApprovedRoomCreationResult result = create(approvedRoom(
                "room-over-quota",
                "membership-over-quota",
                "quota-user",
                ActiveRoomMembershipLimitMode.ENFORCED));

        assertThat(result.outcome()).isEqualTo(
                ApprovedRoomCreationOutcome
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(result.creation()).isNull();
        assertThat(roomStore.findById("room-over-quota")).isEmpty();
        assertThat(membershipStore.findById(
                "membership-over-quota")).isEmpty();
    }

    @Test
    void explicitExemptionBypassesQuota() {
        for (int index = 0; index < 20; index++) {
            seedActiveRoom("exempt-room-" + index, "exempt-user");
        }

        ApprovedRoomCreationResult result = create(approvedRoom(
                "room-exempted",
                "membership-exempted",
                "exempt-user",
                ActiveRoomMembershipLimitMode.EXEMPT));

        assertThat(result.outcome())
                .isEqualTo(ApprovedRoomCreationOutcome.CREATED);
        assertThat(roomStore.findById("room-exempted")).isPresent();
    }

    private ApprovedRoomCreationResult create(
            ApprovedRoomCreation request
    ) {
        return transactionOperations.execute(status ->
                creator.create(request));
    }

    private static ApprovedRoomCreation approvedRoom(
            String roomId,
            String membershipId,
            String userId,
            ActiveRoomMembershipLimitMode limitMode
    ) {
        return new ApprovedRoomCreation(
                roomId,
                membershipId,
                userId,
                "정책 토론",
                "설명",
                List.of(RoomCategoryDefaults.POLICY_CATEGORY_ID),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                CREATED_AT,
                limitMode);
    }
}
