package com.hamcheeze.vote.shared.infra.integration.outbox;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(IntegrationOutboxProperties.class)
class IntegrationOutboxConfiguration {
}
