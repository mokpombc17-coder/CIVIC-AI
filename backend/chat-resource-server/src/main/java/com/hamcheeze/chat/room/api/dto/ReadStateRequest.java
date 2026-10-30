package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ReadStateRequest(
        @NotNull
        @Min(0)
        Long throughSequence
) {
}
