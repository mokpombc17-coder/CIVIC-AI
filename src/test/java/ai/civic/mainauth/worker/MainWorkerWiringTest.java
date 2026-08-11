package ai.civic.mainauth.worker;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class MainWorkerWiringTest {
    @Test
    void serverAndWorkerModesAreExplicitAndMutuallyExclusive() throws Exception {
        var yaml = Files.readString(Path.of("src/main/resources/application.yaml"));
        assertThat(yaml).contains("CIVIC_RUNTIME_MODE");
        assertThat(yaml).contains("server");
        assertThat(yaml).contains("worker");
        assertThat(yaml).doesNotContain("match-if-missing: true");
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
}
