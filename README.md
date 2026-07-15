# cWBTC Faucet

Public testnet faucet for `cWBTC`, the CKB xUDT used as fake wrapped BTC in the Fiber CCH demo. It is a plain testnet UDT with 8 decimals. For the demo convention, `1 raw cWBTC = 1 satoshi`, so `1 cWBTC = 100,000,000 raw units`.

## Existing cWBTC

The original issuance artifacts are still present locally:

- Workspace copy: `/Users/retric/Documents/Codex/2026-07-06/ban/work/cch-wbtc-udt`
- Desktop copy: `/Users/retric/Desktop/cch-wbtc-udt`
- Issuer file: `issuer.json` has the issuer private key field.
- Issue result: `issue-result.json`

Do not deploy the issuer key directly. Fund a dedicated faucet hot wallet with cWBTC plus enough CKB capacity, then set `FAUCET_PRIVATE_KEY` to that hot wallet key.

Token details:

```json
{
  "name": "CCH Wrapped BTC",
  "symbol": "cWBTC",
  "decimals": 8,
  "supply_raw": "340282366920938463463374607431768211455",
  "type_script": {
    "code_hash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
    "hash_type": "type",
    "args": "0x9a1086531ed6dc69e0bd44cef5278e03faf3015b31aff60b08fb87663ce8507100000000"
  }
}
```

## Architecture

```mermaid
flowchart LR
  User["User browser"] --> Api["Express API"]
  Api --> Db[("SQLite claims DB")]
  Api --> Guard["Eligibility checks<br/>address/IP cooldown<br/>daily caps<br/>optional Turnstile"]
  Api --> Db
  Worker["Single sender worker"] --> Db
  Worker --> CKB["CKB testnet RPC"]
  CKB --> Worker
  Worker --> Db
  Hot["Faucet hot wallet<br/>cWBTC + CKB capacity"] --> CKB
```

The important operational detail is the worker. CKB UDT transfers spend a live cell and create a change cell. If the faucet sends concurrent transactions from the same cWBTC cell, one of them will conflict. This service stores claims in SQLite, sends one transaction at a time, and waits until the transaction is committed before sending the next one.

## Claim Flow

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant D as SQLite
  participant W as Worker
  participant C as CKB RPC

  U->>A: POST /api/claims { address }
  A->>A: validate ckt1 address and challenge
  A->>D: check active claims, cooldowns, daily caps
  A->>D: insert queued claim
  A-->>U: 202 claim id
  W->>D: load oldest queued/sent claim
  W->>C: build, sign, and send cWBTC transfer
  W->>D: mark sent with tx hash
  W->>C: poll get_transaction until committed
  W->>D: mark confirmed
  U->>A: GET /api/claims/:id
  A-->>U: status and tx hash
```

## Anti-Sybil v1

This is intentionally modest, but it is durable enough for a real public testnet service:

- one pending claim per address
- address cooldown
- IP cooldown using salted IP hashes
- per-address daily cap
- per-IP daily cap
- global daily cap
- optional Cloudflare Turnstile
- persistent claim history across restarts

The next natural upgrade is Redis/Postgres plus Turnstile enabled by default. If abuse appears, add GitHub OAuth or require a small CKB capacity proof before claiming.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

The server listens on `http://localhost:3008` by default and serves both the API and the small faucet page.

Useful endpoints:

- `GET /health`
- `GET /api/info`
- `GET /api/balance`
- `POST /api/claims`
- `GET /api/claims/:id`
- `GET /api/admin/summary` with `Authorization: Bearer $ADMIN_TOKEN`

## Run With Docker

Docker Compose is the recommended production runtime. It builds the TypeScript service, runs it as the unprivileged `node` user, checks `/health`, and persists SQLite state in the `faucet-data` volume.

```bash
cp .env.example .env
# Set FAUCET_PRIVATE_KEY, IP_HASH_SALT, ADMIN_TOKEN, and public URL settings in .env.
docker compose up -d --build
docker compose ps
```

The service is exposed on port `3008`. Set `FAUCET_PORT` in `.env` when the host port needs to differ. SQLite lives at `/app/data/faucet.sqlite` inside the named volume and survives image replacement or container recreation.

Run exactly one worker-enabled replica. The current queue and SQLite database are designed for one serialized CKB sender; horizontal scaling requires a shared database and a distributed worker lock.

To inspect logs or stop the service:

```bash
docker compose logs -f faucet
docker compose down
```

Do not add `-v` to `docker compose down` unless the claim history is intentionally being deleted.

## Container Publishing

GitHub Actions runs the TypeScript checks and publishes the image to GitHub Container Registry:

- pushes to the default branch publish `ghcr.io/<owner>/<repository>:latest` and an immutable `sha-*` tag
- tags such as `v0.1.0` publish `0.1.0` and `0.1` image tags
- pull requests run checks without publishing an image
- every published image includes a GitHub artifact provenance attestation

The workflow uses the repository-scoped `GITHUB_TOKEN`; no long-lived registry password is required. For predictable production deploys, use the `sha-*` tag or image digest rather than `latest`.

## Deployment Notes

1. Create or choose a faucet hot wallet.
2. Transfer cWBTC from the issuer wallet to the faucet hot wallet.
3. Deposit enough CKB into the faucet hot wallet. Each claim creates an xUDT cell and costs roughly 200 CKB of occupied capacity plus tx fees.
4. Configure `.env` from `.env.example`.
5. Start the Docker Compose service:

```bash
docker compose up -d --build
```

Monitor:

- `GET /api/balance` for rough claim capacity.
- `GET /api/admin/summary` for stuck or failed claims.
- process logs for worker errors.

If a claim is stuck in `sent`, the worker will retry confirmation polling on restart. If it is stuck in `processing` after a crash before sending, inspect logs and either mark it `queued` manually or mark it `failed` in SQLite.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for the handoff runbook.

## Dependency Note

The faucet uses `@ckb-ccc/ccc`, matching the original cWBTC issuance scripts. `npm audit --omit=dev` currently reports low-severity transitive findings in CCC's wallet adapter dependency chain; recheck before public launch and upgrade CCC when a clean release is available.
