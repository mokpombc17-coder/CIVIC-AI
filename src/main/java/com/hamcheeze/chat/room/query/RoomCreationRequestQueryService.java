package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.query.model.RoomCreationRequestView;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class RoomCreationRequestQueryService {

    private final RoomQueryReader reader;

    public RoomCreationRequestQueryService(RoomQueryReader reader) {
        this.reader = Objects.requireNonNull(reader, "reader");
    }

    public RoomCreationRequestView view(
            RoomCreationRequest request
    ) {
        RoomCreationRequest source = Objects.requireNonNull(
                request,
                "request");
        if (source.status() != RoomCreationRequestStatus.APPROVED) {
            return new RoomCreationRequestView(source, null);
        }
        Room room = reader.findRoomById(source.approvedRoomId())
                .orElseThrow(() -> missingRoom(source));
        return new RoomCreationRequestView(source, room.status());
    }

    public List<RoomCreationRequestView> views(
            List<RoomCreationRequest> requests
    ) {
        List<RoomCreationRequest> sources = List.copyOf(
                Objects.requireNonNull(requests, "requests"));
        List<String> roomIds = sources.stream()
                .filter(request -> request.status()
                        == RoomCreationRequestStatus.APPROVED)
                .map(RoomCreationRequest::approvedRoomId)
                .distinct()
                .toList();
        if (roomIds.isEmpty()) {
            return sources.stream()
                    .map(request -> new RoomCreationRequestView(
                            request,
                            null))
                    .toList();
        }
        Map<String, Room> roomsById = reader.findRoomsByIds(roomIds)
                .stream()
                .collect(Collectors.toMap(
                        Room::roomId,
                        Function.identity()));
        return sources.stream()
                .map(request -> view(request, roomsById))
                .toList();
    }

    private static RoomCreationRequestView view(
            RoomCreationRequest request,
            Map<String, Room> roomsById
    ) {
        if (request.status() != RoomCreationRequestStatus.APPROVED) {
            return new RoomCreationRequestView(request, null);
        }
        Room room = roomsById.get(request.approvedRoomId());
        if (room == null) {
            throw missingRoom(request);
        }
        return new RoomCreationRequestView(request, room.status());
    }

    private static IllegalStateException missingRoom(
            RoomCreationRequest request
    ) {
        return new IllegalStateException(
                "Approved Room creation request references a missing "
                        + "Room: " + request.approvedRoomId());
    }
}
