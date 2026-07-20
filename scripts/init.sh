#!/bin/sh

set -eu

umask 077

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SECRETS_DIR="$ROOT_DIR/secrets"
IMAGE=${FAUCET_IMAGE:-ghcr.io/retricsu/cwbtc-faucet:latest}
WALLET_JSON=""

cleanup() {
  if [ -n "$WALLET_JSON" ]; then
    rm -f "$WALLET_JSON"
  fi
}

trap cleanup EXIT HUP INT TERM

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required." >&2
  exit 1
}

cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
fi

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

if [ ! -s "$SECRETS_DIR/faucet_private_key" ]; then
  WALLET_JSON=$(mktemp "${TMPDIR:-/tmp}/cwbtc-faucet-wallet.XXXXXX")
  docker run --rm "$IMAGE" node dist/cli/create-hot-wallet.js >"$WALLET_JSON"

  PRIVATE_KEY=$(sed -n 's/^  "privateKey": "\([^"]*\)",$/\1/p' "$WALLET_JSON")
  FAUCET_ADDRESS=$(sed -n 's/^  "address": "\([^"]*\)",$/\1/p' "$WALLET_JSON")

  if ! printf '%s' "$PRIVATE_KEY" | grep -Eq '^0x[0-9a-fA-F]{64}$'; then
    echo "The faucet image returned an invalid private key." >&2
    exit 1
  fi

  case "$FAUCET_ADDRESS" in
    ckt1*) ;;
    *)
      echo "The faucet image returned an invalid CKB testnet address." >&2
      exit 1
      ;;
  esac

  printf '%s\n' "$PRIVATE_KEY" >"$SECRETS_DIR/faucet_private_key"
  printf '%s\n' "$FAUCET_ADDRESS" >"$SECRETS_DIR/faucet_address"
fi

if [ ! -s "$SECRETS_DIR/ip_hash_salt" ]; then
  openssl rand -hex 32 >"$SECRETS_DIR/ip_hash_salt"
fi

if [ ! -s "$SECRETS_DIR/admin_token" ]; then
  openssl rand -hex 32 >"$SECRETS_DIR/admin_token"
fi

if [ ! -e "$SECRETS_DIR/turnstile_secret_key" ]; then
  : >"$SECRETS_DIR/turnstile_secret_key"
fi

chmod 600 .env "$SECRETS_DIR"/*

echo "Deployment files are ready."
if [ -s "$SECRETS_DIR/faucet_address" ]; then
  echo "Faucet address: $(cat "$SECRETS_DIR/faucet_address")"
fi
echo "Fund that address with testnet cWBTC and CKB, then run:"
echo "  docker compose up -d --pull always --no-build"
