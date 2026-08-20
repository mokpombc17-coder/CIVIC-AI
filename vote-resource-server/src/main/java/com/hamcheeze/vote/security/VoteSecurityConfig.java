package com.hamcheeze.vote.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
public class VoteSecurityConfig {

    @Bean
    SecurityFilterChain voteApiSecurityFilterChain(
            HttpSecurity http,
            VoteApiSecurityProblemWriter problemWriter,
            BearerTokenResolver bearerTokenResolver,
            Environment environment,
            @Value("${vote.security.local-admin-api-enabled:false}")
            boolean localAdminApiEnabled
    ) throws Exception {
        return http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.ignoringRequestMatchers(
                        "/api/v1/**"))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/actuator/health",
                                "/actuator/health/**")
                        .permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/operations/survey/outbox-events/*/replays")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.SURVEY_OUTBOX_REPLAYS_WRITE))
                        .requestMatchers(
                                "/api/v1/admin",
                                "/api/v1/admin/**")
                        .access((authentication, context) ->
                                new org.springframework.security.authorization
                                        .AuthorizationDecision(
                                        localAdminApiEnabled
                                                && environment.acceptsProfiles(
                                                Profiles.of("local"))
                                                && authentication.get()
                                                .isAuthenticated()))
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/me/surveys",
                                "/api/v1/me/surveys/**",
                                "/api/v1/me/survey-responses",
                                "/api/v1/me/survey-responses/**",
                                "/api/v1/me/service-eligibility")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.SURVEYS_READ))
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/me/survey-responses",
                                "/api/v1/me/survey-responses/**")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.SURVEY_RESPONSES_WRITE))
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/me/persona-status")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.PERSONAS_READ))
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/me/tasks/*/prediction")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.PREDICTIONS_WRITE))
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/me/tasks/*/submission")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.SUBMISSIONS_WRITE))
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/me/tasks",
                                "/api/v1/me/tasks/**")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.TASKS_READ))
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/me/submissions",
                                "/api/v1/me/submissions/**")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.SUBMISSIONS_READ))
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/opinion-map/snapshots",
                                "/api/v1/opinion-map/snapshots/**")
                        .hasAuthority(VoteScopes.authority(
                                VoteScopes.OPINION_MAPS_READ))
                        .requestMatchers("/api/v1/**")
                        .authenticated()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problemWriter)
                        .accessDeniedHandler(problemWriter))
                .oauth2ResourceServer(resourceServer ->
                        resourceServer
                                .bearerTokenResolver(
                                        bearerTokenResolver)
                                .jwt(Customizer.withDefaults())
                                .authenticationEntryPoint(
                                        problemWriter))
                .build();
    }

    @Bean
    BearerTokenResolver voteBearerTokenResolver(
            @Value("${vote.security.cookie-authentication-enabled:false}")
            boolean cookieAuthenticationEnabled
    ) {
        return new CookieOrHeaderBearerTokenResolver(
                cookieAuthenticationEnabled);
    }

    @Bean
    AuthenticatedUserIdResolver authenticatedUserIdResolver() {
        return new AuthenticatedUserIdResolver();
    }

    @Bean
    VoteApiSecurityProblemWriter voteApiSecurityProblemWriter(
            ObjectMapper objectMapper
    ) {
        return new VoteApiSecurityProblemWriter(objectMapper);
    }
}
