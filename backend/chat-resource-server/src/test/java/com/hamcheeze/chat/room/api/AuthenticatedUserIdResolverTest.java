package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.userlabel.AuthenticatedUserLabelRegistrar;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class AuthenticatedUserIdResolverTest {

    @Test
    void keepsSubjectAsUserIdAndRegistersEmailLocalPart() {
        String userId =
                "46fd4756-f07f-4b54-b03a-6e07740317da";
        UserLabelDirectory directory =
                mock(UserLabelDirectory.class);
        AuthenticatedUserIdResolver resolver =
                new AuthenticatedUserIdResolver(
                        new AuthenticatedUserLabelRegistrar(
                                directory));
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(userId)
                .claim("email", "junseok@example.com")
                .build();

        String resolved = resolver.resolve(
                new JwtAuthenticationToken(jwt));
        resolver.resolve(new JwtAuthenticationToken(jwt));

        assertThat(resolved).isEqualTo(userId);
        verify(directory, times(1)).upsert(userId, "junseok");
    }
}
