package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.AdminRoomQueryCriteria;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Objects;

public final class AdminRoomQueryCriteriaResolver {

    public AdminRoomQueryCriteria resolve(HttpServletRequest request) {
        HttpServletRequest resolved = Objects.requireNonNull(
                request,
                "request");
        String query = singleParameter(resolved, "query");
        String categoryId = singleParameter(resolved, "categoryId");
        RoomStatus status = enumParameter(
                resolved,
                "status",
                RoomStatus.class);
        RoomVisibility visibility = enumParameter(
                resolved,
                "visibility",
                RoomVisibility.class);
        try {
            return new AdminRoomQueryCriteria(
                    query,
                    categoryId,
                    status,
                    visibility);
        } catch (IllegalArgumentException exception) {
            throw invalidRequest("query has an invalid format");
        }
    }

    private String singleParameter(
            HttpServletRequest request,
            String name
    ) {
        String[] values = request.getParameterValues(name);
        if (values == null) {
            return null;
        }
        if (values.length != 1) {
            throw invalidRequest(
                    name + " must be provided at most once");
        }
        return values[0];
    }

    private <E extends Enum<E>> E enumParameter(
            HttpServletRequest request,
            String name,
            Class<E> enumType
    ) {
        String value = singleParameter(request, name);
        if (value == null) {
            return null;
        }
        try {
            return Enum.valueOf(enumType, value);
        } catch (IllegalArgumentException exception) {
            throw invalidRequest(name + " has an invalid value");
        }
    }

    private RoomApiInputException invalidRequest(String message) {
        return new RoomApiInputException(
                RoomApiErrorCode.INVALID_REQUEST,
                org.springframework.http.HttpStatus.BAD_REQUEST,
                message);
    }
}
