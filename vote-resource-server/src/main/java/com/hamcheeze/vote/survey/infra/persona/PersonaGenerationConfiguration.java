package com.hamcheeze.vote.survey.infra.persona;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(PersonaGenerationProperties.class)
class PersonaGenerationConfiguration {
}
