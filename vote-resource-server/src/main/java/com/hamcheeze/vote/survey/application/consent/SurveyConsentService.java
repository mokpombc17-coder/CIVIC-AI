package com.hamcheeze.vote.survey.application.consent;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyKey;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class SurveyConsentService {

    private final SurveyConsentRepository repository;
    private final SurveyRoundRepository rounds;
    private final UserTransactionLock userTransactions;
    private final Clock clock;

    @Autowired
    public SurveyConsentService(
            SurveyConsentRepository repository,
            SurveyRoundRepository rounds,
            UserTransactionLock userTransactions
    ) {
        this(repository, rounds, userTransactions, Clock.systemUTC());
    }

    SurveyConsentService(
            SurveyConsentRepository repository,
            SurveyRoundRepository rounds,
            UserTransactionLock userTransactions,
            Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.userTransactions = Objects.requireNonNull(
                userTransactions, "userTransactions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public SurveyConsentDocument publishDocument(
            SurveyRoundId roundId,
            String documentCode,
            String documentVersion,
            String title,
            String content
    ) {
        Objects.requireNonNull(roundId, "roundId");
        if (rounds.findById(roundId).isEmpty()) {
            throw error(404, "SURVEY_ROUND_NOT_FOUND",
                    "The survey round does not exist.");
        }
        String normalizedContent = required(content, "content");
        return repository.saveDocument(new SurveyConsentDocument(
                roundId,
                required(documentCode, "documentCode"),
                required(documentVersion, "documentVersion"),
                required(title, "title"),
                normalizedContent,
                sha256(normalizedContent),
                now()));
    }

    @Transactional(readOnly = true)
    public SurveyConsentDocument findCurrentDocument(SurveyRoundId roundId) {
        SurveyRound active = rounds.findActive()
                .filter(round -> round.id().equals(roundId))
                .orElseThrow(() -> error(
                        409,
                        "SURVEY_SUBMISSION_ROUND_CHANGED",
                        "The requested round is not the active round."));
        return repository.findDocumentByRoundId(active.id())
                .orElseThrow(() -> error(
                        404,
                        "CONSENT_DOCUMENT_NOT_FOUND",
                        "No consent document is configured for the round."));
    }

    @Transactional
    public Acceptance accept(
            SurveyUserId userId,
            String idempotencyKey,
            AcceptConsentCommand command
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(command, "command");
        UUID parsedKey = SurveyIdempotencyKey.parse(idempotencyKey).value();
        String requestHash = requestHash(command);
        userTransactions.lock(userId.value());

        Optional<SurveyConsentReceipt> existing = repository
                .findReceiptByUserIdAndIdempotencyKey(userId, parsedKey);
        if (existing.isPresent()) {
            if (!existing.get().requestHash().equals(requestHash)) {
                throw error(409, "IDEMPOTENCY_CONFLICT",
                        "The Idempotency-Key was already used with a "
                                + "different consent request.");
            }
            return new Acceptance(existing.get(), true);
        }

        SurveyConsentDocument document = findCurrentDocument(
                command.roundId());
        if (!document.documentCode().equals(command.documentCode())
                || !document.documentVersion().equals(
                command.documentVersion())) {
            throw error(409, "CONSENT_DOCUMENT_VERSION_CHANGED",
                    "The consent document changed before acceptance.");
        }

        SurveyConsentReceipt receipt = new SurveyConsentReceipt(
                new ConsentReceiptId(UUID.randomUUID()),
                userId,
                command.roundId(),
                document.documentCode(),
                document.documentVersion(),
                document.content(),
                document.contentHash(),
                now(),
                command.clientClickedAt(),
                parsedKey,
                requestHash);
        return new Acceptance(repository.insertReceipt(receipt), false);
    }

    @Transactional(readOnly = true)
    public ReceiptValidation validateReceipt(
            ConsentReceiptId receiptId,
            SurveyUserId userId,
            SurveyRoundId roundId
    ) {
        Objects.requireNonNull(receiptId, "receiptId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(roundId, "roundId");
        Optional<SurveyConsentReceipt> found = repository.findReceiptById(
                receiptId);
        if (found.isEmpty()) {
            return ReceiptValidation.invalid(
                    "CONSENT_RECEIPT_NOT_FOUND",
                    "The consent receipt does not exist.");
        }
        SurveyConsentReceipt receipt = found.get();
        if (!receipt.userId().equals(userId)) {
            return ReceiptValidation.invalid(
                    "CONSENT_RECEIPT_INVALID",
                    "The consent receipt does not belong to the user.");
        }
        if (!receipt.roundId().equals(roundId)) {
            return ReceiptValidation.invalid(
                    "CONSENT_RECEIPT_ROUND_MISMATCH",
                    "The consent receipt belongs to another survey round.");
        }
        Optional<SurveyConsentDocument> current = repository
                .findDocumentByRoundId(roundId);
        if (current.isEmpty()) {
            return ReceiptValidation.invalid(
                    "CONSENT_DOCUMENT_NOT_FOUND",
                    "No consent document is configured for the round.");
        }
        SurveyConsentDocument document = current.get();
        if (!receipt.documentCode().equals(document.documentCode())
                || !receipt.documentVersion().equals(
                document.documentVersion())
                || !receipt.documentHash().equals(document.contentHash())) {
            return ReceiptValidation.invalid(
                    "CONSENT_DOCUMENT_VERSION_CHANGED",
                    "The consent receipt does not cover the current document.");
        }
        return ReceiptValidation.validReceipt();
    }

    private String requestHash(AcceptConsentCommand command) {
        return sha256(String.join("\n",
                "survey-consent-accept-v1",
                command.documentCode(),
                command.documentVersion(),
                command.roundId().value().toString(),
                command.clientClickedAt() == null
                        ? "" : command.clientClickedAt().toString()));
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest
                    .getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String required(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return normalized;
    }

    private static SurveyConsentException error(
            int status,
            String code,
            String message
    ) {
        return new SurveyConsentException(status, code, message);
    }

    public record AcceptConsentCommand(
            String documentCode,
            String documentVersion,
            SurveyRoundId roundId,
            Instant clientClickedAt
    ) {
        public AcceptConsentCommand {
            documentCode = required(documentCode, "documentCode");
            documentVersion = required(documentVersion, "documentVersion");
            Objects.requireNonNull(roundId, "roundId");
        }
    }

    public record Acceptance(
            SurveyConsentReceipt receipt,
            boolean replayed
    ) {
        public Acceptance {
            Objects.requireNonNull(receipt, "receipt");
        }
    }

    public record ReceiptValidation(
            boolean valid,
            String code,
            String message
    ) {
        static ReceiptValidation validReceipt() {
            return new ReceiptValidation(true, null, null);
        }

        static ReceiptValidation invalid(String code, String message) {
            return new ReceiptValidation(false, code, message);
        }
    }
}
