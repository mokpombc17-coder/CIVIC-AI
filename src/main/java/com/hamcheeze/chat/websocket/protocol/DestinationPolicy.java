package com.hamcheeze.chat.websocket.protocol;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.regex.Pattern;

@Component
public final class DestinationPolicy {

    private static final String APP_PREFIX = "/app/rooms/";
    private static final String TOPIC_PREFIX = "/topic/rooms/";

    private final Pattern roomIdPattern;

    public DestinationPolicy(ChatContentProperties properties) {
        this.roomIdPattern = Pattern.compile(properties.getRoomIdRegex());
    }

    public DestinationDescriptor classify(String destination) {
        if (destination == null || destination.isBlank() || containsWildcard(destination)) {
            return invalid(destination);
        }
        if (Objects.equals(destination, "/user/queue/command-results")) {
            return new DestinationDescriptor(
                    DestinationKind.USER_COMMAND_RESULTS, destination, null);
        }
        if (Objects.equals(destination, "/user/queue/system-events")) {
            return new DestinationDescriptor(
                    DestinationKind.USER_SYSTEM_EVENTS, destination, null);
        }
        if (Objects.equals(
                destination,
                "/user/queue/room-inbox-events")) {
            return new DestinationDescriptor(
                    DestinationKind.USER_ROOM_INBOX_EVENTS,
                    destination,
                    null);
        }
        if (destination.startsWith(APP_PREFIX)) {
            DestinationDescriptor edit = roomDestination(
                    destination, APP_PREFIX, "/messages/edit",
                    DestinationKind.APP_ROOM_MESSAGE_EDIT);
            if (edit.kind() != DestinationKind.INVALID) {
                return edit;
            }
            DestinationDescriptor delete = roomDestination(
                    destination, APP_PREFIX, "/messages/delete",
                    DestinationKind.APP_ROOM_MESSAGE_DELETE);
            if (delete.kind() != DestinationKind.INVALID) {
                return delete;
            }
            DestinationDescriptor messages = roomDestination(
                    destination, APP_PREFIX, "/messages",
                    DestinationKind.APP_ROOM_MESSAGES);
            if (messages.kind() != DestinationKind.INVALID) {
                return messages;
            }
            return roomDestination(
                    destination,
                    APP_PREFIX,
                    "/subscriptions/sync",
                    DestinationKind.APP_ROOM_SUBSCRIPTION_SYNC);
        }
        if (destination.startsWith(TOPIC_PREFIX)) {
            DestinationDescriptor messages = roomDestination(
                    destination, TOPIC_PREFIX, "/messages",
                    DestinationKind.TOPIC_ROOM_MESSAGES);
            if (messages.kind() != DestinationKind.INVALID) {
                return messages;
            }
            DestinationDescriptor events = roomDestination(
                    destination, TOPIC_PREFIX, "/room-events",
                    DestinationKind.TOPIC_ROOM_EVENTS);
            if (events.kind() != DestinationKind.INVALID) {
                return events;
            }
            return roomDestination(
                    destination, TOPIC_PREFIX, "/read-receipts",
                    DestinationKind.TOPIC_READ_RECEIPTS_DISABLED);
        }
        return invalid(destination);
    }

    private DestinationDescriptor roomDestination(
            String destination,
            String prefix,
            String suffix,
            DestinationKind kind
    ) {
        if (!destination.startsWith(prefix)
                || !destination.endsWith(suffix)
                || destination.length() <= prefix.length() + suffix.length()) {
            return invalid(destination);
        }
        String roomId = destination.substring(
                prefix.length(), destination.length() - suffix.length());
        if (!roomIdPattern.matcher(roomId).matches()) {
            return invalid(destination);
        }
        return new DestinationDescriptor(kind, destination, roomId);
    }

    private static boolean containsWildcard(String destination) {
        return destination.indexOf('*') >= 0
                || destination.indexOf('{') >= 0
                || destination.indexOf('}') >= 0;
    }

    private static DestinationDescriptor invalid(String destination) {
        return new DestinationDescriptor(DestinationKind.INVALID, destination, null);
    }
}
