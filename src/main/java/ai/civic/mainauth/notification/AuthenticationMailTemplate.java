package ai.civic.mainauth.notification;

final class AuthenticationMailTemplate {
    private AuthenticationMailTemplate() {}

    static Message forChallenge(String code, String purpose) {
        var copy = copyFor(purpose);
        return new Message(
                copy.subject(),
                plainText(copy, code),
                htmlText(copy, escapeHtml(code)));
    }

    private static Copy copyFor(String purpose) {
        return switch (purpose) {
            case "PASSWORD_RESET" -> new Copy(
                    "[CIVIC AI] 비밀번호 재설정 코드",
                    "비밀번호 재설정 코드",
                    "CIVIC AI 비밀번호 재설정을 위해 아래 인증 코드를 입력해 주세요.");
            case "TWO_FACTOR" -> new Copy(
                    "[CIVIC AI] 2단계 인증 코드",
                    "2단계 인증 코드",
                    "CIVIC AI 로그인 본인 확인을 위해 아래 인증 코드를 입력해 주세요.");
            case "TWO_FACTOR_ENABLE" -> new Copy(
                    "[CIVIC AI] 2단계 인증 코드",
                    "2단계 인증 코드",
                    "CIVIC AI 2단계 인증 설정을 완료하려면 아래 인증 코드를 입력해 주세요.");
            case "REACTIVATION" -> new Copy(
                    "[CIVIC AI] 계정 재활성화 코드",
                    "계정 재활성화 코드",
                    "CIVIC AI 계정을 다시 활성화하려면 아래 인증 코드를 입력해 주세요.");
            default -> new Copy(
                    "[CIVIC AI] 이메일 인증 코드",
                    "이메일 인증 코드",
                    "CIVIC AI 이메일 주소 확인을 위해 아래 인증 코드를 입력해 주세요.");
        };
    }

    private static String plainText(Copy copy, String code) {
        return """
                CIVIC AI

                %s

                안녕하세요.
                %s

                %s

                인증 코드는 10분 동안 유효합니다.
                본인이 요청하지 않았다면 이 메일을 무시하고 계정 보안을 확인해 주세요.

                감사합니다.
                CIVIC AI 드림

                문의 사항은 CIVIC AI 서비스(https://civic-ai.co.kr)에서 확인해 주세요.
                본 메일은 발신 전용입니다.
                """.formatted(copy.heading(), copy.introduction(), code);
    }

    private static String htmlText(Copy copy, String escapedCode) {
        return """
                <!doctype html>
                <html lang="ko">
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>%s</title>
                  </head>
                  <body style="margin:0;padding:0;background:#ffffff;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',Arial,sans-serif;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;">
                      <tr>
                        <td align="center" style="padding:56px 24px 40px;">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
                            <tr>
                              <td style="padding-bottom:48px;font-size:32px;line-height:1;font-weight:800;letter-spacing:-1.2px;color:#111111;">
                                CIVIC AI
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:24px;font-size:30px;line-height:1.3;font-weight:700;letter-spacing:-0.8px;color:#202124;">
                                %s
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:30px;font-size:16px;line-height:1.75;color:#3c4043;">
                                안녕하세요.<br>
                                %s
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:28px;">
                                <div style="display:inline-block;padding:16px 22px;border:1px solid #d9dde3;border-radius:10px;background:#f7f8fa;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:30px;line-height:1;font-weight:700;letter-spacing:8px;color:#111111;">%s</div>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:26px;font-size:15px;line-height:1.7;color:#5f6368;">
                                인증 코드는 <strong style="color:#202124;">10분 동안</strong> 유효합니다.<br>
                                본인이 요청하지 않았다면 이 메일을 무시하고 계정 보안을 확인해 주세요.
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-bottom:46px;font-size:16px;line-height:1.7;color:#3c4043;">
                                감사합니다.<br>
                                <strong style="color:#202124;">CIVIC AI 드림</strong>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-top:22px;border-top:1px solid #e8eaed;font-size:12px;line-height:1.65;color:#80868b;">
                                문의 사항은 <a href="https://civic-ai.co.kr" style="color:#1a73e8;text-decoration:underline;">CIVIC AI 서비스</a>에서 확인해 주세요.<br>
                                본 메일은 발신 전용입니다.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(copy.subject(), copy.heading(), copy.introduction(), escapedCode);
    }

    private static String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    record Message(String subject, String plainText, String htmlText) {}

    private record Copy(String subject, String heading, String introduction) {}
}
