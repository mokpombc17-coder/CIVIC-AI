# A1 Vote working-tree deployment

`patch-vote-8082.sh` deploys the Vote application from the current repository
working tree to A1. It does not clone, fetch, commit, reset, clean, or push source
code. Tracked, staged, and untracked non-ignored files are fingerprinted, copied to
a temporary directory, and built there exactly as they exist locally.

Each deployment derives a 40-character snapshot ID from the complete working tree.
The full SHA-256, current Git commit, branch, and dirty state are recorded in release
metadata. The build stops if the original working tree changes while it is running.
Ignored build output such as `build` is not part of the snapshot.

## Safety contract

- `scripts/a1` must be located directly under the Vote repository root.
- An optional deploy `--sha` must equal the snapshot ID printed by `--dry-run`.
- Rollback requires `--sha` with a previously deployed snapshot ID.
- The SSH key must be a current-user regular file with mode `0600`.
- Only a local Unix-socket Docker endpoint is accepted, and the default Buildx
  builder must support `linux/arm64`.
- Deploy uses the existing `civic-vote-8082_postgres-data` volume by default.
  `--data-volume` can override it; the script never creates a replacement volume.
- Vote secrets stay in `/etc/civic/vote-8082.env` unless another server path is
  explicitly supplied.
- Deploy performs the production build required to create the runtime image but does
  not run a separate test suite.
- Existing public Nginx and TLS state is validated and preserved. Failed health,
  reload, TLS, or authorization checks restore the previous release.

## Dry run

Dry-run fingerprints the current repository but does not build, contact A1, or
modify source files.

```bash
scripts/a1/patch-vote-8082.sh --dry-run
```

## Deploy

Run the script with no arguments. This computer defaults to the SSH key
`/Users/junseok/Downloads/civic-a1-deploy/ssh/civic-ai-dev_ed25519`, host
`140.238.17.223`, action `deploy`, Compose project `civic-vote-8082`, a dedicated
anonymous Docker configuration, and the Docker `default` context. Explicit options
override these defaults.

```bash
scripts/a1/patch-vote-8082.sh
```

To pin a reviewed source state, pass the snapshot ID printed by `--dry-run` with
`--sha`; the script rejects a mismatch.

## Roll back

Rollback switches to the previously deployed release. The supplied `--sha` must
identify the currently deployed snapshot so accidental rollback from stale state is
rejected.

```bash
scripts/a1/patch-vote-8082.sh \
  --action rollback \
  --sha CURRENT_40_HEX_SNAPSHOT_ID
```
