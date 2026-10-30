package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.inbox.notification.RoomInboxEvent;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties("chat.room-inbox")
public class RoomInboxProperties {

    public static final int MAX_UNREAD_COUNT_CAP = 10_000;

    @Min(1)
    @Max(MAX_UNREAD_COUNT_CAP)
    private int unreadCountCap = 200;

    @NotNull
    private Duration countQueryMaxTime = Duration.ofSeconds(1);

    @NotNull
    private Duration pageQueryMaxTime = Duration.ofSeconds(1);

    @Valid
    @NotNull
    private Notification notification = new Notification();

    public int getUnreadCountCap() {
        return unreadCountCap;
    }

    public void setUnreadCountCap(int unreadCountCap) {
        this.unreadCountCap = unreadCountCap;
    }

    public Duration getCountQueryMaxTime() {
        return countQueryMaxTime;
    }

    public void setCountQueryMaxTime(Duration countQueryMaxTime) {
        if (countQueryMaxTime == null
                || countQueryMaxTime.toNanos() < 1_000_000
                || countQueryMaxTime.compareTo(
                        Duration.ofSeconds(30)) > 0) {
            throw new IllegalArgumentException(
                    "countQueryMaxTime must be between 1ms and 30s");
        }
        this.countQueryMaxTime = countQueryMaxTime;
    }

    public Duration getPageQueryMaxTime() {
        return pageQueryMaxTime;
    }

    public void setPageQueryMaxTime(Duration pageQueryMaxTime) {
        if (pageQueryMaxTime == null
                || pageQueryMaxTime.toNanos() < 1_000_000
                || pageQueryMaxTime.compareTo(
                        Duration.ofSeconds(30)) > 0) {
            throw new IllegalArgumentException(
                    "pageQueryMaxTime must be between 1ms and 30s");
        }
        this.pageQueryMaxTime = pageQueryMaxTime;
    }

    public Notification getNotification() {
        return notification;
    }

    public void setNotification(Notification notification) {
        this.notification = notification;
    }

    public static class Notification {

        @Min(1)
        private int queueCapacity = 1_000;

        @Min(1)
        @Max(5_000)
        private long coalescingWindowMs = 100;

        @Min(1)
        @Max(RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
        private int maxEventsPerRoomBatch = 100;

        @Min(1)
        @Max(1_000)
        private int maxRecipientSnapshotSize = 100;

        @Min(1)
        private long shutdownDrainTimeoutMs = 1_000;

        @Min(1)
        @Max(5_000)
        private long publicRoomsCoalescingWindowMs = 1_000;

        public int getQueueCapacity() {
            return queueCapacity;
        }

        public void setQueueCapacity(int queueCapacity) {
            this.queueCapacity = queueCapacity;
        }

        public long getCoalescingWindowMs() {
            return coalescingWindowMs;
        }

        public void setCoalescingWindowMs(long value) {
            this.coalescingWindowMs = value;
        }

        public int getMaxEventsPerRoomBatch() {
            return maxEventsPerRoomBatch;
        }

        public void setMaxEventsPerRoomBatch(int value) {
            this.maxEventsPerRoomBatch = value;
        }

        public int getMaxRecipientSnapshotSize() {
            return maxRecipientSnapshotSize;
        }

        public void setMaxRecipientSnapshotSize(int value) {
            this.maxRecipientSnapshotSize = value;
        }

        public long getShutdownDrainTimeoutMs() {
            return shutdownDrainTimeoutMs;
        }

        public void setShutdownDrainTimeoutMs(long value) {
            this.shutdownDrainTimeoutMs = value;
        }

        public long getPublicRoomsCoalescingWindowMs() {
            return publicRoomsCoalescingWindowMs;
        }

        public void setPublicRoomsCoalescingWindowMs(long value) {
            this.publicRoomsCoalescingWindowMs = value;
        }
    }
}
