package com.hamcheeze.vote.verification;

import com.hamcheeze.vote.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class DomainBoundarySchemaIntegrationTest {

    private static final List<String> LEGACY_OPINION_MAP_TABLES = List.of(
            "opinion_map_inbox",
            "opinion_map_submission_projections",
            "opinion_map_finalizations",
            "opinion_map_snapshots",
            "opinion_map_snapshot_manifests",
            "opinion_map_snapshot_option_counts"
    );

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void schemaHasNoCrossDomainForeignKeys() {
        List<String> crossDomainForeignKeys = jdbcTemplate.queryForList("""
                WITH foreign_keys AS (
                    SELECT constraint_definition.conname,
                           source_table.relname AS source_table,
                           target_table.relname AS target_table,
                           CASE
                               WHEN source_table.relname ~ '^survey_' THEN 'survey'
                               WHEN source_table.relname ~ '^persona_' THEN 'persona'
                               WHEN source_table.relname = 'tasks'
                                 OR source_table.relname ~ '^task_' THEN 'task'
                               WHEN source_table.relname ~ '^opinion_map_' THEN 'opinionmap'
                           END AS source_domain,
                           CASE
                               WHEN target_table.relname ~ '^survey_' THEN 'survey'
                               WHEN target_table.relname ~ '^persona_' THEN 'persona'
                               WHEN target_table.relname = 'tasks'
                                 OR target_table.relname ~ '^task_' THEN 'task'
                               WHEN target_table.relname ~ '^opinion_map_' THEN 'opinionmap'
                           END AS target_domain
                    FROM pg_constraint constraint_definition
                    JOIN pg_class source_table
                      ON source_table.oid = constraint_definition.conrelid
                    JOIN pg_namespace source_namespace
                      ON source_namespace.oid = source_table.relnamespace
                    JOIN pg_class target_table
                      ON target_table.oid = constraint_definition.confrelid
                    JOIN pg_namespace target_namespace
                      ON target_namespace.oid = target_table.relnamespace
                    WHERE constraint_definition.contype = 'f'
                      AND source_namespace.nspname = 'public'
                      AND target_namespace.nspname = 'public'
                )
                SELECT source_table || ' -> ' || target_table
                       || ' (' || conname || ')'
                FROM foreign_keys
                WHERE source_domain IS NOT NULL
                  AND target_domain IS NOT NULL
                  AND source_domain <> target_domain
                ORDER BY source_table, target_table, conname
                """, String.class);

        assertThat(crossDomainForeignKeys)
                .as("cross-domain foreign keys")
                .isEmpty();
    }

    @Test
    void legacyOpinionMapPipelineTablesAreRemoved() {
        List<String> remainingTables = jdbcTemplate.queryForList("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (?, ?, ?, ?, ?, ?)
                ORDER BY table_name
                """, String.class, LEGACY_OPINION_MAP_TABLES.toArray());

        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE version = '27' AND success = true
                """, Integer.class);

        assertThat(remainingTables).isEmpty();
        assertThat(migrationCount).isEqualTo(1);
    }

    @Test
    void personaGenerationOwnsItsSourceIdentity() {
        List<String> sourceColumns = jdbcTemplate.queryForList("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'persona_generations'
                  AND column_name IN (
                    'source_type', 'source_id', 'survey_response_id')
                ORDER BY column_name
                """, String.class);
        Integer sourceConstraintCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM pg_constraint
                WHERE conname IN (
                    'uq_persona_generation_source',
                    'ck_persona_generation_source_type')
                """, Integer.class);
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE version = '10' AND success = true
                """, Integer.class);

        assertThat(sourceColumns)
                .containsExactly("source_id", "source_type");
        assertThat(sourceConstraintCount).isEqualTo(2);
        assertThat(migrationCount).isEqualTo(1);
    }
}
