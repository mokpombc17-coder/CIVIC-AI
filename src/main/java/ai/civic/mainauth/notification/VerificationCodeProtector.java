package ai.civic.mainauth.notification;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class VerificationCodeProtector {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec key;
    private final SecretKeySpec verifierKey;

    public VerificationCodeProtector(
            @Value("${civic.notification.code-protection-key:local-development-code-protection-key}")
                    String configuredKey) {
        try {
            this.key = new SecretKeySpec(
                    MessageDigest.getInstance("SHA-256")
                            .digest(configuredKey.getBytes(StandardCharsets.UTF_8)),
                    "AES");
            this.verifierKey = new SecretKeySpec(
                    MessageDigest.getInstance("SHA-256")
                            .digest(("civic-verification-code-verifier\0" + configuredKey)
                                    .getBytes(StandardCharsets.UTF_8)),
                    "HmacSHA256");
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to initialize code protection", exception);
        }
    }

    public String protect(String code) {
        try {
            var nonce = new byte[12];
            RANDOM.nextBytes(nonce);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            var encrypted = cipher.doFinal(code.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length)
                            .put(nonce).put(encrypted).array());
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to protect verification code", exception);
        }
    }

    public String reveal(String protectedCode) {
        try {
            var payload = Base64.getUrlDecoder().decode(protectedCode);
            var nonce = java.util.Arrays.copyOfRange(payload, 0, 12);
            var encrypted = java.util.Arrays.copyOfRange(payload, 12, payload.length);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to reveal verification code", exception);
        }
    }

    public byte[] verifier(String code) {
        if (code == null) throw new IllegalArgumentException("Verification code is required");
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(verifierKey);
            return mac.doFinal(code.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to verify verification code", exception);
        }
    }

    public boolean matches(String code, byte[] expectedVerifier) {
        return code != null && expectedVerifier != null
                && MessageDigest.isEqual(expectedVerifier, verifier(code));
    }
}
