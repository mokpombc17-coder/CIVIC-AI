package com.hamcheeze.chat.websocket.health;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.contributor.Status;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component("roomAuthorization")
public final class RoomAuthorizationHealthIndicator
        implements HealthIndicator {

    private final Environment environment;

    public RoomAuthorizationHealthIndicator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public Health health() {
        if (environment.acceptsProfiles(Profiles.of("skeleton"))) {
            return Health.status(Status.OUT_OF_SERVICE).build();
        }
        return Health.up().build();
    }
}
