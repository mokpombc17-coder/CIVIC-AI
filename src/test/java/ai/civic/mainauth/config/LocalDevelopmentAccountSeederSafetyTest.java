package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;

class LocalDevelopmentAccountSeederSafetyTest {
    @Test
    void refusesToSeedAccountsIntoANonLoopbackDatabase() {
        var seeder = new LocalDevelopmentAccountSeeder(
                new JdbcTemplate(),
                "jdbc:postgresql://database.example.test:5432/civic_main",
                "admin@dev.civic.test",
                "CivicDevAdmin!2026",
                "CivicDevUser!2026");

        assertThatThrownBy(() -> seeder.run(new DefaultApplicationArguments(new String[0])))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Local development account seeding is allowed only for a loopback PostgreSQL URL");
    }
}
