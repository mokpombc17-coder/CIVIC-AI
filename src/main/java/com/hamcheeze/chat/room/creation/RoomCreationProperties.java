package com.hamcheeze.chat.room.creation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Objects;

@ConfigurationProperties("chat.room.creation")
public class RoomCreationProperties {

    public static final int DEFAULT_MAX_PENDING_REQUESTS_PER_USER = 3;
    public static final int MAX_PENDING_REQUESTS_PER_USER = 100;

    private RoomCreationMode mode =
            RoomCreationMode.APPROVAL_REQUIRED;
    private int maxPendingRequestsPerUser =
            DEFAULT_MAX_PENDING_REQUESTS_PER_USER;

    public RoomCreationMode mode() {
        return mode;
    }

    public void setMode(RoomCreationMode mode) {
        this.mode = Objects.requireNonNull(mode, "mode");
    }

    public int maxPendingRequestsPerUser() {
        return maxPendingRequestsPerUser;
    }

    public void setMaxPendingRequestsPerUser(
            int maxPendingRequestsPerUser
    ) {
        if (maxPendingRequestsPerUser < 1
                || maxPendingRequestsPerUser
                > MAX_PENDING_REQUESTS_PER_USER) {
            throw new IllegalArgumentException(
                    "maxPendingRequestsPerUser must be between 1 and 100");
        }
        this.maxPendingRequestsPerUser =
                maxPendingRequestsPerUser;
    }

    public boolean approvalRequired() {
        return mode == RoomCreationMode.APPROVAL_REQUIRED;
    }
}
