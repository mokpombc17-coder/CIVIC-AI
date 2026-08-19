CREATE TABLE opinion_map_snapshot_manifests (
    snapshot_id uuid PRIMARY KEY,
    response_hash_format varchar(50) NOT NULL,
    response_hash_sha256 varchar(64) NOT NULL,
    response_count integer NOT NULL,
    CONSTRAINT fk_opinion_map_snapshot_manifest_snapshot
        FOREIGN KEY (snapshot_id)
        REFERENCES opinion_map_snapshots (snapshot_id),
    CONSTRAINT ck_opinion_map_snapshot_manifest_hash
        CHECK (response_hash_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_opinion_map_snapshot_manifest_hash_format
        CHECK (response_hash_format = 'opinion-map-response-set-v1'),
    CONSTRAINT ck_opinion_map_snapshot_manifest_response_count
        CHECK (response_count >= 0)
);

CREATE TABLE opinion_map_snapshot_option_counts (
    snapshot_id uuid NOT NULL,
    option_id uuid NOT NULL,
    response_count integer NOT NULL,
    PRIMARY KEY (snapshot_id, option_id),
    CONSTRAINT fk_opinion_map_snapshot_option_count_manifest
        FOREIGN KEY (snapshot_id)
        REFERENCES opinion_map_snapshot_manifests (snapshot_id),
    CONSTRAINT ck_opinion_map_snapshot_option_count_positive
        CHECK (response_count > 0)
);
