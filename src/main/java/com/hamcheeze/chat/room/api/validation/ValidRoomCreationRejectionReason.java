package com.hamcheeze.chat.room.api.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Documented
@Constraint(validatedBy = RoomCreationRejectionReasonValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidRoomCreationRejectionReason {

    String message() default
            "reason must be a single line between 1 and 100 characters";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
