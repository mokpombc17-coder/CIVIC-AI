package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import java.time.Clock;
import java.util.Objects;

public final class RoomReadStateService {

    private final RoomQueryReader roomReader;
    private final RoomReadStateStore readStateStore;
    private final RoomReadPositionResolver readPositionResolver;
    private final RoomSequenceReader sequenceReader;
    private final RoomInboxStorageExceptionClassifier
            storageExceptionClassifier;
    private final Clock clock;
    private final Counter updatedCounter;
    private final Counter noopCounter;
    private final Counter failureCounter;

    public RoomReadStateService(
            RoomQueryReader roomReader,
            RoomReadStateStore readStateStore,
            RoomReadPositionResolver readPositionResolver,
            RoomSequenceReader sequenceReader,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.roomReader = Objects.requireNonNull(
                roomReader, "roomReader");
        this.readStateStore = Objects.requireNonNull(
                readStateStore, "readStateStore");
        this.readPositionResolver = Objects.requireNonNull(
                readPositionResolver, "readPositionResolver");
        this.sequenceReader = Objects.requireNonNull(
                sequenceReader, "sequenceReader");
        this.storageExceptionClassifier =
                new RoomInboxStorageExceptionClassifier();
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.updatedCounter = meterRegistry.counter(
                "room.read_state.updates");
        this.noopCounter = meterRegistry.counter(
                "room.read_state.noops");
        this.failureCounter = meterRegistry.counter(
                "room.read_state.failures");
    }

    public ReadStateResult update(
            String userId,
            String roomId,
            long throughSequence
    ) {
        try {
            if (throughSequence < 0) {
                throw new IllegalArgumentException(
                        "throughSequence must not be negative");
            }
            Membership membership = roomReader.findMembership(
                            roomId, userId)
                    .filter(value -> value.status()
                            == MembershipStatus.ACTIVE)
                    .orElseThrow(() -> new RoomInboxException(
                            RoomInboxErrorCode.ACCESS_DENIED,
                            "An active membership is required"));
            Room room = roomReader.findRoomById(roomId)
                    .orElseThrow(() -> new RoomInboxException(
                            RoomInboxErrorCode.ACCESS_DENIED,
                            "Room access is unavailable"));
            if (room.status() != RoomStatus.ACTIVE) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.READ_STATE_NOT_AVAILABLE,
                        "Read state is unavailable for a closed room");
            }

            RoomReadState existing = readStateStore
                    .findByMembershipId(membership.membershipId())
                    .orElse(null);
            RoomReadPosition position = readPositionResolver.resolve(
                    membership, existing);
            long effective = position.effectiveReadThroughSequence();
            long currentRoomSequence = sequenceReader.currentSequence(
                    roomId);
            if (position.messageVisibleAfterSequence()
                    > currentRoomSequence
                    || position.storedLastReadSequence()
                    > currentRoomSequence) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.READ_STATE_INCONSISTENT,
                        "Persisted read state exceeds the room sequence");
            }
            if (throughSequence
                    < position.messageVisibleAfterSequence()
                    || throughSequence <= effective) {
                recordNoop();
                return new ReadStateResult(roomId, effective, false);
            }
            if (throughSequence > currentRoomSequence) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.READ_SEQUENCE_AHEAD,
                        "Read sequence exceeds the current room sequence");
            }
            RoomReadStateAdvance advance = readStateStore.advance(
                    membership.membershipId(),
                    roomId,
                    userId,
                    throughSequence,
                    clock.instant());
            RoomReadPosition advancedPosition =
                    readPositionResolver.resolve(
                            membership, advance.state());
            long result = advancedPosition
                    .effectiveReadThroughSequence();
            if (advance.updated()) {
                BestEffortMetricRecorder.increment(
                        "room.read_state.updates", updatedCounter);
            } else {
                recordNoop();
            }
            return new ReadStateResult(
                    roomId, result, advance.updated());
        } catch (RuntimeException exception) {
            if (!(exception instanceof RoomInboxException)) {
                BestEffortMetricRecorder.increment(
                        "room.read_state.failures", failureCounter);
            }
            if (!(exception instanceof RoomInboxException)
                    && storageExceptionClassifier.classify(exception)
                    .orElse(null)
                    == RoomInboxStorageExceptionClassifier.FailureKind
                    .RETRYABLE) {
                throw new RoomInboxException(
                        RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                        "Read state storage is temporarily unavailable",
                        exception);
            }
            throw exception;
        }
    }

    private void recordNoop() {
        BestEffortMetricRecorder.increment(
                "room.read_state.noops", noopCounter);
    }

}
