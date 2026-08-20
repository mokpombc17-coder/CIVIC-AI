package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaGenerationRetryRequest;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.util.Optional;

public interface PersonaGenerationRetryRequestRepository {

    PersonaGenerationRetryRequest insert(
            PersonaGenerationRetryRequest request);

    Optional<PersonaGenerationRetryRequest> findByGenerationAndKey(
            PersonaGenerationId generationId,
            String idempotencyKey);
}
