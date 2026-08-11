package ai.civic.mainauth.notification;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class SmtpNotificationService {
    private final JavaMailSender sender;

    public SmtpNotificationService(JavaMailSender sender) {
        this.sender = sender;
    }

    public void sendSignupVerification(String recipient, String code) {
        sendChallenge(recipient, code, "SIGNUP_EMAIL_VERIFICATION");
    }

    public void sendChallenge(String recipient, String code, String purpose) {
        var message = new SimpleMailMessage();
        message.setTo(recipient);
        message.setSubject(subjectFor(purpose));
        message.setText("CIVIC 인증 코드는 " + code + " 입니다. 10분 안에 입력해 주세요.");
        sender.send(message);
    }

    private String subjectFor(String purpose) {
        return switch (purpose) {
            case "PASSWORD_RESET" -> "CIVIC 비밀번호 재설정";
            case "TWO_FACTOR", "TWO_FACTOR_ENABLE" -> "CIVIC 2단계 인증";
            case "REACTIVATION" -> "CIVIC 계정 재활성화";
            default -> "CIVIC 이메일 인증";
        };
    }
}
