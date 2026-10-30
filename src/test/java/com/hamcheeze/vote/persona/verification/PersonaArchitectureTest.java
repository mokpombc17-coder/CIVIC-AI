package com.hamcheeze.vote.persona.verification;

import org.junit.jupiter.api.Test;

import java.util.List;

import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependencies;

class PersonaArchitectureTest {

    private static final String PERSONA_PACKAGE =
            "com.hamcheeze.vote.persona";
    private static final String DOMAIN_PACKAGE =
            "com.hamcheeze.vote.persona.domain";
    private static final List<String> FORBIDDEN_DEPENDENCIES = List.of(
            "org.springframework.",
            "jakarta.persistence.",
            "jakarta.servlet.",
            "org.hibernate.",
            "com.hamcheeze.vote.survey.");

    @Test
    void domainClassesHaveNoInfrastructureOrSurveyDependencies()
            throws Exception {
        assertNoDependencies(DOMAIN_PACKAGE, FORBIDDEN_DEPENDENCIES);
    }

    @Test
    void personaDoesNotDependOnSurveyImplementation() throws Exception {
        assertNoDependencies(
                PERSONA_PACKAGE,
                List.of("com.hamcheeze.vote.survey."));
    }

    @Test
    void apiDoesNotDependOnSurvey() throws Exception {
        assertNoDependencies(
                "com.hamcheeze.vote.persona.api",
                List.of("com.hamcheeze.vote.survey."));
    }

}
