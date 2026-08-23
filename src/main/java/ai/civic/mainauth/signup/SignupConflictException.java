package ai.civic.mainauth.signup;

public class SignupConflictException extends RuntimeException {
    public SignupConflictException(String message) {
        super(message);
    }
}
