package com.hamcheeze.chat.room.receipt;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties("chat.room.read-receipt")
public class RoomReadReceiptProperties {

    @NotNull
    private Duration flushInterval = Duration.ofMillis(200);

    @Min(1)
    @Max(1_000)
    private int maxUpdatesPerEvent = 50;

    @Min(1_024)
    private int maxEventBytes = 12_288;

    @Min(1)
    private int maxPendingRooms = 1_000;

    @Min(1)
    @Max(10)
    private int snapshotMaxConsistencyAttempts = 3;

    @Min(1)
    @Max(1_000)
    private int snapshotMaxPositions = 100;

    public Duration getFlushInterval() {
        return flushInterval;
    }

    public void setFlushInterval(Duration flushInterval) {
        if (flushInterval == null
                || flushInterval.toNanos() < 1_000_000
                || flushInterval.compareTo(Duration.ofSeconds(5)) > 0) {
            throw new IllegalArgumentException(
                    "flushInterval must be between 1ms and 5s");
        }
        this.flushInterval = flushInterval;
    }

    public int getMaxUpdatesPerEvent() {
        return maxUpdatesPerEvent;
    }

    public void setMaxUpdatesPerEvent(int maxUpdatesPerEvent) {
        this.maxUpdatesPerEvent = maxUpdatesPerEvent;
    }

    public int getMaxEventBytes() {
        return maxEventBytes;
    }

    public void setMaxEventBytes(int maxEventBytes) {
        this.maxEventBytes = maxEventBytes;
    }

    public int getMaxPendingRooms() {
        return maxPendingRooms;
    }

    public void setMaxPendingRooms(int maxPendingRooms) {
        this.maxPendingRooms = maxPendingRooms;
    }

    public int getSnapshotMaxConsistencyAttempts() {
        return snapshotMaxConsistencyAttempts;
    }

    public void setSnapshotMaxConsistencyAttempts(
            int snapshotMaxConsistencyAttempts
    ) {
        this.snapshotMaxConsistencyAttempts =
                snapshotMaxConsistencyAttempts;
    }

    public int getSnapshotMaxPositions() {
        return snapshotMaxPositions;
    }

    public void setSnapshotMaxPositions(int snapshotMaxPositions) {
        this.snapshotMaxPositions = snapshotMaxPositions;
    }
}
