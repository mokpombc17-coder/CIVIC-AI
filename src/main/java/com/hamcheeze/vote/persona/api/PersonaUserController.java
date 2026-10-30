package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;

@RestController
@RequestMapping("/api/v1/me")
final class PersonaUserController {

    private final AuthenticatedUserIdResolver userIds;
    private final CurrentPersonaQueryService currentPersona;

    PersonaUserController(
            AuthenticatedUserIdResolver userIds,
            CurrentPersonaQueryService currentPersona
    ) {
        this.userIds = Objects.requireNonNull(userIds, "userIds");
        this.currentPersona = Objects.requireNonNull(
                currentPersona, "currentPersona");
    }

    @GetMapping("/persona-status")
    PersonaApiModels.PersonaStatusResponse personaStatus(
            Authentication authentication
    ) {
        PersonaUserId userId = new PersonaUserId(
                userIds.resolve(authentication));
        return PersonaApiModels.PersonaStatusResponse.from(
                currentPersona.findCurrent(userId));
    }
}
