package ai.civic.mainauth.notification;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Service
@ConditionalOnProperty(name = "civic.runtime.mode", havingValue = "worker")
public class SmtpNotificationService {
    private final JavaMailSender sender;

    public SmtpNotificationService(JavaMailSender sender) {
        this.sender = sender;
    }

    public void sendSignupVerification(String recipient, String code) {
        var message = new SimpleMailMessage();
        message.setTo(recipient);
        message.setSubject("CIVIC 이메일 인증");
        message.setText("CIVIC 이메일 인증 코드는 " + code + " 입니다. 10분 안에 입력해 주세요.");
        sender.send(message);
    }
}
