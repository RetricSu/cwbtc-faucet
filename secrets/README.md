# Runtime Secrets

Docker Compose reads four host files from this directory by default and mounts them read-only under `/run/secrets` in the faucet container. Every file except this README is ignored by Git and excluded from the Docker build context.

Run `./scripts/init.sh` from the repository root to create them automatically. The initializer also writes the public hot-wallet address to the ignored `faucet_address` file for operational reference.

- `faucet_private_key`: dedicated faucet hot-wallet private key as 32-byte hexadecimal text, with or without the `0x` prefix
- `ip_hash_salt`: random value used to hash requester IP addresses
- `admin_token`: bearer token for the admin summary endpoint; an empty file leaves the endpoint inaccessible
- `turnstile_secret_key`: Cloudflare Turnstile secret; it may be empty while `REQUIRE_TURNSTILE=false`

For production, keep these files outside the repository, set their paths in `.env`, and restrict them to the deployment user with mode `0600`. Never use the cWBTC issuer private key as `faucet_private_key`.
