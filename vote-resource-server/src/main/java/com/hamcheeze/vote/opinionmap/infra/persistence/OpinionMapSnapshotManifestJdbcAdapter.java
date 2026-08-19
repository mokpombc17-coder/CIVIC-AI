package com.hamcheeze.vote.opinionmap.infra.persistence;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotManifestRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OpinionMapSnapshotManifestJdbcAdapter
        implements OpinionMapSnapshotManifestRepository {

    private final JdbcTemplate jdbcTemplate;

    public OpinionMapSnapshotManifestJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean insertIfAbsent(OpinionMapSnapshotManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        int inserted = jdbcTemplate.update("""
                INSERT INTO opinion_map_snapshot_manifests (
                    snapshot_id, response_hash_format,
                    response_hash_sha256, response_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (snapshot_id) DO NOTHING
                """,
                manifest.snapshotId(),
                manifest.responseHashFormat(),
                manifest.responseHashSha256(),
                manifest.responseCount());
        if (inserted == 0) {
            return false;
        }
        if (!manifest.optionCounts().isEmpty()) {
            jdbcTemplate.batchUpdate("""
                            INSERT INTO opinion_map_snapshot_option_counts (
                                snapshot_id, option_id, response_count)
                            VALUES (?, ?, ?)
                            """,
                    manifest.optionCounts(),
                    manifest.optionCounts().size(),
                    (statement, optionCount) -> {
                        statement.setObject(1, manifest.snapshotId());
                        statement.setObject(2, optionCount.optionId());
                        statement.setInt(3, optionCount.responseCount());
                    });
        }
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapSnapshotManifest> findBySnapshotId(
            UUID snapshotId
    ) {
        Objects.requireNonNull(snapshotId, "snapshotId");
        Optional<ManifestRow> row = jdbcTemplate.query("""
                        SELECT response_hash_format, response_hash_sha256,
                               response_count
                        FROM opinion_map_snapshot_manifests
                        WHERE snapshot_id = ?
                        """,
                (resultSet, rowNumber) -> new ManifestRow(
                        resultSet.getString("response_hash_format"),
                        resultSet.getString("response_hash_sha256"),
                        resultSet.getInt("response_count")),
                snapshotId).stream().findFirst();
        if (row.isEmpty()) {
            return Optional.empty();
        }
        List<OpinionMapOptionCount> optionCounts = jdbcTemplate.query("""
                        SELECT option_id, response_count
                        FROM opinion_map_snapshot_option_counts
                        WHERE snapshot_id = ?
                        ORDER BY option_id
                        """,
                (resultSet, rowNumber) -> new OpinionMapOptionCount(
                        resultSet.getObject("option_id", UUID.class),
                        resultSet.getInt("response_count")),
                snapshotId);
        ManifestRow manifest = row.orElseThrow();
        return Optional.of(new OpinionMapSnapshotManifest(
                snapshotId,
                manifest.responseHashFormat(),
                manifest.responseHashSha256(),
                manifest.responseCount(),
                optionCounts));
    }

    private record ManifestRow(
            String responseHashFormat,
            String responseHashSha256,
            int responseCount
    ) {
    }
}
