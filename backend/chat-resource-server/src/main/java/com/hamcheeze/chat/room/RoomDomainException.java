package com.hamcheeze.chat.room;

import java.util.Objects;

public final class RoomDomainException extends RuntimeException {

    private final RoomDomainErrorCode code;

    public RoomDomainException(RoomDomainErrorCode code) {
        this(code, code.name());
    }

    public RoomDomainException(
            RoomDomainErrorCode code,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public RoomDomainErrorCode code() {
        return code;
    }
}
