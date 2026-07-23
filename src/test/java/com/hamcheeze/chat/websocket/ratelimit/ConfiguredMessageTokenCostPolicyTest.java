package com.hamcheeze.chat.websocket.ratelimit;

import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class ConfiguredMessageTokenCostPolicyTest {

    private final MessageTokenCostPolicy policy =
            new ConfiguredMessageTokenCostPolicy(
                    new ChatAdmissionProperties());

    @ParameterizedTest
    @CsvSource({
            "1,1",
            "50,1",
            "51,2",
            "100,2",
            "101,3",
            "200,3",
            "201,4",
            "500,4",
            "501,5",
            "2000,5"
    })
    void calculatesBoundaryCosts(int codePoints, int expectedCost) {
        assertThat(policy.calculate(codePoints)).isEqualTo(expectedCost);
    }
}
