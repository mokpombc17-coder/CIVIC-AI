package ai.civic.mainauth.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.junit.jupiter.api.Test;

class VerificationCodeProtectorTest {
    @Test
    void sixDigitCodeVerifierIsKeyedAndConstantTimeComparable() throws Exception {
        var first = new VerificationCodeProtector("first-code-protection-key");
        var second = new VerificationCodeProtector("second-code-protection-key");

        var verifier = first.verifier("123456");

        assertThat(verifier).isNotEqualTo(MessageDigest.getInstance("SHA-256")
                .digest("123456".getBytes(StandardCharsets.UTF_8)));
        assertThat(verifier).isNotEqualTo(second.verifier("123456"));
        assertThat(first.matches("123456", verifier)).isTrue();
        assertThat(first.matches("654321", verifier)).isFalse();
        assertThat(first.matches(null, verifier)).isFalse();
    }
}
