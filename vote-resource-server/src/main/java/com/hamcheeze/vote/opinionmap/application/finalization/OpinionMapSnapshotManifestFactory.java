package com.hamcheeze.vote.opinionmap.application.finalization;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.UUID;

@Component
public class OpinionMapSnapshotManifestFactory {

    public static final String HASH_FORMAT =
            OpinionMapSnapshotManifest.HASH_FORMAT_V1;

    private static final Comparator<UUID> UUID_ORDER =
            Comparator.comparing(UUID::toString);
    private static final Comparator<OpinionMapSubmissionProjection>
            SUBMISSION_ORDER = Comparator.comparing(
                    OpinionMapSubmissionProjection::submissionId,
                    UUID_ORDER);

    /**
     * Hashes every response field after sorting by submissionId. Values use
     * fixed-width primitives or a four-byte length followed by UTF-8 bytes;
     * nullable UUIDs use a leading presence boolean.
     */
    public OpinionMapSnapshotManifest create(
            OpinionMapSnapshot snapshot,
            List<OpinionMapSubmissionProjection> responses
    ) {
        Objects.requireNonNull(snapshot, "snapshot");
        List<OpinionMapSubmissionProjection> sorted = new ArrayList<>(
                Objects.requireNonNull(responses, "responses"));
        sorted.sort(SUBMISSION_ORDER);
        if (sorted.size() != snapshot.responseCount()) {
            throw new IllegalArgumentException(
                    "responses must match snapshot responseCount");
        }

        Map<UUID, Integer> counts = new TreeMap<>(UUID_ORDER);
        HashSet<UUID> submissionIds = new HashSet<>();
        for (OpinionMapSubmissionProjection response : sorted) {
            Objects.requireNonNull(response, "response");
            if (!snapshot.taskId().equals(response.taskId())) {
                throw new IllegalArgumentException(
                        "all responses must belong to snapshot task");
            }
            if (!submissionIds.add(response.submissionId())) {
                throw new IllegalArgumentException(
                        "responses must have unique submissionIds");
            }
            counts.merge(response.selectedOptionId(), 1, Math::addExact);
        }

        List<OpinionMapOptionCount> optionCounts = counts.entrySet().stream()
                .map(entry -> new OpinionMapOptionCount(
                        entry.getKey(), entry.getValue()))
                .toList();
        return new OpinionMapSnapshotManifest(
                snapshot.snapshotId(),
                HASH_FORMAT,
                hash(sorted),
                sorted.size(),
                optionCounts);
    }

    private static String hash(
            List<OpinionMapSubmissionProjection> responses
    ) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                writeText(output, HASH_FORMAT);
                output.writeInt(responses.size());
                for (OpinionMapSubmissionProjection response : responses) {
                    writeResponse(output, response);
                }
            }
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(bytes.toByteArray()));
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "in-memory response hash encoding failed", exception);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 must be available", exception);
        }
    }

    private static void writeResponse(
            DataOutputStream output,
            OpinionMapSubmissionProjection response
    ) throws IOException {
        writeUuid(output, response.submissionId());
        writeText(output, response.userId());
        writeUuid(output, response.taskId());
        writeUuid(output, response.predictionId());
        writeUuid(output, response.personaGenerationId());
        writeUuid(output, response.personaVersionId());
        writeUuid(output, response.questionId());
        writeUuid(output, response.selectedOptionId());
        writeText(output, response.reasonSource().name());
        writeNullableUuid(output, response.acceptedPredictedReasonId());
        writeText(output, response.finalReason());
        output.writeLong(response.submittedAt().getEpochSecond());
        output.writeInt(response.submittedAt().getNano());
    }

    private static void writeUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeLong(value.getMostSignificantBits());
        output.writeLong(value.getLeastSignificantBits());
    }

    private static void writeNullableUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeBoolean(value != null);
        if (value != null) {
            writeUuid(output, value);
        }
    }

    private static void writeText(
            DataOutputStream output,
            String value
    ) throws IOException {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        output.writeInt(encoded.length);
        output.write(encoded);
    }
}
