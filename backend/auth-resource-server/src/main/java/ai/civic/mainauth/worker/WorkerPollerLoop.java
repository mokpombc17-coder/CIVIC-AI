package ai.civic.mainauth.worker;

import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
class WorkerPollerLoop {
    private static final Logger log = LoggerFactory.getLogger(WorkerPollerLoop.class);
    private static final int MAX_BATCH_PER_CHANNEL = 50;
    private final List<OutboxPoller> pollers;

    WorkerPollerLoop(List<OutboxPoller> pollers) {
        this.pollers = List.copyOf(pollers);
    }

    @Scheduled(fixedDelayString = "${civic.worker.poll-delay-ms:250}")
    void poll() {
        for (var poller : pollers) {
            try {
                for (var handled = 0; handled < MAX_BATCH_PER_CHANNEL; handled++) {
                    if (!poller.pollOnce()) break;
                }
            } catch (RuntimeException exception) {
                log.error("Worker poller channel {} failed; continuing other channels", poller.channel(), exception);
            }
        }
    }
}
