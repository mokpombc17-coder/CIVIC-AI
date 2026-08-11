package ai.civic.mainauth.signup;

import static org.assertj.core.api.Assertions.assertThat;

import ai.civic.mainauth.questionnaire.QuestionnaireSchemaService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class QuestionnaireVersionTest extends PostgresIntegrationTest {
    @Autowired SignupFlowService signup;
    @Autowired QuestionnaireSchemaService schemas;

    @Test
    void alreadyStartedFlowKeepsPinnedVersionAndNextFlowUsesNewVersion() {
        var flowA = signup.startSignup("flow-a@example.com");
        schemas.publishForNewSignups(2, """
                {"preferred_language":["ko","en"],"rag_answer_detail":["concise","balanced","detailed"]}
                """);
        var flowB = signup.startSignup("flow-b@example.com");

        assertThat(flowA.questionnaireVersion()).isEqualTo("1");
        assertThat(signup.getFlow(flowA.flowId()).questionnaireVersion()).isEqualTo("1");
        assertThat(flowB.questionnaireVersion()).isEqualTo("2");
    }
}
