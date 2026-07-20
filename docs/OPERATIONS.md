# cWBTC Faucet Operations

This document is for the next operator or agent taking over the public testnet faucet.

## Secrets

There are two different keys:

- Issuer key: stored locally in `/Users/retric/Documents/Codex/2026-07-06/ban/work/cch-wbtc-udt/issuer.json` and mirrored on Desktop. This key controls the original max-supply cWBTC cell. Keep it offline.
- Faucet hot wallet key: mounted as the `faucet_private_key` Docker secret. This key should only hold the amount of cWBTC and CKB capacity the public faucet needs.

Operators do not need the issuer key. Never commit issuer files, runtime secret files, `.env`, or wallet JSON files. The application supports `FAUCET_PRIVATE_KEY_FILE`, `IP_HASH_SALT_FILE`, `ADMIN_TOKEN_FILE`, and `TURNSTILE_SECRET_KEY_FILE`; a file value takes precedence over its legacy environment-variable equivalent.

## Funding The Faucet

1. Initialize the deployment and copy the public address it prints:

```bash
./scripts/init.sh
```

The private key is written directly to the ignored `secrets/faucet_private_key` file and is never printed to the terminal.

2. Transfer cWBTC from the issuer wallet to the hot wallet. The existing local issuer project has a working script:

```bash
cd /Users/retric/Documents/Codex/2026-07-06/ban/work/cch-wbtc-udt
npm run send-cwbtc -- <hot-wallet-ckt-address>=10000
```

3. Deposit CKB testnet capacity to the hot wallet. `offckb deposit` is fine for testnet.

Each successful claim creates a recipient xUDT cell. Budget roughly `200 CKB` occupied capacity per claim plus fees. cWBTC itself is abundant; CKB capacity is the resource that will run out first.

## Runtime

The service is one Node.js process:

- Express serves the API and static page.
- SQLite stores claims and cooldown history.
- One in-process worker sends CKB transactions.

The worker intentionally serializes sends and waits for each transaction to be committed before starting the next claim. This avoids spending the same cWBTC change cell twice.

## Health Checks

```bash
curl http://127.0.0.1:3008/health
curl http://127.0.0.1:3008/api/info
curl http://127.0.0.1:3008/api/balance
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3008/api/admin/summary
```

Important fields:

- `configured`: whether a hot wallet key is loaded.
- `cwbtcRaw` / `cwbtc_display`: remaining cWBTC.
- `estimatedClaimsByCapacity`: rough remaining claim count from CKB capacity.
- claim `status`: `queued`, `processing`, `sent`, `confirmed`, or `failed`.

## Stuck Claims

Normal path:

1. `queued`
2. `processing`
3. `sent`
4. `confirmed`

If a claim is stuck in `sent`, the worker will poll confirmation again after restart.

If the process crashed while a claim was `processing`, inspect logs first. If no transaction hash was sent, it is usually safe to mark it back to `queued` in SQLite. If a transaction hash exists in logs, mark it `sent` with that hash instead.

Example SQLite inspection:

```bash
sqlite3 ./data/faucet.sqlite \
  "select id,address,status,tx_hash,error,datetime(created_at/1000,'unixepoch') from claims order by created_at desc limit 20;"
```

## Anti-Abuse Controls

Current controls:

- one active claim per address
- address cooldown
- IP cooldown with salted hashes
- per-address daily cap
- per-IP daily cap
- global daily cap
- optional Cloudflare Turnstile

Recommended public settings:

```env
REQUIRE_TURNSTILE=true
ADDRESS_COOLDOWN_SECONDS=86400
IP_COOLDOWN_SECONDS=3600
ADDRESS_DAILY_CLAIM_LIMIT=1
IP_DAILY_CLAIM_LIMIT=5
GLOBAL_DAILY_CLAIM_LIMIT=200
```

If abuse appears, add one of:

- GitHub OAuth
- wallet signature challenge
- require the address to already hold a small CKB capacity cell
- Redis/Postgres shared rate-limit state for multi-process deployment

## Dependency Notes

The project uses `@ckb-ccc/ccc` for transaction building and signing because the original cWBTC issuance scripts already use it. `npm audit --omit=dev` currently reports low-severity transitive findings from CCC's wallet adapter dependency chain. Recheck before public launch and upgrade CCC when a clean release is available.

## Docker Deployment

Run the initializer from the repository checkout:

```bash
./scripts/init.sh
```

It creates `.env`, a dedicated faucet hot wallet, the IP hash salt, the admin token, and an empty optional Turnstile secret. Existing files are never overwritten. The command prints only the public faucet address; send that address to the cWBTC custodian for funding and deposit testnet CKB capacity into it.

For a public domain, update these ordinary values in `.env`:

```env
PUBLIC_BASE_URL=https://<faucet-domain>
CORS_ORIGIN=https://<faucet-domain>
```

```bash
docker compose up -d --pull always --no-build
docker compose ps
```

The generated secret files live under `secrets/` and are ignored by Git. The directory uses mode `0700`; files inside use mode `0644` so Docker Compose can mount them into the unprivileged `node` container. Teams with a host secret directory or secret manager can move them later and update the four `*_SECRET_FILE` paths in `.env`; this is not required for the first deployment.

The container runs as the unprivileged `node` user. Compose mounts secrets read-only under `/run/secrets`, overrides `DATABASE_PATH` to `/app/data/faucet.sqlite`, and mounts the named `faucet-data` volume there. Keep that volume during deploys because it contains claim history, cooldowns, and in-flight transaction state.

Run exactly one replica with `WORKER_ENABLED=true`. The SQLite queue and sender are intentionally single-process. Do not use `docker compose up --scale faucet=...`; a multi-replica deployment needs a shared database and a distributed worker lock first.

Useful operations:

```bash
docker compose logs -f faucet
docker compose restart faucet
docker compose pull faucet
docker compose up -d --no-build
docker compose down
```

Back up the SQLite database before host migration or a destructive maintenance operation:

```bash
docker compose exec faucet node -e \
  "const Database=require('better-sqlite3'); new Database('/app/data/faucet.sqlite').backup('/app/data/faucet-backup.sqlite')"
docker compose cp faucet:/app/data/faucet-backup.sqlite ./faucet-backup.sqlite
```

Never run `docker compose down -v` during routine deploys. The `-v` option deletes the named volume and all faucet state.

## Key Rotation

1. Stop the faucet so no transfer is in flight.
2. Create a new dedicated faucet wallet.
3. Transfer the old wallet's remaining cWBTC and CKB capacity to the new address.
4. Replace the host `faucet_private_key` secret file atomically and keep it under a private directory. If it is mounted by Docker Compose into this unprivileged container, the file itself must be readable by the container user.
5. Start the faucet and verify `/api/balance` reports `configured: true`.

If compromise is suspected, stop the container first and sweep the hot-wallet funds immediately. Routine faucet-key rotation never requires the issuer key.

Use a reverse proxy for TLS and set:

```env
PUBLIC_BASE_URL=https://<faucet-domain>
CORS_ORIGIN=https://<faucet-domain>
TRUST_PROXY_HOPS=1
```
