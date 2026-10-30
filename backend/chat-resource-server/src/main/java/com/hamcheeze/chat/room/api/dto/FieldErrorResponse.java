package com.hamcheeze.chat.room.api.dto;

public record FieldErrorResponse(
        String field,
        String message
) {
}
