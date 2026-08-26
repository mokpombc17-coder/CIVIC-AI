package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

class TrustedClientAddressResolverTest {
    @Test
    void forwardedAddressRequiresThePrivateBffSecret() {
        var request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("10.0.0.15");
        when(request.getHeader(TrustedClientAddressResolver.CLIENT_IP_HEADER))
                .thenReturn("203.0.113.20");
        var resolver = new TrustedClientAddressResolver("internal-secret");

        when(request.getHeader(TrustedClientAddressResolver.INTERNAL_SECRET_HEADER))
                .thenReturn("wrong");
        assertThat(resolver.resolve(request)).isEqualTo("10.0.0.15");

        when(request.getHeader(TrustedClientAddressResolver.INTERNAL_SECRET_HEADER))
                .thenReturn("internal-secret");
        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.20");
    }

    @Test
    void trustedReverseProxyAddressIsUsedWithoutCollapsingAllClientsIntoOneBucket() {
        var request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("172.18.0.4");
        when(request.getHeader(TrustedClientAddressResolver.REVERSE_PROXY_IP_HEADER))
                .thenReturn("203.0.113.21");
        var resolver = new TrustedClientAddressResolver("internal-secret", "172.16.0.0/12");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.21");
    }

    @Test
    void untrustedOrMalformedForwardedAddressIsIgnoredWithoutDnsLookup() {
        var request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("198.51.100.10");
        when(request.getHeader(TrustedClientAddressResolver.REVERSE_PROXY_IP_HEADER))
                .thenReturn("attacker.example");
        var resolver = new TrustedClientAddressResolver("internal-secret", "172.16.0.0/12");

        assertThat(resolver.resolve(request)).isEqualTo("198.51.100.10");
    }
}
