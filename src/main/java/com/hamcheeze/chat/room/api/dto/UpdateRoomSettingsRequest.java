package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategories;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

public record UpdateRoomSettingsRequest(
        boolean namePresent,
        String name,
        boolean descriptionPresent,
        String description,
        boolean categoriesPresent,
        List<RoomCategory> categories,
        boolean visibilityPresent,
        RoomVisibility visibility,
        boolean joinPolicyPresent,
        JoinPolicy joinPolicy
) {

    public static UpdateRoomSettingsRequest from(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new IllegalArgumentException(
                    "request body must be an object");
        }
        boolean namePresent = body.has("name");
        boolean descriptionPresent = body.has("description");
        boolean categoriesPresent = body.has("categories");
        boolean visibilityPresent = body.has("visibility");
        boolean joinPolicyPresent = body.has("joinPolicy");
        int knownFields = (namePresent ? 1 : 0)
                + (descriptionPresent ? 1 : 0)
                + (categoriesPresent ? 1 : 0)
                + (visibilityPresent ? 1 : 0)
                + (joinPolicyPresent ? 1 : 0);
        if (knownFields == 0 || body.size() != knownFields) {
            throw new IllegalArgumentException(
                    "settings patch is empty or has unknown fields");
        }
        return new UpdateRoomSettingsRequest(
                namePresent,
                namePresent ? text(body, "name") : null,
                descriptionPresent,
                descriptionPresent
                        ? text(body, "description")
                        : null,
                categoriesPresent,
                categoriesPresent
                        ? categories(body)
                        : null,
                visibilityPresent,
                visibilityPresent
                        ? enumValue(
                                body,
                                "visibility",
                                RoomVisibility.class)
                        : null,
                joinPolicyPresent,
                joinPolicyPresent
                        ? enumValue(
                                body,
                                "joinPolicy",
                                JoinPolicy.class)
                        : null);
    }

    private static List<RoomCategory> categories(JsonNode body) {
        JsonNode value = body.get("categories");
        if (value == null || !value.isArray()) {
            throw new IllegalArgumentException(
                    "categories must be an array");
        }
        List<RoomCategory> categories = new ArrayList<>();
        for (JsonNode item : value) {
            if (!item.isTextual()) {
                throw new IllegalArgumentException(
                        "categories must contain strings");
            }
            try {
                categories.add(RoomCategory.valueOf(item.textValue()));
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException(
                        "categories has an invalid value",
                        exception);
            }
        }
        return RoomCategories.requireValid(categories);
    }

    private static String text(
            JsonNode body,
            String fieldName
    ) {
        JsonNode value = body.get(fieldName);
        if (value == null || !value.isTextual()) {
            throw new IllegalArgumentException(
                    fieldName + " must be a string");
        }
        return value.textValue();
    }

    private static <E extends Enum<E>> E enumValue(
            JsonNode body,
            String fieldName,
            Class<E> enumType
    ) {
        try {
            return Enum.valueOf(
                    enumType,
                    text(body, fieldName));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    fieldName + " has an invalid value",
                    exception);
        }
    }
}
