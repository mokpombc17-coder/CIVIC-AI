package com.hamcheeze.chat.security;

import com.hamcheeze.chat.room.api.RoomApiSecurityProblemWriter;
import com.hamcheeze.civic.auth.CivicAuthProperties;
import com.hamcheeze.civic.auth.CivicCookieMutationSameOriginFilter;
import com.hamcheeze.civic.auth.CivicMainAuthConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("auth-main & !auth-fixture")
@Import(CivicMainAuthConfiguration.class)
public class ChatMainAuthConfiguration {

    @Bean
    CivicCookieMutationSameOriginFilter chatCookieMutationSameOriginFilter(
            CivicAuthProperties properties,
            RoomApiSecurityProblemWriter problemWriter
    ) {
        return new CivicCookieMutationSameOriginFilter(
                properties.getBrowserOrigin(),
                problemWriter);
    }
}
