#!/usr/bin/env python3

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time


DEFAULT_SECRET = "chat-local-only-secret-key-32bytes"


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def encode_json(value: dict) -> str:
    raw = json.dumps(
        value,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return base64url(raw)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a local HS256 JWT for the local profile."
    )
    parser.add_argument("subject", help="JWT sub claim / chat userId")
    parser.add_argument(
        "--ttl-seconds",
        type=int,
        default=3600,
        help="Token lifetime in seconds (default: 3600)",
    )
    args = parser.parse_args()

    if args.ttl_seconds < 1:
        parser.error("--ttl-seconds must be at least 1")

    secret = os.environ.get("CHAT_LOCAL_JWT_SECRET", DEFAULT_SECRET)
    if len(secret.encode("utf-8")) < 32:
        print(
            "CHAT_LOCAL_JWT_SECRET must be at least 32 UTF-8 bytes",
            file=sys.stderr,
        )
        return 2

    issuer = os.environ.get("CHAT_LOCAL_JWT_ISSUER", "chat-local")
    audience = os.environ.get(
        "CHAT_LOCAL_JWT_AUDIENCE",
        "chat-server",
    )
    now = int(time.time())

    header = encode_json({"alg": "HS256", "typ": "JWT"})
    payload = encode_json(
        {
            "aud": audience,
            "exp": now + args.ttl_seconds,
            "iat": now,
            "iss": issuer,
            "sub": args.subject,
        }
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = base64url(
        hmac.new(
            secret.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()
    )
    print(f"{header}.{payload}.{signature}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
