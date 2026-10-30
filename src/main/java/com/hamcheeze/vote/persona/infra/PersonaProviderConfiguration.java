package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
        prefix = "vote.persona",
        name = "enabled",
        havingValue = "true")
class PersonaProviderConfiguration {

    @Bean
    @ConditionalOnProperty(
            prefix = "vote.persona",
            name = "provider",
            havingValue = "http",
            matchIfMissing = true)
    PersonaCreationPort personaHttpCreationPort(
            PersonaGenerationProperties properties,
            ObjectMapper objectMapper
    ) {
        return new PersonaHttpCreationAdapter(properties, objectMapper);
    }

    @Bean
    @Profile("local")
    @ConditionalOnProperty(
            prefix = "vote.persona",
            name = "provider",
            havingValue = "fake")
    PersonaCreationPort localPersonaFakeCreationPort() {
        return new LocalPersonaFakeCreationAdapter();
    }
}
