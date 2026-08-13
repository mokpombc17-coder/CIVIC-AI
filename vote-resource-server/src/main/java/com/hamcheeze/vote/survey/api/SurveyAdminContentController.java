package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
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
@RequestMapping("/api/v1/admin/survey-content-versions")
final class SurveyAdminContentController {

    private final SurveyContentVersionService contents;
    private final AuthenticatedUserIdResolver userIds;

    SurveyAdminContentController(
            SurveyContentVersionService contents,
            AuthenticatedUserIdResolver userIds
    ) {
        this.contents = contents;
        this.userIds = userIds;
    }

    @PostMapping
    ResponseEntity<SurveyApiModels.ContentResponse> create(
            Authentication authentication,
            @Valid @RequestBody SurveyApiModels.ContentWriteRequest request
    ) {
        SurveyApiModels.ContentResponse response =
                SurveyApiModels.ContentResponse.from(contents.createDraft(
                        new SurveyContentVersionService.CreateDraftCommand(
                                request.name(), request.description(),
                                request.toQuestions()),
                        actor(authentication)));
        return ResponseEntity.created(URI.create(
                        "/api/v1/admin/survey-content-versions/"
                                + response.id()))
                .body(response);
    }

    @PutMapping("/{contentVersionId}")
    SurveyApiModels.ContentResponse replace(
            Authentication authentication,
            @PathVariable UUID contentVersionId,
            @Valid @RequestBody SurveyApiModels.ContentWriteRequest request
    ) {
        return SurveyApiModels.ContentResponse.from(contents.replaceDraft(
                contentId(contentVersionId),
                new SurveyContentVersionService.ReplaceDraftCommand(
                        request.name(), request.description(),
                        request.toQuestions()),
                actor(authentication)));
    }

    @PostMapping("/{contentVersionId}/clone")
    ResponseEntity<SurveyApiModels.ContentResponse> clonePublished(
            Authentication authentication,
            @PathVariable UUID contentVersionId
    ) {
        SurveyApiModels.ContentResponse response =
                SurveyApiModels.ContentResponse.from(
                        contents.clonePublishedVersion(
                                contentId(contentVersionId),
                                actor(authentication)));
        return ResponseEntity.created(URI.create(
                        "/api/v1/admin/survey-content-versions/"
                                + response.id()))
                .body(response);
    }

    @PostMapping("/{contentVersionId}/publish")
    SurveyApiModels.ContentResponse publish(
            Authentication authentication,
            @PathVariable UUID contentVersionId
    ) {
        return SurveyApiModels.ContentResponse.from(contents.publish(
                contentId(contentVersionId), actor(authentication))
                .contentVersion());
    }

    @GetMapping
    List<SurveyApiModels.ContentResponse> all() {
        return contents.findAll().stream()
                .map(SurveyApiModels.ContentResponse::from)
                .toList();
    }

    @GetMapping("/{contentVersionId}")
    SurveyApiModels.ContentResponse detail(
            @PathVariable UUID contentVersionId
    ) {
        return contents.findById(contentId(contentVersionId))
                .map(SurveyApiModels.ContentResponse::from)
                .orElseThrow(() -> new SurveyApiException(
                        HttpStatus.NOT_FOUND,
                        "SURVEY_CONTENT_NOT_FOUND",
                        "The survey content version does not exist."));
    }

    private SurveyActorId actor(Authentication authentication) {
        return new SurveyActorId(userIds.resolve(authentication));
    }

    private static SurveyContentVersionId contentId(UUID value) {
        return new SurveyContentVersionId(value);
    }
}
