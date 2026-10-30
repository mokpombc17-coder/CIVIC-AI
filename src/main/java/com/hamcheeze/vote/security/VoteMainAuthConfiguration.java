package com.hamcheeze.vote.security;

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
public class VoteMainAuthConfiguration {

    @Bean
    CivicCookieMutationSameOriginFilter voteCookieMutationSameOriginFilter(
            CivicAuthProperties properties,
            VoteApiSecurityProblemWriter problemWriter
    ) {
        return new CivicCookieMutationSameOriginFilter(
                properties.getBrowserOrigin(),
                problemWriter);
    }
}
