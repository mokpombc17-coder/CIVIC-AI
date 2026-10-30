package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.round.SurveyRoundService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/survey-rounds")
final class SurveyAdminRoundController {

    private final SurveyRoundService rounds;
    private final AuthenticatedUserIdResolver userIds;

    SurveyAdminRoundController(
            SurveyRoundService rounds,
            AuthenticatedUserIdResolver userIds
    ) {
        this.rounds = rounds;
        this.userIds = userIds;
    }

    @PostMapping("/schedules")
    ResponseEntity<SurveyApiModels.RoundResponse> schedule(
            Authentication authentication,
            @Valid @RequestBody SurveyApiModels.ScheduleRoundRequest request
    ) {
        SurveyApiModels.RoundResponse response =
                SurveyApiModels.RoundResponse.from(rounds.schedule(
                        new SurveyContentVersionId(request.contentVersionId()),
                        request.scheduledAt(), request.reason(),
                        actor(authentication)).round());
        return ResponseEntity.created(URI.create(
                        "/api/v1/admin/survey-rounds/" + response.id()))
                .body(response);
    }

    @PutMapping("/{roundId}/schedule")
    SurveyApiModels.RoundResponse reschedule(
            Authentication authentication,
            @PathVariable UUID roundId,
            @Valid @RequestBody SurveyApiModels.RescheduleRoundRequest request
    ) {
        return SurveyApiModels.RoundResponse.from(rounds.reschedule(
                roundId(roundId), request.scheduledAt(), request.reason(),
                actor(authentication)).round());
    }

    @PostMapping("/{roundId}/cancel")
    SurveyApiModels.RoundResponse cancel(
            Authentication authentication,
            @PathVariable UUID roundId,
            @Valid @RequestBody SurveyApiModels.ReasonRequest request
    ) {
        return SurveyApiModels.RoundResponse.from(rounds.cancel(
                roundId(roundId), request.reason(), actor(authentication))
                .round());
    }

    @PostMapping("/start-now")
    SurveyApiModels.RoundResponse startContentNow(
            Authentication authentication,
            @Valid @RequestBody SurveyApiModels.StartContentRoundRequest request
    ) {
        return SurveyApiModels.RoundResponse.from(
                rounds.startPublishedContentNow(
                        new SurveyContentVersionId(request.contentVersionId()),
                        request.reason(), actor(authentication)).targetRound());
    }

    @PostMapping("/{roundId}/start-now")
    SurveyApiModels.RoundResponse startScheduledNow(
            Authentication authentication,
            @PathVariable UUID roundId,
            @Valid @RequestBody SurveyApiModels.ReasonRequest request
    ) {
        return SurveyApiModels.RoundResponse.from(
                rounds.startScheduledRoundNow(
                        roundId(roundId), request.reason(),
                        actor(authentication)).targetRound());
    }

    @PutMapping("/{roundId}/enforcement")
    SurveyApiModels.RoundResponse enforcement(
            Authentication authentication,
            @PathVariable UUID roundId,
            @Valid @RequestBody SurveyApiModels.EnforcementRequest request
    ) {
        return SurveyApiModels.RoundResponse.from(rounds.changeEnforcement(
                roundId(roundId), request.mode(), request.reason(),
                actor(authentication)).round());
    }

    @GetMapping
    List<SurveyApiModels.RoundResponse> all() {
        return rounds.findAll().stream()
                .map(SurveyApiModels.RoundResponse::from)
                .toList();
    }

    @GetMapping("/{roundId}")
    SurveyApiModels.RoundResponse detail(@PathVariable UUID roundId) {
        return rounds.findById(roundId(roundId))
                .map(SurveyApiModels.RoundResponse::from)
                .orElseThrow(() -> new SurveyApiException(
                        HttpStatus.NOT_FOUND,
                        "SURVEY_ROUND_NOT_FOUND",
                        "The survey round does not exist."));
    }

    @GetMapping("/{roundId}/transitions")
    List<SurveyApiModels.TransitionResponse> transitions(
            @PathVariable UUID roundId
    ) {
        return rounds.findTransitions(roundId(roundId)).stream()
                .map(SurveyApiModels.TransitionResponse::from)
                .toList();
    }

    private SurveyActorId actor(Authentication authentication) {
        return new SurveyActorId(userIds.resolve(authentication));
    }

    private static SurveyRoundId roundId(UUID value) {
        return new SurveyRoundId(value);
    }
}
