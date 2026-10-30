package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;

import java.util.Objects;

public final class ListedRoomQueryCriteriaResolver {

    public ListedRoomQueryCriteria resolve(
            HttpServletRequest request
    ) {
        HttpServletRequest resolved = Objects.requireNonNull(
                request,
                "request");
        String query = singleParameter(resolved, "query");
        rejectLegacyCategoryParameter(resolved);
        String categoryId = singleParameter(resolved, "categoryId");
        JoinPolicy joinPolicy = enumParameter(
                resolved,
                "joinPolicy",
                JoinPolicy.class);
        try {
            return new ListedRoomQueryCriteria(
                    query,
                    categoryId,
                    joinPolicy);
        } catch (IllegalArgumentException exception) {
            throw invalidRequest(
                    "query has an invalid format");
        }
    }

    private void rejectLegacyCategoryParameter(
            HttpServletRequest request
    ) {
        if (request.getParameterMap().containsKey("category")) {
            throw invalidRequest(
                    "category is no longer supported; use categoryId");
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
            throw invalidRequest(
                    name + " has an invalid value");
        }
    }

    private RoomApiInputException invalidRequest(String message) {
        return new RoomApiInputException(
                RoomApiErrorCode.INVALID_REQUEST,
                HttpStatus.BAD_REQUEST,
                message);
    }
}
