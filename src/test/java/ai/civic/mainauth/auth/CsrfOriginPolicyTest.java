package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CsrfOriginPolicyTest {
    private final BrowserRequestPolicy policy = new BrowserRequestPolicy("https://civic.example");

    @Test
    void authenticatedMutationRequiresExactOriginSameOriginMetadataAndSessionBoundCsrf() {
        var valid = request("POST", "https://civic.example", "same-origin", "application/json", null);
        assertThatCode(() -> policy.requireAuthenticatedMutation(valid, "bound-token", "bound-token"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.requireAuthenticatedMutation(valid, "bound-token", null))
                .isInstanceOf(BrowserRequestRejectedException.class);
        assertThatThrownBy(() -> policy.requireAuthenticatedMutation(
                        request("POST", "https://evil.example", "same-origin", "application/json", null),
                        "bound-token", "bound-token"))
                .isInstanceOf(BrowserRequestRejectedException.class);
        assertThatThrownBy(() -> policy.requireAuthenticatedMutation(
                        request("POST", "https://civic.example", "cross-site", "application/json", null),
                        "bound-token", "bound-token"))
                .isInstanceOf(BrowserRequestRejectedException.class);
    }

    @Test
    void preSessionMutationUsesOriginMetadataAndContentTypeButNotSessionCsrf() {
        var valid = request("POST", "https://civic.example", "same-origin", "application/json", null);
        assertThatCode(() -> policy.requirePreSessionMutation(valid)).doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.requirePreSessionMutation(
                        request("POST", "https://civic.example", "same-origin", "text/plain", null)))
                .isInstanceOf(BrowserRequestRejectedException.class);
        assertThatThrownBy(() -> policy.requirePreSessionMutation(
                        request("POST", "https://civic.example", "same-origin", "application/json", "Bearer x")))
                .isInstanceOf(BrowserRequestRejectedException.class);
    }

    @Test
    void stateChangingGetAndPublicAuthorizationAreRejected() {
        assertThatThrownBy(() -> policy.requirePreSessionMutation(
                        request("GET", "https://civic.example", "same-origin", "application/json", null)))
                .isInstanceOf(BrowserRequestRejectedException.class);
        assertThatThrownBy(() -> policy.rejectPublicAuthorization("Basic abc"))
                .isInstanceOf(BrowserRequestRejectedException.class);
    }

    private BrowserRequestPolicy.RequestMetadata request(
            String method, String origin, String fetchSite, String contentType, String authorization) {
        return new BrowserRequestPolicy.RequestMetadata(method, origin, fetchSite, contentType, authorization);
    }
}
