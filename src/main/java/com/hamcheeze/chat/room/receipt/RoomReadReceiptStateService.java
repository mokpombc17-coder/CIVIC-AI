package com.hamcheeze.chat.room.receipt;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.inbox.RoomInboxErrorCode;
import com.hamcheeze.chat.room.inbox.RoomInboxException;
import com.hamcheeze.chat.room.inbox.RoomInboxStorageExceptionClassifier;
import com.hamcheeze.chat.room.inbox.RoomReadPosition;
import com.hamcheeze.chat.room.inbox.RoomReadPositionResolver;
import com.hamcheeze.chat.room.inbox.RoomReadState;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class RoomReadReceiptStateService {

    private static final Logger log = LoggerFactory.getLogger(
            RoomReadReceiptStateService.class);

    private final RoomQueryReader roomReader;
    private final RoomReadStateStore readStateStore;
    private final RoomReadPositionResolver positionResolver;
    private final RoomSequenceReader sequenceReader;
    private final RoomReadReceiptProperties properties;
    private final RoomInboxStorageExceptionClassifier
            storageExceptionClassifier;
    private final Clock clock;
    private final Counter requestCounter;
    private final Counter successCounter;
    private final Counter failureCounter;
    private final Counter retryCounter;

    public RoomReadReceiptStateService(
            RoomQueryReader roomReader,
            RoomReadStateStore readStateStore,
            RoomReadPositionResolver positionResolver,
            RoomSequenceReader sequenceReader,
            RoomReadReceiptProperties properties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.roomReader = Objects.requireNonNull(
                roomReader, "roomReader");
        this.readStateStore = Objects.requireNonNull(
                readStateStore, "readStateStore");
        this.positionResolver = Objects.requireNonNull(
                positionResolver, "positionResolver");
        this.sequenceReader = Objects.requireNonNull(
                sequenceReader, "sequenceReader");
        this.properties = Objects.requireNonNull(
                properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.storageExceptionClassifier =
                new RoomInboxStorageExceptionClassifier();
        this.requestCounter = meterRegistry.counter(
                "room.read_receipt.snapshot.requests");
        this.successCounter = meterRegistry.counter(
                "room.read_receipt.snapshot.success");
        this.failureCounter = meterRegistry.counter(
                "room.read_receipt.snapshot.failures");
        this.retryCounter = meterRegistry.counter(
                "room.read_receipt.snapshot.retries");
    }

    public RoomReadReceiptState state(String userId, String roomId) {
        requireText(userId, "userId");
        requireText(roomId, "roomId");
        BestEffortMetricRecorder.increment(
                "room.read_receipt.snapshot.requests",
                requestCounter);
        try {
            for (int attempt = 1;
                 attempt <= properties
                         .getSnapshotMaxConsistencyAttempts();
                 attempt++) {
                RoomReadReceiptState state = attempt(
                        userId, roomId);
                if (state != null) {
                    BestEffortMetricRecorder.increment(
                            "room.read_receipt.snapshot.success",
                            successCounter);
                    return state;
                }
                BestEffortMetricRecorder.increment(
                        "room.read_receipt.snapshot.retries",
                        retryCounter);
            }
            throw new RoomInboxException(
                    RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                    "Read receipt snapshot changed during assembly");
        } catch (RoomInboxException exception) {
            recordFailure();
            throw exception;
        } catch (RuntimeException exception) {
            recordFailure();
            if (storageExceptionClassifier.classify(exception)
                    .orElse(null)
                    == RoomInboxStorageExceptionClassifier.FailureKind
                    .RETRYABLE) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                        "Read receipt snapshot is temporarily unavailable",
                        exception);
            }
            throw exception;
        }
    }

    private RoomReadReceiptState attempt(
            String userId,
            String roomId
    ) {
        Room first = requireActiveRoom(roomId);
        Membership requestedSelf = roomReader.findMembership(
                        roomId, userId)
                .filter(value -> value.status()
                        == MembershipStatus.ACTIVE)
                .orElseThrow(() -> new RoomInboxException(
                        RoomInboxErrorCode.ACCESS_DENIED,
                        "An active membership is required"));

        CursorSlice<Membership> activeSlice = roomReader
                .findMembershipsByRoomAndStatus(
                        roomId,
                        MembershipStatus.ACTIVE,
                        null,
                        properties.getSnapshotMaxPositions());
        if (activeSlice.hasNext()) {
            throw consistencyFailure(
                    roomId,
                    "Active membership snapshot exceeds the safety limit");
        }
        List<Membership> activeMemberships = activeSlice.items();
        verifyMembershipSet(roomId, first, activeMemberships);
        List<String> membershipIds = activeMemberships.stream()
                .map(Membership::membershipId)
                .toList();
        Map<String, RoomReadState> states = readStateStore
                .findByMembershipIds(membershipIds);
        verifyStateKeys(roomId, membershipIds, states);
        long currentRoomSequence = sequenceReader.currentSequence(
                roomId);
        List<RoomReadReceiptPosition> positions = positions(
                roomId,
                activeMemberships,
                states,
                currentRoomSequence);

        Room second = roomReader.findRoomById(roomId).orElse(null);
        if (!stable(first, second)) {
            return null;
        }
        Membership finalSelf = activeMemberships.stream()
                .filter(value -> value.membershipId().equals(
                        requestedSelf.membershipId()))
                .findFirst()
                .orElse(null);
        if (finalSelf == null) {
            throw new RoomInboxException(
                    RoomInboxErrorCode.ACCESS_DENIED,
                    "An active membership is required");
        }
        if (!finalSelf.userId().equals(userId)
                || finalSelf.version() != requestedSelf.version()) {
            throw consistencyFailure(
                    roomId,
                    "Requester membership changed without a Room version change");
        }
        return new RoomReadReceiptState(
                roomId,
                second.version(),
                finalSelf.membershipId(),
                positions,
                clock.instant());
    }

    private Room requireActiveRoom(String roomId) {
        Room room = roomReader.findRoomById(roomId)
                .orElseThrow(() -> new RoomInboxException(
                        RoomInboxErrorCode.ACCESS_DENIED,
                        "Room access is unavailable"));
        if (room.status() != RoomStatus.ACTIVE) {
            throw new RoomInboxException(
                    RoomInboxErrorCode.READ_STATE_NOT_AVAILABLE,
                    "Read receipt state is unavailable for a closed room");
        }
        return room;
    }

    private void verifyMembershipSet(
            String roomId,
            Room room,
            List<Membership> memberships
    ) {
        Set<String> membershipIds = new HashSet<>();
        for (Membership membership : memberships) {
            if (!membership.roomId().equals(roomId)
                    || membership.status()
                    != MembershipStatus.ACTIVE
                    || !membershipIds.add(
                    membership.membershipId())) {
                throw consistencyFailure(
                        roomId,
                        "Active membership snapshot is inconsistent");
            }
        }
        if (memberships.size() != room.activeMemberCount()) {
            throw consistencyFailure(
                    roomId,
                    "Active membership count does not match Room state");
        }
    }

    private void verifyStateKeys(
            String roomId,
            List<String> membershipIds,
            Map<String, RoomReadState> states
    ) {
        Objects.requireNonNull(states, "states");
        Set<String> requested = Set.copyOf(membershipIds);
        if (!requested.containsAll(states.keySet())) {
            throw consistencyFailure(
                    roomId,
                    "Read state batch returned an unexpected membership");
        }
    }

    private List<RoomReadReceiptPosition> positions(
            String roomId,
            List<Membership> memberships,
            Map<String, RoomReadState> states,
            long currentRoomSequence
    ) {
        List<RoomReadReceiptPosition> positions = new ArrayList<>();
        for (Membership membership : memberships) {
            RoomReadPosition position = positionResolver.resolve(
                    membership,
                    states.get(membership.membershipId()));
            if (position.messageVisibleAfterSequence()
                    > currentRoomSequence
                    || position.storedLastReadSequence()
                    > currentRoomSequence) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.READ_STATE_INCONSISTENT,
                        "Persisted read state exceeds the room sequence");
            }
            positions.add(new RoomReadReceiptPosition(
                    membership.membershipId(),
                    membership.version(),
                    position.messageVisibleAfterSequence(),
                    position.storedLastReadSequence()));
        }
        positions.sort(Comparator.comparing(
                RoomReadReceiptPosition::membershipId));
        return List.copyOf(positions);
    }

    private static boolean stable(Room first, Room second) {
        return second != null
                && first.roomId().equals(second.roomId())
                && first.status() == second.status()
                && first.version() == second.version()
                && second.status() == RoomStatus.ACTIVE;
    }

    private IllegalStateException consistencyFailure(
            String roomId,
            String message
    ) {
        log.error(
                "Read receipt snapshot consistency failure: roomId={}, reason={}",
                roomId,
                message);
        return new IllegalStateException(message);
    }

    private void recordFailure() {
        BestEffortMetricRecorder.increment(
                "room.read_receipt.snapshot.failures",
                failureCounter);
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
