package com.hamcheeze.vote.task.verification;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Pattern;

import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependencies;
import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependenciesMatching;

class TaskArchitectureTest {

    private static final String TASK_PACKAGE =
            "com.hamcheeze.vote.task";
    private static final String APPLICATION_PACKAGE =
            "com.hamcheeze.vote.task.application";
    private static final String DOMAIN_PACKAGE =
            "com.hamcheeze.vote.task.domain";
    private static final List<String> FORBIDDEN_DEPENDENCIES = List.of(
            "org.springframework.",
            "jakarta.persistence.",
            "jakarta.servlet.",
            "org.hibernate.",
            "com.hamcheeze.vote.survey.domain.",
            "com.hamcheeze.vote.persona.",
            "com.hamcheeze.vote.opinionmap.");
    private static final String PERSISTENCE_PACKAGE =
            "com.hamcheeze.vote.task.infra.persistence";

    @Test
    void domainClassesHaveNoSpringJpaOrWebDependencies()
            throws Exception {
        assertPackageHasNoDependencies(
                DOMAIN_PACKAGE, FORBIDDEN_DEPENDENCIES);
    }

    @Test
    void applicationDoesNotDependOnPersonaOrOpinionMap() throws Exception {
        assertPackageHasNoDependencies(
                APPLICATION_PACKAGE,
                List.of(
                        "com.hamcheeze.vote.persona.",
                        "com.hamcheeze.vote.opinionmap."));
    }

    @Test
    void taskDoesNotDependOnPersonaRepositoryOrPersistence()
            throws Exception {
        assertPackageHasNoDependenciesMatching(
                TASK_PACKAGE,
                List.of(
                        Pattern.compile(
                                "com/hamcheeze/vote/persona/[\\w/$]+Repository"),
                        Pattern.compile(
                                "com/hamcheeze/vote/persona/infra/persistence/")));
    }

    @Test
    void persistenceDoesNotDependOnPersonaOrOpinionMapImplementation()
            throws Exception {
        assertPackageHasNoDependencies(
                PERSISTENCE_PACKAGE,
                List.of(
                        "com.hamcheeze.vote.persona.",
                        "com.hamcheeze.vote.opinionmap."));
    }

    private void assertPackageHasNoDependencies(
            String packageName,
            List<String> forbiddenDependencies
    ) throws Exception {
        assertNoDependencies(packageName, forbiddenDependencies);
    }

    private void assertPackageHasNoDependenciesMatching(
            String packageName,
            List<Pattern> forbiddenDependencies
    ) throws Exception {
        assertNoDependenciesMatching(packageName, forbiddenDependencies);
    }
}
