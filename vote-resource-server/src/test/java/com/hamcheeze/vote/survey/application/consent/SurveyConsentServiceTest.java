package com.hamcheeze.vote.survey.application.consent;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SurveyConsentServiceTest {

    private static final SurveyRoundId ROUND_ID =
            new SurveyRoundId(UUID.randomUUID());
    private static final SurveyUserId USER =
            new SurveyUserId("consent-user");
    private static final Instant NOW =
            Instant.parse("2026-09-03T01:02:03.123456Z");

    private final InMemoryRepository repository =
            new InMemoryRepository();
    private final SurveyRoundRepository rounds =
            mock(SurveyRoundRepository.class);
    private final UserTransactionLock userTransactions =
            mock(UserTransactionLock.class);
    private final SurveyConsentService service = new SurveyConsentService(
            repository,
            rounds,
            userTransactions,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void activeRound() {
        SurveyRound round = mock(SurveyRound.class);
        when(round.id()).thenReturn(ROUND_ID);
        when(rounds.findById(ROUND_ID)).thenReturn(Optional.of(round));
        when(rounds.findActive()).thenReturn(Optional.of(round));
    }

    @Test
    void serverTimeAndImmutableSnapshotAreStoredAndReplayIsStable() {
        service.publishDocument(
                ROUND_ID, "survey-consent", "v1", "Consent", "Version one");
        Instant clientClickedAt = NOW.minusSeconds(3);
        String key = UUID.randomUUID().toString();
        SurveyConsentService.AcceptConsentCommand command =
                new SurveyConsentService.AcceptConsentCommand(
                        "survey-consent", "v1", ROUND_ID,
                        clientClickedAt);

        SurveyConsentService.Acceptance first = service.accept(
                USER, key, command);
        SurveyConsentService.Acceptance replay = service.accept(
                USER, key, command);

        assertThat(first.replayed()).isFalse();
        assertThat(first.receipt().acceptedAt()).isEqualTo(NOW);
        assertThat(first.receipt().clientClickedAt())
                .isEqualTo(clientClickedAt);
        assertThat(first.receipt().documentContentSnapshot())
                .isEqualTo("Version one");
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.receipt().id()).isEqualTo(first.receipt().id());
        assertThat(replay.receipt().acceptedAt()).isEqualTo(NOW);
        verify(userTransactions, org.mockito.Mockito.times(2))
                .lock(USER.value());
    }

    @Test
    void sameKeyWithDifferentPayloadConflicts() {
        service.publishDocument(
                ROUND_ID, "survey-consent", "v1", "Consent", "Version one");
        String key = UUID.randomUUID().toString();
        service.accept(USER, key,
                new SurveyConsentService.AcceptConsentCommand(
                        "survey-consent", "v1", ROUND_ID, null));

        assertThatThrownBy(() -> service.accept(USER, key,
                new SurveyConsentService.AcceptConsentCommand(
                        "survey-consent", "v2", ROUND_ID, null)))
                .isInstanceOf(SurveyConsentException.class)
                .extracting(exception ->
                        ((SurveyConsentException) exception).code())
                .isEqualTo("IDEMPOTENCY_CONFLICT");
    }

    @Test
    void receiptMustBelongToUserRoundAndCurrentDocumentVersion() {
        service.publishDocument(
                ROUND_ID, "survey-consent", "v1", "Consent", "Version one");
        ConsentReceiptId receiptId = service.accept(
                        USER,
                        UUID.randomUUID().toString(),
                        new SurveyConsentService.AcceptConsentCommand(
                                "survey-consent", "v1", ROUND_ID, null))
                .receipt().id();

        assertThat(service.validateReceipt(receiptId, USER, ROUND_ID).valid())
                .isTrue();
        assertThat(service.validateReceipt(
                        receiptId,
                        new SurveyUserId("another-user"),
                        ROUND_ID).code())
                .isEqualTo("CONSENT_RECEIPT_INVALID");

        service.publishDocument(
                ROUND_ID, "survey-consent", "v2", "Consent", "Version two");
        assertThat(service.validateReceipt(receiptId, USER, ROUND_ID).code())
                .isEqualTo("CONSENT_DOCUMENT_VERSION_CHANGED");
    }

    private static final class InMemoryRepository
            implements SurveyConsentRepository {

        private final Map<SurveyRoundId, SurveyConsentDocument> documents =
                new HashMap<>();
        private final Map<ConsentReceiptId, SurveyConsentReceipt> receipts =
                new HashMap<>();

        @Override
        public SurveyConsentDocument saveDocument(
                SurveyConsentDocument document
        ) {
            documents.put(document.roundId(), document);
            return document;
        }

        @Override
        public Optional<SurveyConsentDocument> findDocumentByRoundId(
                SurveyRoundId roundId
        ) {
            return Optional.ofNullable(documents.get(roundId));
        }

        @Override
        public SurveyConsentReceipt insertReceipt(
                SurveyConsentReceipt receipt
        ) {
            receipts.put(receipt.id(), receipt);
            return receipt;
        }

        @Override
        public Optional<SurveyConsentReceipt> findReceiptById(
                ConsentReceiptId receiptId
        ) {
            return Optional.ofNullable(receipts.get(receiptId));
        }

        @Override
        public Optional<SurveyConsentReceipt>
        findReceiptByUserIdAndIdempotencyKey(
                SurveyUserId userId,
                UUID idempotencyKey
        ) {
            return receipts.values().stream()
                    .filter(receipt -> receipt.userId().equals(userId))
                    .filter(receipt -> receipt.idempotencyKey()
                            .equals(idempotencyKey))
                    .findFirst();
        }
    }
}
