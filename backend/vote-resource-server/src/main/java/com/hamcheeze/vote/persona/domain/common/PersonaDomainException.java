package com.hamcheeze.vote.persona.domain.common;

import java.util.Objects;

public final class PersonaDomainException extends RuntimeException {

    private final PersonaViolation violation;

    public PersonaDomainException(PersonaViolation violation) {
        super(Objects.requireNonNull(violation, "violation").message());
        this.violation = violation;
    }

    public static PersonaDomainException invariant(
            String code,
            String field,
            String message
    ) {
        return new PersonaDomainException(
                new PersonaViolation(code, field, message));
    }

    public PersonaViolation violation() {
        return violation;
    }
}
