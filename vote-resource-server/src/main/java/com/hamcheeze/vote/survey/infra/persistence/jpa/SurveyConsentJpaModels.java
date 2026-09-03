package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "survey_consent_documents")
class SurveyConsentDocumentJpaEntity {

    @Id
    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "document_code", nullable = false, length = 100)
    private String documentCode;

    @Column(name = "document_version", nullable = false, length = 100)
    private String documentVersion;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "document_content", nullable = false)
    private String documentContent;

    @Column(name = "document_hash", nullable = false, length = 64)
    private String documentHash;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    protected SurveyConsentDocumentJpaEntity() {
    }

    SurveyConsentDocumentJpaEntity(SurveyConsentDocument document) {
        replace(document);
    }

    void replace(SurveyConsentDocument document) {
        roundId = document.roundId().value();
        documentCode = document.documentCode();
        documentVersion = document.documentVersion();
        title = document.title();
        documentContent = document.content();
        documentHash = document.contentHash();
        publishedAt = document.publishedAt();
    }

    UUID roundId() {
        return roundId;
    }

    String documentCode() {
        return documentCode;
    }

    String documentVersion() {
        return documentVersion;
    }

    String title() {
        return title;
    }

    String documentContent() {
        return documentContent;
    }

    String documentHash() {
        return documentHash;
    }

    Instant publishedAt() {
        return publishedAt;
    }
}

@Entity
@Immutable
@Table(name = "survey_consent_receipts")
class SurveyConsentReceiptJpaEntity {

    @Id
    @Column(name = "consent_receipt_id", nullable = false)
    private UUID consentReceiptId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "document_code", nullable = false, length = 100)
    private String documentCode;

    @Column(name = "document_version", nullable = false, length = 100)
    private String documentVersion;

    @Column(name = "document_content_snapshot", nullable = false)
    private String documentContentSnapshot;

    @Column(name = "document_hash", nullable = false, length = 64)
    private String documentHash;

    @Column(name = "accepted_at", nullable = false)
    private Instant acceptedAt;

    @Column(name = "client_clicked_at")
    private Instant clientClickedAt;

    @Column(name = "idempotency_key", nullable = false)
    private UUID idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    protected SurveyConsentReceiptJpaEntity() {
    }

    SurveyConsentReceiptJpaEntity(SurveyConsentReceipt receipt) {
        consentReceiptId = receipt.id().value();
        userId = receipt.userId().value();
        roundId = receipt.roundId().value();
        documentCode = receipt.documentCode();
        documentVersion = receipt.documentVersion();
        documentContentSnapshot = receipt.documentContentSnapshot();
        documentHash = receipt.documentHash();
        acceptedAt = receipt.acceptedAt();
        clientClickedAt = receipt.clientClickedAt();
        idempotencyKey = receipt.idempotencyKey();
        requestHash = receipt.requestHash();
    }

    UUID consentReceiptId() {
        return consentReceiptId;
    }

    String userId() {
        return userId;
    }

    UUID roundId() {
        return roundId;
    }

    String documentCode() {
        return documentCode;
    }

    String documentVersion() {
        return documentVersion;
    }

    String documentContentSnapshot() {
        return documentContentSnapshot;
    }

    String documentHash() {
        return documentHash;
    }

    Instant acceptedAt() {
        return acceptedAt;
    }

    Instant clientClickedAt() {
        return clientClickedAt;
    }

    UUID idempotencyKey() {
        return idempotencyKey;
    }

    String requestHash() {
        return requestHash;
    }
}
