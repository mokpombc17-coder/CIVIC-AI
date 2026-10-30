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

    static final String PAUSED_CONFIGURATION_MESSAGE =
            "Survey Persona delivery is paused: "
                    + "vote.integration.outbox.dispatcher-enabled=false. "
                    + "SurveyResponseSubmitted events continue to be stored "
                    + "in integration_outbox and remain PENDING until the "
                    + "dispatcher is enabled.";

    private static final Logger log = LoggerFactory.getLogger(
            SurveyOutboxConfigurationValidator.class);

    private final Environment environment;
    private final boolean dispatcherEnabled;

    public SurveyOutboxConfigurationValidator(
            Environment environment,
            @Value("${vote.integration.outbox.dispatcher-enabled:false}")
            boolean dispatcherEnabled
    ) {
        this.environment = Objects.requireNonNull(
                environment, "environment");
        this.dispatcherEnabled = dispatcherEnabled;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (dispatcherEnabled
                || environment.acceptsProfiles(Profiles.of("test"))) {
            return;
        }
        log.warn(PAUSED_CONFIGURATION_MESSAGE);
    }
}
