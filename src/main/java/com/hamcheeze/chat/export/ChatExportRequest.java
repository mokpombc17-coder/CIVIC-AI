package com.hamcheeze.chat.export;

import jakarta.validation.constraints.NotNull;

public record ChatExportRequest(
        @NotNull ChatExportMode mode
) {
}
