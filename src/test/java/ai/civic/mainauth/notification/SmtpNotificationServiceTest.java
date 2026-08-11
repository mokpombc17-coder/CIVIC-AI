package ai.civic.mainauth.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class SmtpNotificationServiceTest {
    @Test
    void challengeMessagesUsePurposeSpecificSubjectsWithoutAutomaticRetry() {
        var sender = mock(JavaMailSender.class);
        var service = new SmtpNotificationService(sender);

        service.sendChallenge("person@example.com", "123456", "PASSWORD_RESET");

        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        assertThat(message.getValue().getSubject()).isEqualTo("CIVIC 비밀번호 재설정");
        assertThat(message.getValue().getText()).contains("123456", "10분");
    }
}
