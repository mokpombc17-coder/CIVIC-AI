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
                               WHEN source_table.relname = 'results'
                                 OR source_table.relname ~ '^result_' THEN 'result'
                           END AS source_domain,
                           CASE
                               WHEN target_table.relname ~ '^survey_' THEN 'survey'
                               WHEN target_table.relname ~ '^persona_' THEN 'persona'
                               WHEN target_table.relname = 'tasks'
                                 OR target_table.relname ~ '^task_' THEN 'task'
                               WHEN target_table.relname = 'results'
                                 OR target_table.relname ~ '^result_' THEN 'result'
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
}
