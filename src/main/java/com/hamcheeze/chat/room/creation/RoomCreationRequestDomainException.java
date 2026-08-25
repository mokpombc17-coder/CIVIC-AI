package com.hamcheeze.chat.room.creation;

import java.util.Objects;

public final class RoomCreationRequestDomainException
        extends RuntimeException {

    private final RoomCreationRequestDomainErrorCode code;

    public RoomCreationRequestDomainException(
            RoomCreationRequestDomainErrorCode code
    ) {
        super(Objects.requireNonNull(code, "code").name());
        this.code = code;
    }

    public RoomCreationRequestDomainErrorCode code() {
        return code;
    }
}
