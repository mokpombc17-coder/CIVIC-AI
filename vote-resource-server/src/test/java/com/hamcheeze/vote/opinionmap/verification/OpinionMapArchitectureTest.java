package com.hamcheeze.vote.opinionmap.verification;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Pattern;

import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependencies;
import static com.hamcheeze.vote.verification.ArchitectureTestSupport.assertNoDependenciesMatching;

class OpinionMapArchitectureTest {

    private static final String OPINION_MAP_PACKAGE =
            "com.hamcheeze.vote.opinionmap";
    private static final String APPLICATION_PACKAGE =
            "com.hamcheeze.vote.opinionmap.application";
    private static final String DOMAIN_PACKAGE =
            "com.hamcheeze.vote.opinionmap.domain";
    private static final String PERSISTENCE_PACKAGE =
            "com.hamcheeze.vote.opinionmap.infra.persistence";
    private static final List<String> OTHER_DOMAIN_IMPLEMENTATIONS = List.of(
            "com.hamcheeze.vote.survey.",
            "com.hamcheeze.vote.persona.",
            "com.hamcheeze.vote.task.");

    @Test
    void domainHasNoSpringJpaWebOrSharedContractDependencies()
            throws Exception {
        assertNoDependencies(
                DOMAIN_PACKAGE,
                List.of(
                        "org.springframework.",
                        "jakarta.persistence.",
                        "jakarta.servlet.",
                        "org.hibernate.",
                        "com.hamcheeze.vote.shared.",
                        "com.hamcheeze.vote.survey.",
                        "com.hamcheeze.vote.persona.",
                        "com.hamcheeze.vote.task."));
    }

    @Test
    void applicationDependsOnSharedContractsNotOtherImplementations()
            throws Exception {
        assertNoDependencies(
                APPLICATION_PACKAGE, OTHER_DOMAIN_IMPLEMENTATIONS);
    }

    @Test
    void opinionMapDoesNotDependOnOtherRepositoriesOrPersistence()
            throws Exception {
        assertNoDependenciesMatching(
                OPINION_MAP_PACKAGE,
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
