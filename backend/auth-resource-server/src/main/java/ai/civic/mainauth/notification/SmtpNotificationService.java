package ai.civic.mainauth.notification;

import jakarta.mail.MessagingException;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class SmtpNotificationService {
    private final JavaMailSender sender;
    private final String senderEmail;

    public SmtpNotificationService(
            JavaMailSender sender,
            @Value("${civic.notification.sender-email}") String senderEmail) {
        this.sender = sender;
        this.senderEmail = senderEmail;
    }

    public void sendSignupVerification(String recipient, String code) {
        sendChallenge(recipient, code, "SIGNUP_EMAIL_VERIFICATION");
    }

    public void sendChallenge(String recipient, String code, String purpose) {
        var content = AuthenticationMailTemplate.forChallenge(code, purpose);
        var message = sender.createMimeMessage();
        try {
            var helper = new MimeMessageHelper(
                    message,
                    MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                    StandardCharsets.UTF_8.name());
            helper.setFrom(senderEmail, "CIVIC AI");
            helper.setTo(recipient);
            helper.setSubject(content.subject());
            helper.setText(content.plainText(), content.htmlText());
            message.setHeader("Auto-Submitted", "auto-generated");
        } catch (MessagingException | UnsupportedEncodingException exception) {
            throw new MailPreparationException("Unable to prepare authentication email", exception);
        }
        sender.send(message);
    }
}
