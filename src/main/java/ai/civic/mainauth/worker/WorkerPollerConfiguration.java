package ai.civic.mainauth.worker;

import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
class WorkerPollerConfiguration {
    @Bean
    List<OutboxPoller> outboxPollers() {
        return List.of(
                () -> "notification",
                () -> "audit",
                () -> "account-state",
                () -> "privacy-command");
    }
}
