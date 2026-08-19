package com.hamcheeze.vote.opinionmap.api;

import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/opinion-map/snapshots")
final class OpinionMapSnapshotController {

    private final OpinionMapSnapshotQueryService snapshots;

    OpinionMapSnapshotController(OpinionMapSnapshotQueryService snapshots) {
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
    }

    @GetMapping("/{snapshotId}")
    OpinionMapApiModels.SnapshotResponse findById(
            @PathVariable UUID snapshotId
    ) {
        return snapshots.findBySnapshotId(snapshotId)
                .map(OpinionMapApiModels.SnapshotResponse::from)
                .orElseThrow(() -> new OpinionMapApiException(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "OPINION_MAP_SNAPSHOT_NOT_FOUND",
                        "The finalized opinion map snapshot does not exist."));
    }
}
