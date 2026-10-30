package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.application.ActiveRoomMembershipLimitMode;
import com.hamcheeze.chat.security.ChatScopes;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RoomMembershipLimitModeResolverTest {

    private final RoomMembershipLimitModeResolver resolver =
            new RoomMembershipLimitModeResolver();

    @Test
    void roomsWriteAloneKeepsLimitEnforced() {
        assertThat(resolver.resolve(authentication(
                ChatScopes.ROOMS_WRITE)))
                .isEqualTo(ActiveRoomMembershipLimitMode.ENFORCED);
    }

    @Test
    void exemptionScopeSelectsExemptMode() {
        assertThat(resolver.resolve(authentication(
                ChatScopes.ROOMS_WRITE,
                ChatScopes.ROOM_MEMBERSHIP_LIMIT_EXEMPT)))
                .isEqualTo(ActiveRoomMembershipLimitMode.EXEMPT);
    }

    @Test
    void exemptionScopeDoesNotImplyWriteAuthority() {
        UsernamePasswordAuthenticationToken authentication =
                authentication(
                        ChatScopes.ROOM_MEMBERSHIP_LIMIT_EXEMPT);

        assertThat(resolver.resolve(authentication))
                .isEqualTo(ActiveRoomMembershipLimitMode.EXEMPT);
        assertThat(authentication.getAuthorities())
                .extracting(authority -> authority.getAuthority())
                .doesNotContain(ChatScopes.authority(
                        ChatScopes.ROOMS_WRITE));
    }

    private UsernamePasswordAuthenticationToken authentication(
            String... scopes
    ) {
        return new UsernamePasswordAuthenticationToken(
                "user-1",
                "unused",
                List.of(scopes).stream()
                        .map(ChatScopes::authority)
                        .map(SimpleGrantedAuthority::new)
                        .toList());
    }
}
