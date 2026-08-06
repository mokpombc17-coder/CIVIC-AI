package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.persistence.RoomCommandType;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ActiveRoomMembershipQuotaMetricsTest {

    @Test
    void recordsOnlyBoundedOperationTags() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ActiveRoomMembershipQuotaMetrics metrics =
                new ActiveRoomMembershipQuotaMetrics(registry);

        assertThat(metrics.recordCheck(
                RoomCommandType.CREATE_ROOM,
                () -> ActiveRoomMembershipQuotaDecision
                        .LIMIT_REACHED))
                .isEqualTo(
                        ActiveRoomMembershipQuotaDecision.LIMIT_REACHED);
        metrics.recordExempted(RoomCommandType.JOIN_ROOM);

        assertThat(registry.get(
                        "room.membership.user_active_limit.rejected")
                .tag("operation", "CREATE_ROOM")
                .counter().count()).isEqualTo(1);
        assertThat(registry.get(
                        "room.membership.user_active_limit.exempted")
                .tag("operation", "JOIN_ROOM")
                .counter().count()).isEqualTo(1);
        assertThat(registry.get(
                        "room.membership.user_active_limit.check.duration")
                .tag("operation", "CREATE_ROOM")
                .timer().count()).isEqualTo(1);
        assertThat(registry.getMeters())
                .flatExtracting(meter -> meter.getId().getTags())
                .allSatisfy(tag -> assertThat(tag.getKey())
                        .isEqualTo("operation"));
    }
}
