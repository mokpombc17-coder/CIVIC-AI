package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.AssertFalse;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.websocket.subscription")
public class SubscriptionLimitProperties {

    @Min(1)
    private int maxActiveRoomsPerConnection = 1;
    @Min(5)
    private int maxSubscriptionsPerConnection = 6;
    @Min(1)
    private int maxSubscribersPerRoom = 50;
    @AssertTrue
    private boolean rejectDuplicateDestination = true;
    @AssertFalse
    private boolean allowWildcardDestination;
    @AssertFalse
    private boolean readReceiptsEnabled;

    public int getMaxActiveRoomsPerConnection() {
        return maxActiveRoomsPerConnection;
    }

    public void setMaxActiveRoomsPerConnection(int value) {
        this.maxActiveRoomsPerConnection = value;
    }

    public int getMaxSubscriptionsPerConnection() {
        return maxSubscriptionsPerConnection;
    }

    public void setMaxSubscriptionsPerConnection(int value) {
        this.maxSubscriptionsPerConnection = value;
    }

    public int getMaxSubscribersPerRoom() {
        return maxSubscribersPerRoom;
    }

    public void setMaxSubscribersPerRoom(int value) {
        this.maxSubscribersPerRoom = value;
    }

    public boolean isRejectDuplicateDestination() {
        return rejectDuplicateDestination;
    }

    public void setRejectDuplicateDestination(boolean value) {
        this.rejectDuplicateDestination = value;
    }

    public boolean isAllowWildcardDestination() {
        return allowWildcardDestination;
    }

    public void setAllowWildcardDestination(boolean value) {
        this.allowWildcardDestination = value;
    }

    public boolean isReadReceiptsEnabled() {
        return readReceiptsEnabled;
    }

    public void setReadReceiptsEnabled(boolean value) {
        this.readReceiptsEnabled = value;
    }
}
