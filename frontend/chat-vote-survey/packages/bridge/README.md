# Web ↔ native bridge

`@repo/bridge` defines the messages exchanged between the Next.js application and the Expo
WebView shell.

## Versioning policy

`BRIDGE_VERSION` is the wire-protocol version. Version 2 is the current production contract; it
was introduced when OAuth, downloads, and push-related messages were added.

Within the same protocol version:

- Existing message types and required payload fields are immutable.
- New optional fields and new capability names may be added.
- The web application must check a capability before requesting its native feature.
- Unknown capability names are accepted and ignored by older web bundles.

A breaking envelope, message, or payload change requires a new protocol version. Roll it out in
this order:

1. Release a native shell that can support both the old and new protocol.
2. Deploy web code that negotiates or selects the supported protocol.
3. Raise the minimum native build version after the new app release is available.
4. Remove the old protocol only after unsupported native builds are no longer allowed.

The WebView also appends a `NextWebViewShell/...` User-Agent token. The mobile config API uses
that metadata only for update-policy UX; it must not be treated as authentication or
authorization evidence.
