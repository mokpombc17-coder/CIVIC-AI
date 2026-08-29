# CIVIC Main/Auth Repository Instructions

## Direct Checkout and Delivery

- Do not create or attach a new Git worktree for normal work in this repository. Work in the current checkout.
- Before editing, verify the current branch, upstream, and working-tree status. Preserve unrelated user changes; do not reset, discard, or overwrite them.
- Keep the checkout fast-forwarded with its upstream before starting a new change.
- When the user asks to implement and deliver a change, commit it in the current branch and push that branch directly to its configured upstream. Do not create a temporary delivery branch or pull request unless the user explicitly requests one.

## Build Once, Deploy an Immutable Image

- Build and test release images on CI or a dedicated local build host. Do not copy source code to the A1 application server or run Gradle or Docker builds there during a normal deployment.
- Build explicitly for the A1 runtime platform, currently `linux/arm64`.
- Tag each release image with the exact Git commit SHA and set OCI revision/source labels. Do not deploy a mutable `latest` tag.
- Deploy `main-auth` and `main-worker` from the same immutable image reference so API and worker code cannot drift.
- Keep production secrets only in server-side env/config files. Validate the fully merged Compose configuration without printing secret values.
- Before cutover, compare the production Flyway history and checksums with the migrations contained in the new image. Never deploy an image that omits or changes a migration already recorded in production.
- Run required migrations before service cutover, then replace services with `docker compose up -d --no-build`. Do not rebuild on the target server.
- Retain the previous immutable image and validate a rollback Compose overlay before cutover.
- After deployment, record the Git SHA, image tag and resolved image ID/digest, platform, Compose project/config path, Flyway schema version, container health/restart/OOM state, and public smoke-test results.
- Verify Auth through the public origin: health/discovery/JWKS availability and a protected endpoint returning the expected unauthenticated response. Treat authenticated browser acceptance as a separate proof surface.
