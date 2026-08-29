# A1 local working-tree patch scripts

These scripts deploy the code currently present in the Git repository that contains
`scripts/a1`. They do not clone, fetch, commit, or push source code. Tracked,
staged, and untracked non-ignored files are fingerprinted, copied to a temporary
directory, and built there exactly as they exist locally. Uncommitted application
changes are therefore included without mounting or modifying the working tree.

Run only the script that matches the repository:

- Front repository: `patch-front-3001.sh`
- Chat repository: `patch-chat-8083.sh`
- Vote repository: `patch-vote-8082.sh`

Each deploy derives a 40-character snapshot ID from the complete local working tree.
The full SHA-256, current Git commit, branch, and dirty state are recorded in release
metadata. The build stops if the original working tree changes while it is running.
Ignored build output such as `.next`, `build`, and `node_modules` is not part of
the snapshot.

## Safety contract

- `scripts/a1` must be located directly under the repository root.
- Deploy reads the current working tree and never runs Git checkout, clone, fetch,
  commit, reset, clean, or push.
- An optional deploy `--sha` must equal the snapshot ID printed by `--dry-run`.
- Rollback requires `--sha` with a previously deployed snapshot ID.
- The SSH key must be a current-user regular file with mode `0600`.
- Only a local Unix-socket Docker endpoint is accepted, and the default Buildx
  builder must support `linux/arm64`.
- Chat and Vote default to the existing `civic-chat-8083_mongodb-data` and
  `civic-vote-8082_postgres-data` volumes. `--data-volume` can override them;
  the scripts never create a replacement data volume.
- Vote secrets stay in `/etc/civic/vote-8082.env` unless another server path is
  explicitly supplied.
- Deploy skips separate format, lint, typecheck, and test commands. It performs
  only the production build required to create the runtime image, then deploys.
- Existing public Nginx and TLS state is validated and preserved. Failed health,
  reload, TLS, or authorization checks restore the previous release.

## Dry run

Dry-run fingerprints the current repository but does not build, contact A1, or
modify source files.

```bash
# Front
scripts/a1/patch-front-3001.sh --dry-run

# Chat
scripts/a1/patch-chat-8083.sh --dry-run

# Vote
scripts/a1/patch-vote-8082.sh --dry-run
```

## Deploy

Run the matching script with no arguments. This computer defaults to the SSH key
`/Users/junseok/Downloads/civic-a1-deploy/ssh/civic-ai-dev_ed25519`, host
`140.238.17.223`, action `deploy`, a dedicated anonymous Docker configuration, and
the Docker `default` context. Explicit options still override these defaults.
The Front build also bakes the selected public origin into both
`NEXT_PUBLIC_CHAT_API_URL` and `NEXT_PUBLIC_VOTE_API_URL`, so browser requests and
the chat WebSocket use the public Nginx routes instead of local development ports.

```bash
scripts/a1/patch-front-3001.sh
scripts/a1/patch-chat-8083.sh
scripts/a1/patch-vote-8082.sh
```

To pin a reviewed source state, pass the snapshot ID printed by `--dry-run` with
`--sha`; the script rejects a mismatch.

Front, Chat, and Vote default respectively to Compose projects
`civic-front-3001`, `civic-chat-8083`, and `civic-vote-8082`.

## Roll back

Use the matching service command with `--action rollback` and the deployed
snapshot ID:

```bash
scripts/a1/patch-front-3001.sh \
  --action rollback \
  --sha DEPLOYED_40_HEX_SNAPSHOT_ID
```
