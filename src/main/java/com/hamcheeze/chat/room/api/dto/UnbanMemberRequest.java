package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.constraints.NotBlank;

public record UnbanMemberRequest(
        @NotBlank String targetUserId
) {
}
