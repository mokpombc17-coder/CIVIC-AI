package ai.civic.mainauth.signup;

import ai.civic.mainauth.consent.ConsentEvidenceService;
import ai.civic.mainauth.notification.VerificationCodeProtector;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SignupFlowService {
    private static final Pattern EMAIL = Pattern.compile(
            "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");
    private static final Pattern PASSWORD = Pattern.compile(
            "^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\\-=])[A-Za-z0-9!@#$%^&*()_+\\-=]{8,1024}$");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ConsentEvidenceService consent;
    private final VerificationCodeProtector codeProtector;
    private final Clock clock;
    private final Argon2PasswordEncoder passwordEncoder = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    @Autowired
    public SignupFlowService(
            JdbcTemplate jdbc,
            ObjectMapper json,
            ConsentEvidenceService consent,
            VerificationCodeProtector codeProtector) {
        this(jdbc, json, consent, codeProtector, Clock.systemUTC());
    }

    SignupFlowService(
            JdbcTemplate jdbc,
            ObjectMapper json,
            ConsentEvidenceService consent,
            VerificationCodeProtector codeProtector,
            Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.consent = consent;
        this.codeProtector = codeProtector;
        this.clock = clock;
    }

    @Transactional
    public SignupFlowView startSignup(String email) {
        var normalized = normalizeAndValidateEmail(email);
        var schema = jdbc.queryForMap("""
                select id, version from questionnaire_schemas
                where active_for_new_signup order by version desc limit 1
                """);
        var documents = jdbc.query(
                """
                select document_id, document_version from legal_documents
                where active_for_new_signup order by document_id
                """,
                rs -> {
                    var result = new java.util.LinkedHashMap<String, String>();
                    while (rs.next()) result.put(rs.getString(1), rs.getString(2));
                    return result;
                });
        if (!documents.keySet().equals(java.util.Set.of("TERMS", "ACCOUNT_RAG_PRIVACY"))) {
            throw new IllegalStateException("Exactly the required signup documents must be active");
        }
        var id = UUID.randomUUID();
        var expiry = clock.instant().plus(10, ChronoUnit.MINUTES);
        jdbc.update("""
                insert into signup_flows(
                    id, email, normalized_email, questionnaire_schema_id, document_versions, expires_at
                ) values (?, ?, ?, ?, ?::jsonb, ?)
                """,
                id, normalized, normalized, schema.get("id"), writeJson(documents), Timestamp.from(expiry));
        return new SignupFlowView(
                id, expiry, schema.get("version").toString(), documents,
                List.of("TERMS", "ACCOUNT_RAG_PRIVACY"),
                Map.of("TERMS", false, "ACCOUNT_RAG_PRIVACY", false));
    }

    @Transactional(readOnly = true)
    public SignupFlowView getFlow(UUID flowId) {
        var row = loadFlow(flowId, false);
        return toView(row);
    }

    @Transactional
    public CompletionResult completeSignup(UUID flowId, CompletionRequest request) {
        if (request == null) throw new SignupValidationException("Completion body is required");
        var flow = loadFlow(flowId, true);
        validateCompletion(flow, request);

        UUID userId;
        try {
            userId = jdbc.queryForObject("""
                    insert into users(email, normalized_email, origin, state)
                    values (?, ?, 'SIGNUP', 'PENDING_EMAIL_VERIFICATION') returning id
                    """, UUID.class, normalizeAndValidateEmail(request.email()), normalizeAndValidateEmail(request.email()));
        } catch (DataIntegrityViolationException duplicate) {
            throw new SignupConflictException("An account already exists for this email");
        }

        jdbc.update("""
                insert into credentials(user_id, password_hash, must_change_password)
                values (?, ?, false)
                """, userId, passwordEncoder.encode(request.password()));
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
        insertAnswer(userId, flow.schemaId(), "preferred_language", request.preferredLanguage());
        insertAnswer(userId, flow.schemaId(), "rag_answer_detail", request.ragAnswerDetail());
        consent.record(userId, request.termsEvidence());
        consent.record(userId, request.privacyEvidence());

        var code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        var challengeId = UUID.randomUUID();
        jdbc.update("""
                insert into auth_challenges(
                    id, flow_hash, user_id, purpose, target_identity, code_hash, expires_at,
                    payload, last_sent_at, resend_window_started_at
                ) values (?, ?, ?, 'SIGNUP_EMAIL_VERIFICATION', ?, ?, ?, '{}'::jsonb, now(), now())
                """,
                challengeId, sha256(flowId.toString()), userId, normalizeAndValidateEmail(request.email()),
                sha256(code), Timestamp.from(clock.instant().plus(10, ChronoUnit.MINUTES)));
        var notification = Map.of(
                "challenge_id", challengeId.toString(),
                "protected_code", codeProtector.protect(code),
                "template", "signup-email-verification");
        jdbc.update("""
                insert into notification_outbox(event_type, recipient, payload)
                values ('SIGNUP_EMAIL_VERIFICATION', ?, ?::jsonb)
                """, normalizeAndValidateEmail(request.email()), writeJson(notification));
        jdbc.update("update signup_flows set completed_at = now() where id = ?", flowId);
        return new CompletionResult("EMAIL_VERIFICATION");
    }

    @Transactional
    public void verifyEmail(UUID flowId, String code) {
        var challenge = jdbc.queryForMap("""
                select id, user_id, code_hash, attempt_count, expires_at, consumed_at
                from auth_challenges where flow_hash = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                for update
                """, sha256(flowId.toString()));
        if (challenge.get("consumed_at") != null
                || ((Timestamp) challenge.get("expires_at")).toInstant().isBefore(clock.instant())) {
            throw new SignupConflictException("Verification challenge is no longer active");
        }
        var attempts = ((Number) challenge.get("attempt_count")).intValue();
        if (attempts >= 5 || !MessageDigest.isEqual((byte[]) challenge.get("code_hash"), sha256(code))) {
            jdbc.update("update auth_challenges set attempt_count = attempt_count + 1 where id = ?", challenge.get("id"));
            throw new SignupValidationException("Verification code is invalid");
        }
        jdbc.update("update auth_challenges set consumed_at = now() where id = ?", challenge.get("id"));
        jdbc.update("""
                update users set state = 'ACTIVE', email_verified_at = now(), updated_at = now()
                where id = ? and state = 'PENDING_EMAIL_VERIFICATION'
                """, challenge.get("user_id"));
    }

    @Transactional
    public void resendSignupVerification(UUID flowId) {
        var rows = jdbc.query("""
                select id, target_identity, resend_count, last_sent_at,
                       resend_window_started_at, expires_at, consumed_at
                from auth_challenges
                where flow_hash = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                for update
                """, (rs, rowNum) -> new ResendChallenge(
                rs.getObject("id", UUID.class), rs.getString("target_identity"),
                rs.getInt("resend_count"),
                rs.getTimestamp("last_sent_at") == null ? null : rs.getTimestamp("last_sent_at").toInstant(),
                rs.getTimestamp("resend_window_started_at") == null ? null
                        : rs.getTimestamp("resend_window_started_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("consumed_at") != null),
                sha256(flowId.toString()));
        if (rows.size() != 1) throw new SignupConflictException("Verification challenge is not active");
        var challenge = rows.getFirst();
        var now = clock.instant();
        var count = challenge.windowStartedAt() != null
                        && challenge.windowStartedAt().plus(1, ChronoUnit.HOURS).isAfter(now)
                ? challenge.resendCount() : 0;
        if (challenge.consumed() || count >= 5
                || (challenge.lastSentAt() != null && challenge.lastSentAt().plusSeconds(60).isAfter(now))) {
            throw new SignupConflictException("Verification message cannot be resent yet");
        }
        var code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        jdbc.update("""
                update auth_challenges set code_hash = ?, attempt_count = 0, resend_count = ?,
                    last_sent_at = ?, resend_window_started_at = ?, expires_at = ? where id = ?
                """, sha256(code), count + 1, Timestamp.from(now),
                Timestamp.from(count == 0 ? now : challenge.windowStartedAt()),
                Timestamp.from(now.plus(10, ChronoUnit.MINUTES)), challenge.id());
        var notification = Map.of(
                "challenge_id", challenge.id().toString(),
                "protected_code", codeProtector.protect(code),
                "template", "signup-email-verification");
        jdbc.update("""
                insert into notification_outbox(event_type, recipient, payload)
                values ('SIGNUP_EMAIL_VERIFICATION', ?, ?::jsonb)
                """, challenge.targetIdentity(), writeJson(notification));
    }

    private void validateCompletion(FlowRow flow, CompletionRequest request) {
        if (flow.completedAt() != null || !flow.expiresAt().isAfter(clock.instant())) {
            throw new SignupConflictException("Signup flow is no longer active");
        }
        var normalized = normalizeAndValidateEmail(request.email());
        if (!normalized.equals(flow.normalizedEmail())) invalid("Email does not match signup flow");
        if (request.password() == null || !PASSWORD.matcher(request.password()).matches()) {
            invalid("Password does not satisfy the policy");
        }
        if (!request.age14Confirmed()) invalid("Age confirmation is required");
        var definition = readJson(flow.schemaDefinition());
        requireChoice(definition, "preferred_language", request.preferredLanguage());
        requireChoice(definition, "rag_answer_detail", request.ragAnswerDetail());
        validateEvidence(flow, request.termsEvidence(), "TERMS");
        validateEvidence(flow, request.privacyEvidence(), "ACCOUNT_RAG_PRIVACY");
    }

    private void validateEvidence(FlowRow flow, Evidence evidence, String expectedId) {
        if (evidence == null || evidence.acceptedAt() == null || !expectedId.equals(evidence.documentId())) {
            invalid("Required acceptance evidence is missing");
        }
        var pinned = flow.documentVersions().get(expectedId);
        var document = jdbc.queryForMap("""
                select body_sha256, path from legal_documents
                where document_id = ? and document_version = ?
                """, expectedId, pinned);
        if (!pinned.equals(evidence.documentVersion())
                || !document.get("body_sha256").toString().equals(evidence.bodySha256())
                || !document.get("path").toString().equals(evidence.path())
                || !evidence.bodySha256().matches("^[0-9a-f]{64}$")) {
            invalid("Acceptance evidence does not match the pinned document");
        }
    }

    private void insertAnswer(UUID userId, UUID schemaId, String question, String value) {
        jdbc.update("""
                insert into questionnaire_responses(
                    user_id, schema_id, question_key, response_version, response_value
                ) values (?, ?, ?, 1, jsonb_build_object('value', ?::text))
                """, userId, schemaId, question, value);
    }

    private FlowRow loadFlow(UUID id, boolean forUpdate) {
        var sql = """
                select f.id, f.normalized_email, f.expires_at, f.completed_at,
                       f.questionnaire_schema_id, q.version, q.definition::text,
                       f.document_versions::text
                from signup_flows f join questionnaire_schemas q on q.id = f.questionnaire_schema_id
                where f.id = ?
                """ + (forUpdate ? " for update of f" : "");
        var rows = jdbc.query(sql, (rs, rowNum) -> new FlowRow(
                rs.getObject("id", UUID.class),
                rs.getString("normalized_email"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
                rs.getObject("questionnaire_schema_id", UUID.class),
                rs.getInt("version"),
                rs.getString("definition"),
                readStringMap(rs.getString("document_versions"))), id);
        if (rows.size() != 1) throw new SignupValidationException("Signup flow was not found");
        return rows.getFirst();
    }

    private SignupFlowView toView(FlowRow row) {
        return new SignupFlowView(
                row.id(), row.expiresAt(), Integer.toString(row.schemaVersion()), row.documentVersions(),
                List.of("TERMS", "ACCOUNT_RAG_PRIVACY"),
                Map.of("TERMS", false, "ACCOUNT_RAG_PRIVACY", false));
    }

    private String normalizeAndValidateEmail(String email) {
        if (email == null) invalid("Email is required");
        var normalized = email.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320 || !EMAIL.matcher(normalized).matches()) invalid("Email is invalid");
        return normalized;
    }

    @SuppressWarnings("unchecked")
    private void requireChoice(Map<String, Object> definition, String key, String selected) {
        var choices = (List<Object>) definition.get(key);
        if (choices == null || selected == null || !choices.contains(selected)) invalid("Questionnaire answer is invalid");
    }

    private Map<String, Object> readJson(String value) {
        try {
            return json.readValue(value, MAP_TYPE);
        } catch (Exception exception) {
            throw new IllegalStateException("Invalid stored questionnaire definition", exception);
        }
    }

    private Map<String, String> readStringMap(String value) {
        try {
            return json.readValue(value, new TypeReference<>() {});
        } catch (Exception exception) {
            throw new IllegalStateException("Invalid pinned document versions", exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not serialize signup data", exception);
        }
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static void invalid(String message) {
        throw new SignupValidationException(message);
    }

    public record Evidence(
            String documentId, String documentVersion, String bodySha256, Instant acceptedAt, String path) {}

    public record CompletionRequest(
            String email,
            String password,
            String preferredLanguage,
            String ragAnswerDetail,
            @JsonProperty("age_14_confirmed") boolean age14Confirmed,
            Evidence termsEvidence,
            Evidence privacyEvidence) {}

    public record SignupFlowView(
            UUID flowId,
            Instant expiresAt,
            String questionnaireVersion,
            Map<String, String> documentVersions,
            List<String> acceptanceControls,
            Map<String, Boolean> initialAcceptanceValues) {}

    public record CompletionResult(String next) {}

    private record FlowRow(
            UUID id,
            String normalizedEmail,
            Instant expiresAt,
            Instant completedAt,
            UUID schemaId,
            int schemaVersion,
            String schemaDefinition,
            Map<String, String> documentVersions) {}

    private record ResendChallenge(
            UUID id,
            String targetIdentity,
            int resendCount,
            Instant lastSentAt,
            Instant windowStartedAt,
            Instant expiresAt,
            boolean consumed) {}
}
