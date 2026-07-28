package com.hamcheeze.chat.room.authorization;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.room.authorization")
public class RoomAuthorizationProperties {

    @Min(1)
    private int maxConsistencyAttempts = 3;

    public int getMaxConsistencyAttempts() {
        return maxConsistencyAttempts;
    }

    public void setMaxConsistencyAttempts(int maxConsistencyAttempts) {
        this.maxConsistencyAttempts = maxConsistencyAttempts;
    }
}
