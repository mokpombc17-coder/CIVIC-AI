DELETE FROM integration_outbox
WHERE event_type IN (
    'task.submission-completed',
    'task.opinion-map-finalization-requested',
    'opinion-map.snapshot-finalized'
);

DROP TABLE opinion_map_snapshot_option_counts;
DROP TABLE opinion_map_snapshot_manifests;
DROP TABLE opinion_map_snapshots;
DROP TABLE opinion_map_finalizations;
DROP TABLE opinion_map_submission_projections;
DROP TABLE opinion_map_inbox;
