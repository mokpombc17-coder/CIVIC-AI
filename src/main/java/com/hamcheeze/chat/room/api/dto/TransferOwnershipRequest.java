package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.constraints.NotBlank;

public record TransferOwnershipRequest(
        @NotBlank String targetUserId
) {
}
