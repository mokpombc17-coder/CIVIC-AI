package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.constraints.AssertTrue;

public record UnbanMemberRequest(
        String targetUserId,
        String targetMembershipId
) {

    @AssertTrue(message = "exactly one target identity must be provided")
    public boolean isTargetIdentityValid() {
        return isValidExclusiveTarget(targetUserId, targetMembershipId);
    }

    private static boolean isValidExclusiveTarget(
            String userId,
            String membershipId
    ) {
        if ((userId != null && userId.isBlank())
                || (membershipId != null && membershipId.isBlank())) {
            return false;
        }
        return (userId != null) != (membershipId != null);
    }
}
