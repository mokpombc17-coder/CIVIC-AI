package com.hamcheeze.chat.room.api.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RejectRoomCreationRequestTest {

    @Test
    void acceptsAndCanonicalizesSingleLineReason() {
        RejectRoomCreationRequest request =
                new RejectRoomCreationRequest("  조건이 부족합니다.  ");

        assertThat(request.reason()).isEqualTo("조건이 부족합니다.");
        assertThat(validate(request)).isEmpty();
        assertThat(validate(new RejectRoomCreationRequest(
                "😀".repeat(100)))).isEmpty();
    }

    @Test
    void rejectsBlankMultilineControlAndOverlongReasons() {
        assertThat(validate(new RejectRoomCreationRequest(null)))
                .isNotEmpty();
        assertThat(validate(new RejectRoomCreationRequest("   ")))
                .isNotEmpty();
        assertThat(validate(new RejectRoomCreationRequest("첫 줄\n둘째 줄")))
                .isNotEmpty();
        assertThat(validate(new RejectRoomCreationRequest("사유\t보충")))
                .isNotEmpty();
        assertThat(validate(new RejectRoomCreationRequest("사유\u2028보충")))
                .isNotEmpty();
        assertThat(validate(new RejectRoomCreationRequest(
                "😀".repeat(101)))).isNotEmpty();
    }

    private static java.util.Set<jakarta.validation.ConstraintViolation<
            RejectRoomCreationRequest>> validate(
            RejectRoomCreationRequest request
    ) {
        try (ValidatorFactory factory = Validation
                .buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            return validator.validate(request);
        }
    }
}
