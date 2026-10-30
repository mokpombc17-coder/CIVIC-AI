package com.hamcheeze.vote.survey.verification;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Pattern;

import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependencies;
import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependenciesMatching;

class SurveyArchitectureTest {

    private static final String APPLICATION_PACKAGE =
            "com.hamcheeze.vote.survey.application";
    private static final String DOMAIN_PACKAGE =
            "com.hamcheeze.vote.survey.domain";
    private static final List<String> FORBIDDEN_DEPENDENCIES = List.of(
            "org.springframework.",
            "jakarta.persistence.",
            "jakarta.servlet.",
            "org.hibernate.",
            "com.hamcheeze.vote.persona.");

    @Test
    void domainClassesHaveNoInfrastructureOrPersonaDependencies()
            throws Exception {
        assertNoDependencies(DOMAIN_PACKAGE, FORBIDDEN_DEPENDENCIES);
    }

    @Test
    void applicationDoesNotDependOnPersona() throws Exception {
        assertNoDependencies(
                APPLICATION_PACKAGE,
                List.of("com.hamcheeze.vote.persona."));
    }

    @Test
    void surveyDoesNotDependOnPersonaRepositoryOrPersistence()
            throws Exception {
        assertNoDependenciesMatching(
                "com.hamcheeze.vote.survey",
                List.of(
                        Pattern.compile(
                                "com/hamcheeze/vote/persona/[\\w/$]+Repository"),
                        Pattern.compile(
                                "com/hamcheeze/vote/persona/infra/persistence/")));
    }

    @Test
    void apiDoesNotDependOnPersona() throws Exception {
        assertNoDependencies(
                "com.hamcheeze.vote.survey.api",
                List.of("com.hamcheeze.vote.persona."));
    }

}
