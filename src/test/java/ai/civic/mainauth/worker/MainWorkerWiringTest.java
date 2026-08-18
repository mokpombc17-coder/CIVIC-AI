package ai.civic.mainauth.worker;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class MainWorkerWiringTest {
    @Test
    void serverAndWorkerModesAreExplicitAndMutuallyExclusive() throws Exception {
        var yaml = Files.readString(Path.of("src/main/resources/application.yaml"));
        assertThat(yaml).contains("CIVIC_RUNTIME_MODE");
        assertThat(yaml).contains("server");
        assertThat(yaml).contains("worker");
        assertThat(yaml).doesNotContain("match-if-missing: true");
        assertThat(yaml).doesNotContain("web-application-type");
        assertThat(ai.civic.mainauth.MainAuthApplication.webApplicationType("worker"))
                .isEqualTo(org.springframework.boot.WebApplicationType.NONE);
        assertThat(ai.civic.mainauth.MainAuthApplication.webApplicationType("server"))
                .isEqualTo(org.springframework.boot.WebApplicationType.SERVLET);
    }

    @Test
    void workerOwnsPollersAndServerOwnsTheWebApplication() throws Exception {
        var worker = Files.readString(Path.of(
                "src/main/java/ai/civic/mainauth/worker/MainWorkerApplication.java"));
        var server = Files.readString(Path.of(
                "src/main/java/ai/civic/mainauth/MainAuthApplication.java"));
        assertThat(worker).contains("WebApplicationType.NONE", "OutboxPoller");
        assertThat(server).doesNotContain("OutboxPoller");
    }

    @Test
    void workerPollerLoopActuallySchedulesOutboxWork() throws Exception {
        var loop = Files.readString(Path.of(
                "src/main/java/ai/civic/mainauth/worker/WorkerPollerLoop.java"));
        assertThat(loop).contains("@Scheduled", "pollOnce");
    }

    @Test
    void oneFailedChannelDoesNotStarveIndependentPollers() {
        var healthyCalls = new AtomicInteger();
        var failed = new OutboxPoller() {
            public String channel() { return "account-state"; }
            public boolean pollOnce() { throw new IllegalStateException("redis unavailable"); }
        };
        var healthy = new OutboxPoller() {
            public String channel() { return "privacy-main"; }
            public boolean pollOnce() {
                healthyCalls.incrementAndGet();
                return false;
            }
        };

        new WorkerPollerLoop(List.of(failed, healthy)).poll();

        assertThat(healthyCalls).hasValue(1);
    }

    @Test
    void servletSecurityIsNotLoadedIntoTheNonWebWorker() throws Exception {
        var security = Files.readString(Path.of(
                "src/main/java/ai/civic/mainauth/config/SecurityConfiguration.java"));
        assertThat(security).contains("@ConditionalOnWebApplication", "Type.SERVLET");
    }
}
