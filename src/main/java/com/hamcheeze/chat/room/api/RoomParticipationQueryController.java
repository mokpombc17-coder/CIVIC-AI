package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.room.api.dto.RoomParticipationListResponse;
import com.hamcheeze.chat.room.api.dto.RoomParticipationResponse;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomParticipation;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;

@RestController
@RequestMapping("/api/v1")
public class RoomParticipationQueryController {

    private final RoomParticipationStore participationStore;
    private final MembershipStore membershipStore;
    private final RoomAuthorizationService authorizationService;
    private final AuthenticatedUserIdResolver userIdResolver;

    public RoomParticipationQueryController(
            RoomParticipationStore participationStore,
            MembershipStore membershipStore,
            RoomAuthorizationService authorizationService,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.participationStore = participationStore;
        this.membershipStore = membershipStore;
        this.authorizationService = authorizationService;
        this.userIdResolver = userIdResolver;
    }

    @GetMapping("/rooms/{roomId}/participations")
    public ResponseEntity<RoomParticipationListResponse> participations(
            Authentication authentication,
            @PathVariable String roomId
    ) {
        String validatedRoomId = RoomApiValidation.roomId(roomId);
        RoomAuthorizationDecision decision = authorizationService
                .authorizeSubscription(
                        userIdResolver.resolve(authentication),
                        validatedRoomId);
        if (decision == RoomAuthorizationDecision.FORBIDDEN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (decision == RoomAuthorizationDecision.UNAVAILABLE) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE);
        }
        var participations = new ArrayList<>(participationStore
                .findByRoomId(validatedRoomId));
        var representedMembershipIds = new HashSet<>(participations
                .stream()
                .map(RoomParticipation::membershipId)
                .toList());
        for (MembershipStatus status : MembershipStatus.values()) {
            membershipStore.findByRoomIdAndStatus(
                            validatedRoomId,
                            status)
                    .stream()
                    .filter(membership -> representedMembershipIds.add(
                            membership.membershipId()))
                    .map(membership ->
                            membership.status() == MembershipStatus.ACTIVE
                                    ? RoomParticipation.legacyActive(
                                            membership)
                                    : RoomParticipation.legacyEnded(
                                            membership))
                    .forEach(participations::add);
        }
        participations.sort(Comparator
                .comparing(RoomParticipation::joinedAt)
                .thenComparing(RoomParticipation::participationId));
        var items = participations
                .stream()
                .map(RoomParticipationResponse::from)
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(new RoomParticipationListResponse(items));
    }
}
