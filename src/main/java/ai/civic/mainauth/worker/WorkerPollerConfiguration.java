package ai.civic.mainauth.worker;

import ai.civic.mainauth.audit.AuditConsumer;
import ai.civic.mainauth.auth.AuthenticationFlowService;
import ai.civic.mainauth.auth.PwaRefreshTokenService;
import ai.civic.mainauth.auth.RefreshTokenService;
import ai.civic.mainauth.notification.SignupMailDispatcher;
import ai.civic.mainauth.privacy.PrivacyCommandDispatcher;
import ai.civic.mainauth.privacy.PrivacyResultDispatcher;
import ai.civic.mainauth.signup.SignupFlowService;
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
            AccountStateDispatcher accountState,
            AuthenticationFlowService authentication,
            RefreshTokenService refreshTokens,
            PwaRefreshTokenService pwaRefreshTokens,
            SignupFlowService signupFlows,
            PrivacyCommandDispatcher privacy,
            PrivacyResultDispatcher privacyResults) {
        return List.of(
                new NamedPoller("notification", notifications::dispatchOne),
                new NamedPoller("audit", audit::consumeOne),
                new NamedPoller("account-state", accountState::dispatchOne),
                new NamedPoller(
                        "opaque-auth-flow-retention",
                        authentication::purgeExpiredOpaqueAuthenticationFlows),
                new NamedPoller("refresh-token-retention", refreshTokens::purgeExpiredFamilies),
                new NamedPoller("pwa-refresh-session-retention", pwaRefreshTokens::purgeExpiredSessions),
                new NamedPoller("signup-flow-retention", signupFlows::purgeExpiredSignupFlows),
                new NamedPoller("privacy-main", privacy::dispatchMainOne),
                new NamedPoller("privacy-rag-command", privacy::dispatchRagOne),
                new NamedPoller("privacy-result", privacyResults::dispatchOne));
    }

    private record NamedPoller(String channel, BooleanSupplier operation) implements OutboxPoller {
        @Override
        public boolean pollOnce() {
            return operation.getAsBoolean();
        }
    }
}
