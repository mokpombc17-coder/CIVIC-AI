package ai.civic.mainauth.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;

class SmtpNotificationServiceTest {
    @Test
    void twoFactorMessagesUseKoreanMultipartTemplate() throws Exception {
        var sender = mock(JavaMailSender.class);
        var message = new MimeMessage(Session.getInstance(new Properties()));
        when(sender.createMimeMessage()).thenReturn(message);
        var service = new SmtpNotificationService(sender, "approved-sender@example.com");

        service.sendChallenge("person@example.com", "123456", "TWO_FACTOR");

        verify(sender).send(message);
        message.saveChanges();
        var from = (InternetAddress) message.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("approved-sender@example.com");
        assertThat(from.getPersonal()).isEqualTo("CIVIC AI");
        assertThat(message.getSubject()).isEqualTo("[CIVIC AI] 2단계 인증 코드");
        assertThat(message.getRecipients(MimeMessage.RecipientType.TO)[0].toString())
                .isEqualTo("person@example.com");
        assertThat(message.getHeader("Auto-Submitted", null)).isEqualTo("auto-generated");

        assertThat(textPart(message, "text/plain"))
                .contains("2단계 인증 코드", "로그인 본인 확인", "123456", "10분 동안");
        assertThat(textPart(message, "text/html"))
                .contains(
                        "<html lang=\"ko\">",
                        "2단계 인증 코드",
                        "로그인 본인 확인",
                        "123456",
                        "max-width:520px",
                        "10분 동안")
                .doesNotContain("디자인과 전달 경로 확인");
    }

    @Test
    void challengeMessagesKeepPurposeSpecificKoreanCopy() {
        assertThat(AuthenticationMailTemplate.forChallenge("654321", "PASSWORD_RESET"))
                .satisfies(message -> {
                    assertThat(message.subject()).isEqualTo("[CIVIC AI] 비밀번호 재설정 코드");
                    assertThat(message.plainText()).contains("비밀번호 재설정", "654321");
                });
        assertThat(AuthenticationMailTemplate.forChallenge("654321", "TWO_FACTOR_ENABLE"))
                .satisfies(message -> {
                    assertThat(message.subject()).isEqualTo("[CIVIC AI] 2단계 인증 코드");
                    assertThat(message.htmlText()).contains("2단계 인증 설정을 완료");
                });
        assertThat(AuthenticationMailTemplate.forChallenge("654321", "REACTIVATION"))
                .satisfies(message -> {
                    assertThat(message.subject()).isEqualTo("[CIVIC AI] 계정 재활성화 코드");
                    assertThat(message.plainText()).contains("계정을 다시 활성화");
                });
        assertThat(AuthenticationMailTemplate.forChallenge("654321", "SIGNUP_EMAIL_VERIFICATION"))
                .satisfies(message -> {
                    assertThat(message.subject()).isEqualTo("[CIVIC AI] 이메일 인증 코드");
                    assertThat(message.htmlText()).contains("이메일 주소 확인");
                });
    }

    private static String textPart(Part part, String mimeType) throws Exception {
        if (part.isMimeType(mimeType)) return (String) part.getContent();
        var content = part.getContent();
        if (content instanceof Multipart multipart) {
            for (int index = 0; index < multipart.getCount(); index++) {
                var match = textPart(multipart.getBodyPart(index), mimeType);
                if (match != null) return match;
            }
        }
        return null;
    }
}
