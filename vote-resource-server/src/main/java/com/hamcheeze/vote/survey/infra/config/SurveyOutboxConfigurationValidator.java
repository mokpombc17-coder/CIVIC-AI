package com.hamcheeze.vote.survey.infra.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public class SurveyOutboxConfigurationValidator
        implements SmartInitializingSingleton {

    static final String INVALID_CONFIGURATION_MESSAGE =
            "Invalid Survey delivery configuration: "
                    + "vote.integration.outbox.enabled=false while the "
                    + "Survey submission API is enabled. "
                    + "SurveyResponseSubmitted delivery stops after a "
                    + "successful Survey submission. Set "
                    + "vote.integration.outbox.enabled=true.";

    private static final Logger log = LoggerFactory.getLogger(
            SurveyOutboxConfigurationValidator.class);

    private final Environment environment;
    private final boolean outboxEnabled;

    public SurveyOutboxConfigurationValidator(
            Environment environment,
            @Value("${vote.integration.outbox.enabled:false}")
            boolean outboxEnabled
    ) {
        this.environment = Objects.requireNonNull(
                environment, "environment");
        this.outboxEnabled = outboxEnabled;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (outboxEnabled
                || environment.acceptsProfiles(Profiles.of("test"))) {
            return;
        }
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            throw new IllegalStateException(
                    INVALID_CONFIGURATION_MESSAGE);
        }
        log.warn(INVALID_CONFIGURATION_MESSAGE);
    }
}
