package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.constraints.NotBlank;

public record BanMemberRequest(
        @NotBlank String targetUserId
) {
}
