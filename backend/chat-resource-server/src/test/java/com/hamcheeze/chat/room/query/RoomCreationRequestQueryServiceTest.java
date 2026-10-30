package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.query.model.RoomCreationRequestView;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RoomCreationRequestQueryServiceTest {

    private final RoomQueryReader reader = mock(RoomQueryReader.class);
    private final RoomCreationRequestQueryService service =
            new RoomCreationRequestQueryService(reader);

    @Test
    void nonApprovedRequestsHaveNoRoomStatusWithoutRoomLookup() {
        RoomCreationRequest pending = request(
                RoomCreationRequestStatus.PENDING,
                null);

        RoomCreationRequestView view = service.view(pending);

        assertThat(view.request()).isSameAs(pending);
        assertThat(view.roomStatus()).isNull();
        verifyNoInteractions(reader);
    }

    @Test
    void approvedRequestStatusesAreLoadedInOneRoomBatch() {
        RoomCreationRequest pending = request(
                RoomCreationRequestStatus.PENDING,
                null);
        RoomCreationRequest activeRequest = request(
                RoomCreationRequestStatus.APPROVED,
                "room-active");
        RoomCreationRequest closedRequest = request(
                RoomCreationRequestStatus.APPROVED,
                "room-closed");
        Room active = room("room-active", RoomStatus.ACTIVE);
        Room closed = room("room-closed", RoomStatus.CLOSED);
        when(reader.findRoomsByIds(List.of(
                "room-active",
                "room-closed")))
                .thenReturn(List.of(active, closed));

        List<RoomCreationRequestView> views = service.views(List.of(
                pending,
                activeRequest,
                closedRequest));

        assertThat(views)
                .extracting(RoomCreationRequestView::roomStatus)
                .containsExactly(
                        null,
                        RoomStatus.ACTIVE,
                        RoomStatus.CLOSED);
        verify(reader).findRoomsByIds(List.of(
                "room-active",
                "room-closed"));
    }

    @Test
    void approvedRequestCannotHideAMissingRoomAsNullStatus() {
        RoomCreationRequest approved = request(
                RoomCreationRequestStatus.APPROVED,
                "missing-room");
        when(reader.findRoomsByIds(List.of("missing-room")))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.views(List.of(approved)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("missing-room");
    }

    private static RoomCreationRequest request(
            RoomCreationRequestStatus status,
            String roomId
    ) {
        RoomCreationRequest request = mock(RoomCreationRequest.class);
        when(request.status()).thenReturn(status);
        when(request.approvedRoomId()).thenReturn(roomId);
        return request;
    }

    private static Room room(String roomId, RoomStatus status) {
        Room room = mock(Room.class);
        when(room.roomId()).thenReturn(roomId);
        when(room.status()).thenReturn(status);
        return room;
    }
}
