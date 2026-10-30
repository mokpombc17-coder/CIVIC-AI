package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.application.ActiveRoomMembershipLimitMode;
import com.hamcheeze.chat.security.ChatScopes;
import org.springframework.security.core.Authentication;

import java.util.Objects;

public final class RoomMembershipLimitModeResolver {

    public ActiveRoomMembershipLimitMode resolve(
            Authentication authentication
    ) {
        Authentication resolved = Objects.requireNonNull(
                authentication,
                "authentication");
        String exemptionAuthority = ChatScopes.authority(
                ChatScopes.ROOM_MEMBERSHIP_LIMIT_EXEMPT);
        boolean exempt = resolved.getAuthorities().stream()
                .anyMatch(authority -> exemptionAuthority.equals(
                        authority.getAuthority()));
        return exempt
                ? ActiveRoomMembershipLimitMode.EXEMPT
                : ActiveRoomMembershipLimitMode.ENFORCED;
    }
}
