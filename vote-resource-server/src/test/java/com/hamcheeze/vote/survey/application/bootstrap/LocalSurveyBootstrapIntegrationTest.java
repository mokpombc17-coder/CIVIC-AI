package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "vote.survey.bootstrap.enabled=false")
@ActiveProfiles({"local", "test"})
class LocalSurveyBootstrapIntegrationTest {

    @Autowired
    private LocalSurveyBootstrapService bootstrap;

    @Autowired
    private SurveyContentVersionRepository contents;

    @Autowired
    private SurveyRoundRepository rounds;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    survey_content_versions,
                    survey_round_control
                CASCADE
                """);
        jdbcTemplate.update("""
                INSERT INTO survey_round_control (control_id, row_version)
                VALUES ('GLOBAL', 0)
                """);
    }

    @AfterEach
    void cleanSurveyData() {
        resetSurveyData();
    }

    @Test
    void createsExactFixtureOnceAndThenReturnsNoOp() {
        assertThat(bootstrap.initialize())
                .isEqualTo(LocalSurveyBootstrapResult.CREATED);
        assertThat(bootstrap.initialize())
                .isEqualTo(LocalSurveyBootstrapResult.ALREADY_PRESENT);

        assertThat(contents.findAll()).hasSize(1);
        var content = contents.findById(
                LocalSurveyFixture.CONTENT_VERSION_ID).orElseThrow();
        assertThat(content.status())
                .isEqualTo(SurveyContentVersionStatus.PUBLISHED);
        assertThat(content.versionNumber())
                .contains(LocalSurveyFixture.CONTENT_VERSION_NUMBER);
        assertThat(content.questions())
                .hasSize(RoundOneSurveyFixture.QUESTION_COUNT);
        assertThat(content.questionGroups())
                .hasSize(RoundOneSurveyFixture.GROUP_COUNT);
        assertThat(content.questionSections())
                .hasSize(RoundOneSurveyFixture.SECTION_COUNT);
        assertThat(LocalSurveyFixture.matchesContent(content)).isTrue();

        assertThat(rounds.findAll()).hasSize(1);
        var round = rounds.findById(
                LocalSurveyFixture.ROUND_ID).orElseThrow();
        assertThat(round.status()).isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(round.enforcementMode())
                .contains(SurveyRoundEnforcementMode.REQUIRED);
        assertThat(LocalSurveyFixture.matchesRound(round)).isTrue();

        var transitions = rounds.findTransitions(
                LocalSurveyFixture.ROUND_ID);
        assertThat(transitions).hasSize(1);
        assertThat(transitions.getFirst().trigger())
                .isEqualTo(SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP);
        assertThat(transitions.getFirst().id())
                .isEqualTo(LocalSurveyFixture.TRANSITION_ID);
    }

    @Test
    void rejectsPartialFixtureWithoutRepairingPublishedData() {
        contents.save(LocalSurveyFixture.draft());

        assertConflict(() -> bootstrap.initialize());

        assertThat(contents.findAll()).hasSize(1);
        assertThat(contents.findById(LocalSurveyFixture.CONTENT_VERSION_ID))
                .get()
                .extracting(SurveyContentVersion::status)
                .isEqualTo(SurveyContentVersionStatus.DRAFT);
        assertThat(rounds.findAll()).isEmpty();
    }

    @Test
    void rejectsUnrelatedSurveyDataInsteadOfMergingIt() {
        contents.save(SurveyContentVersion.createDraft(
                new SurveyContentVersionId(UUID.randomUUID()),
                "existing draft",
                null,
                List.of(),
                new SurveyActorId("developer"),
                Instant.parse("2026-08-13T00:00:00Z")));

        assertConflict(() -> bootstrap.initialize());

        assertThat(contents.findAll()).hasSize(1);
        assertThat(rounds.findAll()).isEmpty();
    }

    private static void assertConflict(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOf(LocalSurveyBootstrapException.class)
                .hasMessageContaining(LocalSurveyBootstrapException.CODE);
    }
}
