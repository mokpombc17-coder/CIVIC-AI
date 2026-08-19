package com.hamcheeze.vote.result.verification;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Pattern;

import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependencies;
import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependenciesMatching;

class ResultArchitectureTest {

    private static final String RESULT_PACKAGE =
            "com.hamcheeze.vote.result";
    private static final String APPLICATION_PACKAGE =
            "com.hamcheeze.vote.result.application";
    private static final String PERSISTENCE_PACKAGE =
            "com.hamcheeze.vote.result.infra.persistence";
    private static final List<String> OTHER_DOMAIN_IMPLEMENTATIONS = List.of(
            "com.hamcheeze.vote.survey.",
            "com.hamcheeze.vote.persona.",
            "com.hamcheeze.vote.task.");

    @Test
    void applicationDependsOnSharedContractsNotOtherImplementations()
            throws Exception {
        assertNoDependencies(
                APPLICATION_PACKAGE, OTHER_DOMAIN_IMPLEMENTATIONS);
    }

    @Test
    void resultDoesNotDependOnOtherRepositoriesOrPersistence()
            throws Exception {
        assertNoDependenciesMatching(
                RESULT_PACKAGE,
                List.of(
                        Pattern.compile(
                                "com/hamcheeze/vote/(survey|persona|task)"
                                        + "/[\\w/$]+Repository"),
                        Pattern.compile(
                                "com/hamcheeze/vote/(survey|persona|task)"
                                        + "/infra/persistence/")));
    }

    @Test
    void persistenceDoesNotDependOnOtherDomainImplementations()
            throws Exception {
        assertNoDependencies(
                PERSISTENCE_PACKAGE, OTHER_DOMAIN_IMPLEMENTATIONS);
    }
}
