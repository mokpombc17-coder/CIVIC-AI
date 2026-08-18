package ai.civic.mainauth.signup;

import ai.civic.mainauth.consent.ConsentEvidenceService;
import ai.civic.mainauth.feature.RuntimeFeatureGateService;
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
import org.springframework.dao.EmptyResultDataAccessException;
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
    private final RuntimeFeatureGateService featureGates;
    private final Clock clock;
    private final Argon2PasswordEncoder passwordEncoder = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    @Autowired
    public SignupFlowService(
            JdbcTemplate jdbc,
            ObjectMapper json,
            ConsentEvidenceService consent,
            VerificationCodeProtector codeProtector,
            RuntimeFeatureGateService featureGates) {
        this(jdbc, json, consent, codeProtector, featureGates, Clock.systemUTC());
    }

    SignupFlowService(
            JdbcTemplate jdbc,
            ObjectMapper json,
            ConsentEvidenceService consent,
            VerificationCodeProtector codeProtector,
            RuntimeFeatureGateService featureGates,
            Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.consent = consent;
        this.codeProtector = codeProtector;
        this.featureGates = featureGates;
        this.clock = clock;
    }

    @Transactional
    public SignupFlowView startSignup(String email) {
        featureGates.requireEnabled("PUBLIC_SIGNUP_ENABLED");
        var normalized = normalizeAndValidateEmail(email);
        var schema = jdbc.queryForMap("""
                select id, version from questionnaire_schemas
                where active_for_new_signup order by version desc limit 1
                """);
        var documents = jdbc.query(
                """
                select document_id, document_version, body_sha256, path from legal_documents
                where active_for_new_signup order by document_id
                """,
                rs -> {
                    var result = new java.util.LinkedHashMap<String, SignupDocumentView>();
                    while (rs.next()) {
                        var document = new SignupDocumentView(
                                rs.getString("document_id"), rs.getString("document_version"),
                                rs.getString("body_sha256"), rs.getString("path"));
                        result.put(document.documentId(), document);
                    }
                    return result;
                });
        if (!documents.keySet().equals(java.util.Set.of("TERMS", "ACCOUNT_RAG_PRIVACY"))) {
            throw new IllegalStateException("Exactly the required signup documents must be active");
        }
        var documentVersions = new java.util.LinkedHashMap<String, String>();
        documents.forEach((id, document) -> documentVersions.put(id, document.documentVersion()));
        var id = UUID.randomUUID();
        var expiry = clock.instant().plus(10, ChronoUnit.MINUTES);
        jdbc.update("""
                insert into signup_flows(
                    id, email, normalized_email, questionnaire_schema_id, document_versions, expires_at
                ) values (?, ?, ?, ?, ?::jsonb, ?)
                """,
                id, normalized, normalized, schema.get("id"), writeJson(documentVersions), Timestamp.from(expiry));
        return new SignupFlowView(
                id, expiry, schema.get("version").toString(), documentVersions, documents,
                List.of("TERMS", "ACCOUNT_RAG_PRIVACY"),
                Map.of("TERMS", false, "ACCOUNT_RAG_PRIVACY", false));
    }

    @Transactional(readOnly = true)
    public SignupFlowView getFlow(UUID flowId) {
        var row = loadFlow(flowId, false);
        return toView(row);
    }

    @Transactional
    public boolean purgeExpiredSignupFlows() {
        var pendingRegistrations = jdbc.query("""
                select u.id, u.normalized_email
                from users u
                where u.state = 'PENDING_EMAIL_VERIFICATION' and u.deleted_at is null
                  and exists (
                    select 1 from auth_challenges expired
                    where expired.user_id = u.id
                      and expired.purpose = 'SIGNUP_EMAIL_VERIFICATION'
                      and expired.expires_at <= now()
                  )
                  and not exists (
                    select 1 from auth_challenges active
                    where active.user_id = u.id
                      and active.purpose = 'SIGNUP_EMAIL_VERIFICATION'
                      and active.consumed_at is null and active.expires_at > now()
                  )
                order by u.created_at, u.id
                for update of u skip locked limit 100
                """, (rs, rowNum) -> new PendingRegistration(
                rs.getObject("id", UUID.class), rs.getString("normalized_email")));
        for (var pending : pendingRegistrations) {
            removeExpiredPendingRegistration(pending.normalizedEmail(), pending.userId());
        }
        var expiredFlows = jdbc.update("""
                with expired as (
                    select id from signup_flows where expires_at < now()
                    order by expires_at for update skip locked limit 100
                )
                delete from signup_flows f using expired e where f.id = e.id
                """);
        return !pendingRegistrations.isEmpty() || expiredFlows > 0;
    }

    @Transactional
    public CompletionResult completeSignup(UUID flowId, CompletionRequest request) {
        if (request == null) throw new SignupValidationException("Completion body is required");
        featureGates.requireEnabledForUpdate("PUBLIC_SIGNUP_ENABLED");
        var flowPreview = loadFlow(flowId, false);
        var pendingUserId = lockPendingRegistration(flowPreview.normalizedEmail());
        var flow = loadFlow(flowId, true);
        validateCompletion(flow, request);
        var normalizedEmail = normalizeAndValidateEmail(request.email());

        UUID userId;
        try {
            removeExpiredPendingRegistration(normalizedEmail, pendingUserId);
            userId = jdbc.queryForObject("""
                    insert into users(email, normalized_email, origin, state)
                    values (?, ?, 'SIGNUP', 'PENDING_EMAIL_VERIFICATION') returning id
                    """, UUID.class, normalizedEmail, normalizedEmail);
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
        var acceptedAt = clock.instant();
        consent.record(userId, serverAcceptedEvidence(request.termsEvidence(), acceptedAt));
        consent.record(userId, serverAcceptedEvidence(request.privacyEvidence(), acceptedAt));

        var code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        var challengeId = UUID.randomUUID();
        jdbc.update("""
                insert into auth_challenges(
                    id, flow_hash, user_id, purpose, target_identity, code_hash, expires_at,
                    payload, last_sent_at, resend_window_started_at
                ) values (?, ?, ?, 'SIGNUP_EMAIL_VERIFICATION', ?, ?, ?, '{}'::jsonb, now(), now())
                """,
                challengeId, sha256(flowId.toString()), userId, normalizedEmail,
                sha256(code), Timestamp.from(clock.instant().plus(10, ChronoUnit.MINUTES)));
        var notification = Map.of(
                "challenge_id", challengeId.toString(),
                "protected_code", codeProtector.protect(code),
                "template", "signup-email-verification");
        jdbc.update("""
                insert into notification_outbox(event_type, recipient, payload)
                values ('SIGNUP_EMAIL_VERIFICATION', ?, ?::jsonb)
                """, normalizedEmail, writeJson(notification));
        jdbc.update("update signup_flows set completed_at = now() where id = ?", flowId);
        return new CompletionResult("EMAIL_VERIFICATION");
    }

    private UUID lockPendingRegistration(String normalizedEmail) {
        var pending = jdbc.query("""
                select id from users
                where normalized_email = ? and state = 'PENDING_EMAIL_VERIFICATION'
                for update
                """, (rs, rowNum) -> rs.getObject(1, UUID.class), normalizedEmail);
        return pending.isEmpty() ? null : pending.getFirst();
    }

    private void removeExpiredPendingRegistration(String normalizedEmail, UUID userId) {
        if (userId == null) return;
        var activeChallenges = jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                  and consumed_at is null and expires_at > ?
                """, Integer.class, userId, Timestamp.from(clock.instant()));
        if (activeChallenges != null && activeChallenges > 0) return;
        jdbc.update("delete from auth_challenges where user_id = ?", userId);
        jdbc.update("delete from consent_evidence where user_id = ?", userId);
        jdbc.update("delete from questionnaire_responses where user_id = ?", userId);
        jdbc.update("delete from user_roles where user_id = ?", userId);
        jdbc.update("delete from credentials where user_id = ?", userId);
        jdbc.update("delete from notification_outbox where lower(btrim(recipient)) = ?", normalizedEmail);
        jdbc.update("delete from users where id = ? and state = 'PENDING_EMAIL_VERIFICATION'", userId);
    }

    @Transactional(noRollbackFor = SignupValidationException.class)
    public void verifyEmail(UUID flowId, String code) {
        var userId = lockSignupVerificationUser(flowId);
        Map<String, Object> challenge;
        try {
            challenge = jdbc.queryForMap("""
                    select id, user_id, code_hash, attempt_count, expires_at, consumed_at
                    from auth_challenges
                    where flow_hash = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION' and user_id = ?
                    for update
                    """, sha256(flowId.toString()), userId);
        } catch (EmptyResultDataAccessException exception) {
            throw new SignupValidationException("Verification flow is invalid");
        }
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
        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'ACTIVE',
                    jsonb_build_object('subject_id', id, 'version', account_state_version,
                                       'state', 'ACTIVE', 'reason', 'SIGNUP_VERIFIED', 'at', now())
                from users where id = ? and state = 'ACTIVE'
                on conflict (user_id, account_state_version) do nothing
                """, challenge.get("user_id"));
    }

    private UUID lockSignupVerificationUser(UUID flowId) {
        var userIds = jdbc.query("""
                select user_id from auth_challenges
                where flow_hash = ? and purpose = 'SIGNUP_EMAIL_VERIFICATION'
                """, (rs, rowNum) -> rs.getObject("user_id", UUID.class), sha256(flowId.toString()));
        if (userIds.size() != 1) throw new SignupValidationException("Verification flow is invalid");
        var userId = userIds.getFirst();
        var locked = jdbc.query("""
                select id from users
                where id = ? and state = 'PENDING_EMAIL_VERIFICATION' and deleted_at is null
                for update
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), userId);
        if (locked.size() != 1) throw new SignupValidationException("Verification flow is invalid");
        return userId;
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
        if (challenge.consumed() || !challenge.expiresAt().isAfter(now) || count >= 5
                || (challenge.lastSentAt() != null && challenge.lastSentAt().plusSeconds(60).isAfter(now))) {
            throw new SignupConflictException("Verification message cannot be resent yet");
        }
        var code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        retirePendingChallengeNotifications(challenge.id());
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

    private void retirePendingChallengeNotifications(UUID challengeId) {
        jdbc.update("""
                update notification_outbox set delivered_at = now(), leased_until = null,
                    last_error_code = 'CHALLENGE_SUPERSEDED'
                where delivered_at is null and event_type = 'SIGNUP_EMAIL_VERIFICATION'
                  and payload ->> 'challenge_id' = ?
                """, challengeId.toString());
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

    private Evidence serverAcceptedEvidence(Evidence evidence, Instant acceptedAt) {
        return new Evidence(
                evidence.documentId(), evidence.documentVersion(), evidence.bodySha256(),
                acceptedAt, evidence.path());
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
                documentViews(row.documentVersions()),
                List.of("TERMS", "ACCOUNT_RAG_PRIVACY"),
                Map.of("TERMS", false, "ACCOUNT_RAG_PRIVACY", false));
    }

    private Map<String, SignupDocumentView> documentViews(Map<String, String> versions) {
        var documents = new java.util.LinkedHashMap<String, SignupDocumentView>();
        versions.forEach((id, version) -> {
            var document = jdbc.queryForObject("""
                    select document_id, document_version, body_sha256, path
                    from legal_documents where document_id = ? and document_version = ?
                    """, (rs, rowNum) -> new SignupDocumentView(
                    rs.getString("document_id"), rs.getString("document_version"),
                    rs.getString("body_sha256"), rs.getString("path")), id, version);
            if (document == null) {
                throw new IllegalStateException("Pinned legal document is unavailable");
            }
            documents.put(id, document);
        });
        return documents;
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
            Map<String, SignupDocumentView> documents,
            List<String> acceptanceControls,
            Map<String, Boolean> initialAcceptanceValues) {}

    public record SignupDocumentView(
            String documentId, String documentVersion, String bodySha256, String path) {}

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

    private record PendingRegistration(UUID userId, String normalizedEmail) {}
}
