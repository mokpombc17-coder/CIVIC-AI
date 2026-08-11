package ai.civic.mainauth.worker;

import ai.civic.mainauth.audit.AuditConsumer;
import ai.civic.mainauth.notification.SignupMailDispatcher;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
@EnableScheduling
class WorkerPollerConfiguration {
    @Bean
    List<OutboxPoller> outboxPollers(
            SignupMailDispatcher notifications,
            AuditConsumer audit,
            AccountStateDispatcher accountState) {
        return List.of(
                new NamedPoller("notification", notifications::dispatchOne),
                new NamedPoller("audit", audit::consumeOne),
                new NamedPoller("account-state", accountState::dispatchOne));
    }

    private record NamedPoller(String channel, BooleanSupplier operation) implements OutboxPoller {
        @Override
        public boolean pollOnce() {
            return operation.getAsBoolean();
        }
    }
}
