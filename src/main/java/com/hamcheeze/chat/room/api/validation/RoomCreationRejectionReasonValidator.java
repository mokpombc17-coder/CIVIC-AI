package com.hamcheeze.chat.room.api.validation;

import com.hamcheeze.chat.room.creation.RoomCreationRejectionReason;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public final class RoomCreationRejectionReasonValidator
        implements ConstraintValidator<
        ValidRoomCreationRejectionReason,
        String> {

    @Override
    public boolean isValid(
            String value,
            ConstraintValidatorContext context
    ) {
        return RoomCreationRejectionReason.isValid(value);
    }
}
