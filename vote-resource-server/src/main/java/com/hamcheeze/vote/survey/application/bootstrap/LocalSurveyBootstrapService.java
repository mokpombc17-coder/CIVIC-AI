package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionPublication;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationKind;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationPlan;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionCoordinator;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
@Profile("local")
public class LocalSurveyBootstrapService {

    private final SurveyContentVersionRepository contents;
    private final SurveyRoundRepository rounds;
    private final SurveyRoundTransitionCoordinator coordinator =
            new SurveyRoundTransitionCoordinator(
                    () -> LocalSurveyFixture.TRANSITION_ID);

    public LocalSurveyBootstrapService(
            SurveyContentVersionRepository contents,
            SurveyRoundRepository rounds
    ) {
        this.contents = Objects.requireNonNull(contents, "contents");
        this.rounds = Objects.requireNonNull(rounds, "rounds");
    }

    @Transactional
    public LocalSurveyBootstrapResult initialize() {
        rounds.lockGlobalControlForUpdate();
        Optional<SurveyContentVersion> fixtureRoot = contents.findById(
                LocalSurveyFixture.CONTENT_VERSION_ID);
        if (fixtureRoot.isPresent()) {
            validateCompleteFixture(fixtureRoot.get());
            return LocalSurveyBootstrapResult.ALREADY_PRESENT;
        }
        requireEmptySurveyState();
        createFixture();
        return LocalSurveyBootstrapResult.CREATED;
    }

    private void requireEmptySurveyState() {
        if (!contents.findAll().isEmpty() || !rounds.findAll().isEmpty()) {
            throw conflict(
                    "another Survey dataset exists without the local fixture root");
        }
    }

    private void createFixture() {
        SurveyContentVersion draft = contents.save(
                LocalSurveyFixture.draft());
        SurveyContentVersion replaced = contents.save(draft.replaceDraft(
                LocalSurveyFixture.NAME,
                LocalSurveyFixture.DESCRIPTION,
                LocalSurveyFixture.questions(),
                LocalSurveyFixture.ACTOR,
                LocalSurveyFixture.CREATED_AT));
        SurveyContentVersionPublication publication = replaced.publish(
                LocalSurveyFixture.CONTENT_VERSION_NUMBER,
                LocalSurveyFixture.ACTOR,
                LocalSurveyFixture.CREATED_AT);
        SurveyContentVersion published = contents.save(
                publication.contentVersion());

        SurveyRoundActivationPlan activation =
                coordinator.startPublishedContentNow(
                        Optional.empty(),
                        Optional.empty(),
                        LocalSurveyFixture.ROUND_ID,
                        LocalSurveyFixture.ROUND_NUMBER,
                        published,
                        SurveyRoundActivationKind.FIRST,
                        LocalSurveyFixture.ACTOR,
                        LocalSurveyFixture.CREATED_AT,
                        SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP,
                        LocalSurveyFixture.TRANSITION_REASON);
        rounds.save(activation.targetRound());
        rounds.appendTransitions(activation.transitions());
    }

    private void validateCompleteFixture(SurveyContentVersion root) {
        List<SurveyContentVersion> allContents = contents.findAll();
        if (allContents.size() != 1
                || !LocalSurveyFixture.matchesContent(root)) {
            throw conflict(
                    "local content fixture is partial, changed, or mixed with other data");
        }
        var fixtureRound = rounds.findById(LocalSurveyFixture.ROUND_ID)
                .orElseThrow(() -> conflict(
                        "local fixture round is missing"));
        List<com.hamcheeze.vote.survey.domain.round.SurveyRound> allRounds =
                rounds.findAll();
        if (allRounds.size() != 1
                || !LocalSurveyFixture.matchesRound(fixtureRound)) {
            throw conflict(
                    "local round fixture is partial, changed, or mixed with other data");
        }
        List<SurveyRoundTransition> transitions = rounds.findTransitions(
                LocalSurveyFixture.ROUND_ID);
        if (transitions.size() != 1
                || !LocalSurveyFixture.matchesTransition(
                transitions.getFirst())) {
            throw conflict(
                    "local transition fixture is partial or changed");
        }
    }

    private static LocalSurveyBootstrapException conflict(String detail) {
        return new LocalSurveyBootstrapException(detail);
    }
}
