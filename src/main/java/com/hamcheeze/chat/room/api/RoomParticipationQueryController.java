package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.room.api.dto.RoomParticipationListResponse;
import com.hamcheeze.chat.room.api.dto.RoomParticipationResponse;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomParticipation;
import com.hamcheeze.chat.room.label.RoomMemberUserLabelResolver;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;
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
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class RoomParticipationQueryController {

    private final RoomParticipationStore participationStore;
    private final MembershipStore membershipStore;
    private final RoomAuthorizationService authorizationService;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomMemberUserLabelResolver userLabels;

    public RoomParticipationQueryController(
            RoomParticipationStore participationStore,
            MembershipStore membershipStore,
            RoomAuthorizationService authorizationService,
            AuthenticatedUserIdResolver userIdResolver,
            UserLabelDirectory userLabelDirectory
    ) {
        this.participationStore = participationStore;
        this.membershipStore = membershipStore;
        this.authorizationService = authorizationService;
        this.userIdResolver = userIdResolver;
        this.userLabels = new RoomMemberUserLabelResolver(
                userLabelDirectory);
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
        var memberships = new ArrayList<Membership>();
        for (MembershipStatus status : MembershipStatus.values()) {
            memberships.addAll(membershipStore.findByRoomIdAndStatus(
                    validatedRoomId,
                    status));
        }
        var representedMembershipIds = new HashSet<>(participations
                .stream()
                .map(RoomParticipation::membershipId)
                .toList());
        var resolvedUserLabels = userLabels.resolveAll(memberships);
        memberships.stream()
                .filter(membership -> representedMembershipIds.add(
                        membership.membershipId()))
                .map(membership ->
                        membership.status() == MembershipStatus.ACTIVE
                                ? RoomParticipation.legacyActive(
                                        membership,
                                        resolvedUserLabels.get(
                                                membership.userId()))
                                : RoomParticipation.legacyEnded(
                                        membership,
                                        resolvedUserLabels.get(
                                                membership.userId())))
                .forEach(participations::add);
        var membershipsById = memberships.stream()
                .collect(Collectors.toMap(
                        Membership::membershipId,
                        Function.identity()));
        participations.sort(Comparator
                .comparing(RoomParticipation::joinedAt)
                .thenComparing(RoomParticipation::participationId));
        var items = participations
                .stream()
                .map(participation -> RoomParticipationResponse.from(
                        participation,
                        resolveUserLabel(
                                participation,
                                membershipsById,
                                resolvedUserLabels)))
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(new RoomParticipationListResponse(items));
    }

    private static String resolveUserLabel(
            RoomParticipation participation,
            java.util.Map<String, Membership> membershipsById,
            java.util.Map<String, String> resolvedUserLabels
    ) {
        if (participation.userLabel() != null) {
            return participation.userLabel();
        }
        Membership membership = membershipsById.get(
                participation.membershipId());
        if (membership == null) {
            return participation.profile().displayName();
        }
        return resolvedUserLabels.getOrDefault(
                membership.userId(),
                participation.profile().displayName());
    }
}
