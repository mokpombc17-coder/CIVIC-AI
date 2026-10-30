package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaGenerationAttempt;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;

import java.util.Optional;

public interface PersonaGenerationAttemptRepository {

    PersonaGenerationAttempt insert(PersonaGenerationAttempt attempt);

    PersonaGenerationAttempt update(PersonaGenerationAttempt attempt);

    Optional<PersonaGenerationAttempt> findByClaimToken(
            PersonaGenerationClaimToken claimToken);
}
