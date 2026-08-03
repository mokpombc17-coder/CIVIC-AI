package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.inbox.model.RoomInboxView;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryCursor;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class RoomInboxService {

    private final RoomQueryReader roomReader;
    private final RoomReadStateStore readStateStore;
    private final UnreadCountReader unreadCountReader;
    private final RoomQueryCursorCodec cursorCodec;
    private final Counter requestCounter;
    private final Timer queryTimer;

    public RoomInboxService(
            RoomQueryReader roomReader,
            RoomReadStateStore readStateStore,
            UnreadCountReader unreadCountReader,
            RoomQueryCursorCodec cursorCodec,
            MeterRegistry meterRegistry
    ) {
        this.roomReader = Objects.requireNonNull(
                roomReader, "roomReader");
        this.readStateStore = Objects.requireNonNull(
                readStateStore, "readStateStore");
        this.unreadCountReader = Objects.requireNonNull(
                unreadCountReader, "unreadCountReader");
        this.cursorCodec = Objects.requireNonNull(
                cursorCodec, "cursorCodec");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.requestCounter = meterRegistry.counter(
                "room.inbox.requests");
        this.queryTimer = meterRegistry.timer(
                "room.inbox.query.duration");
    }

    public CursorPage<RoomInboxView> inbox(
            String userId,
            String cursor,
            int limit
    ) {
        long started = System.nanoTime();
        BestEffortMetricRecorder.increment(
                "room.inbox.requests", requestCounter);
        try {
            RoomQueryCursor decoded = cursorCodec.decode(
                    cursor,
                    RoomQueryCursor.Scope.MY_ROOM_INBOX,
                    MembershipStatus.ACTIVE);
            CursorSlice<Membership> memberships = roomReader
                    .findMembershipsByUserAndStatus(
                            userId,
                            MembershipStatus.ACTIVE,
                            decoded == null
                                    ? null
                                    : decoded.lastMembershipId(),
                            limit);
            List<String> membershipIds = memberships.items()
                    .stream()
                    .map(Membership::membershipId)
                    .toList();
            Map<String, RoomReadState> states = readStateStore
                    .findByMembershipIds(membershipIds);
            Map<String, Room> rooms = roomReader.findRoomsByIds(
                            memberships.items().stream()
                                    .map(Membership::roomId)
                                    .distinct()
                                    .toList())
                    .stream()
                    .collect(Collectors.toMap(
                            Room::roomId,
                            Function.identity()));
            List<RoomInboxView> views = new ArrayList<>();
            for (Membership membership : memberships.items()) {
                Room room = rooms.get(membership.roomId());
                if (room == null
                        || room.status() != RoomStatus.ACTIVE
                        || membership.status()
                        != MembershipStatus.ACTIVE) {
                    continue;
                }
                RoomReadState state = states.get(
                        membership.membershipId());
                if (state != null) {
                    verifyIdentity(state, membership);
                }
                long readThrough = Math.max(
                        membership.messageVisibleAfterSequence(),
                        state == null ? 0
                                : state.lastReadSequence());
                UnreadCount unread = unreadCountReader.count(
                        room.roomId(), userId, readThrough);
                views.add(view(room, membership, readThrough, unread));
            }
            String nextCursor = null;
            if (memberships.hasNext()) {
                Membership last = memberships.items().getLast();
                nextCursor = cursorCodec.encode(new RoomQueryCursor(
                        RoomQueryCursor.CURRENT_VERSION,
                        RoomQueryCursor.Scope.MY_ROOM_INBOX,
                        MembershipStatus.ACTIVE,
                        last.membershipId()));
            }
            return new CursorPage<>(
                    views, nextCursor, memberships.hasNext());
        } catch (RoomInboxException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new RoomInboxException(
                    RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                    "Room inbox query failed",
                    exception);
        } finally {
            BestEffortMetricRecorder.record(
                    "room.inbox.query.duration",
                    queryTimer,
                    Duration.ofNanos(Math.max(
                            0, System.nanoTime() - started)));
        }
    }

    private static RoomInboxView view(
            Room room,
            Membership membership,
            long readThrough,
            UnreadCount unread
    ) {
        return new RoomInboxView(
                room.roomId(),
                room.name(),
                room.description(),
                room.ownerUserId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.version(),
                membership.membershipId(),
                membership.role(),
                membership.status(),
                membership.joinedAt(),
                membership.version(),
                readThrough,
                unread.value(),
                unread.capped());
    }

    private static void verifyIdentity(
            RoomReadState state,
            Membership membership
    ) {
        if (!state.roomId().equals(membership.roomId())
                || !state.userId().equals(membership.userId())) {
            throw new IllegalStateException(
                    "Room read state identity does not match membership");
        }
    }
}
