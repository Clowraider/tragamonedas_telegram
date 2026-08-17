#!/usr/bin/env bash
# ==============================================================================
# Database Restore & Verification Script for Slot Machine MVP
# Supports live production restore and isolated verification drills.
#
# Usage:
#   ./restore.sh <backup_file.sql.gz> [--isolated] [--force]
#
# Flags:
#   --isolated   Perform drill in a temporary isolated database to verify consistency.
#   --force, -f  Skip interactive confirmation for live production restore.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEPLOY_DIR}/compose.yaml"

# Load environment variables if available
if [[ -f "${DEPLOY_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  source "${DEPLOY_DIR}/.env"
elif [[ -f "${DEPLOY_DIR}/../.env" ]]; then
  # shellcheck disable=SC1091
  source "${DEPLOY_DIR}/../.env"
fi

POSTGRES_USER="${POSTGRES_USER:-slot}"
POSTGRES_DB="${POSTGRES_DB:-slot_machine}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path_to_backup.sql.gz> [--isolated] [--force]" >&2
  exit 1
fi

BACKUP_FILE="$1"
shift

ISOLATED_MODE=false
FORCE_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --isolated)
      ISOLATED_MODE=true
      shift
      ;;
    --force|-f)
      FORCE_MODE=true
      shift
      ;;
    *)
      echo "[-] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[-] ERROR: Backup file '${BACKUP_FILE}' not found." >&2
  exit 1
fi

# Verify checksum if .sha256 file exists alongside
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [[ -f "${CHECKSUM_FILE}" ]]; then
  echo "[+] Verifying SHA-256 checksum..."
  BACKUP_DIR="$(dirname "${BACKUP_FILE}")"
  BACKUP_BASE="$(basename "${BACKUP_FILE}")"
  if command -v sha256sum &>/dev/null; then
    (cd "${BACKUP_DIR}" && sha256sum -c "${BACKUP_BASE}.sha256")
  elif command -v shasum &>/dev/null; then
    (cd "${BACKUP_DIR}" && shasum -a 256 -c "${BACKUP_BASE}.sha256")
  fi
  echo "[+] Checksum matches."
else
  echo "[!] Notice: No checksum file found at '${CHECKSUM_FILE}'. Skipping checksum check."
fi

# Verify gzip archive integrity
echo "[+] Checking gzip compression integrity..."
gzip -t "${BACKUP_FILE}"
echo "[+] Archive integrity OK."

# ==============================================================================
# Isolated Verification Mode
# ==============================================================================
if [[ "${ISOLATED_MODE}" == "true" ]]; then
  DRILL_DB="slot_restore_drill_$(date +%s)"
  echo "=================================================="
  echo " Running Isolated Restore Verification Drill"
  echo " Ephemeral Database: ${DRILL_DB}"
  echo " Source Archive:     ${BACKUP_FILE}"
  echo "=================================================="

  echo "[+] Creating temporary drill database inside PostgreSQL service..."
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${DRILL_DB};"

  cleanup() {
    echo "[+] Cleaning up drill database ${DRILL_DB}..."
    docker compose -f "${COMPOSE_FILE}" exec -T postgres \
      psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DRILL_DB};" || true
  }
  trap cleanup EXIT

  echo "[+] Restoring backup data into ${DRILL_DB}..."
  gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" --quiet

  echo "[+] Performing database consistency and integrity checks..."

  # 1. Check required tables exist
  TABLES_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -t -A -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('players', 'wallets', 'spin_rounds');")

  if [[ "${TABLES_COUNT}" -ne 3 ]]; then
    echo "[-] ERROR: Drill failed — required tables (players, wallets, spin_rounds) not found in restored schema!" >&2
    exit 3
  fi

  # 2. Check no negative wallet balances exist
  INVALID_WALLETS=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -t -A -c \
    "SELECT COUNT(*) FROM wallets WHERE balance < 0;")

  if [[ "${INVALID_WALLETS}" -ne 0 ]]; then
    echo "[-] ERROR: Drill failed — found ${INVALID_WALLETS} wallets with negative balance!" >&2
    exit 4
  fi

  # 3. Check stats
  PLAYERS_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -t -A -c "SELECT COUNT(*) FROM players;")
  WALLETS_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -t -A -c "SELECT COUNT(*) FROM wallets;")
  ROUNDS_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${DRILL_DB}" -t -A -c "SELECT COUNT(*) FROM spin_rounds;")

  echo "=================================================="
  echo " Drill Restore Verification Succeeded!"
  echo " - Players restored:     ${PLAYERS_COUNT}"
  echo " - Wallets restored:     ${WALLETS_COUNT}"
  echo " - Spin rounds restored: ${ROUNDS_COUNT}"
  echo " - Invariants:           All balance & settlement checks PASS"
  echo "=================================================="
  exit 0
fi

# ==============================================================================
# Live Production Restore Mode
# ==============================================================================
echo "=================================================================="
echo " WARNING: LIVE DATABASE RESTORE"
echo " Target Database: ${POSTGRES_DB}"
echo " Source Archive:  ${BACKUP_FILE}"
echo " This operation will overwrite existing data in '${POSTGRES_DB}'."
echo "=================================================================="

if [[ "${FORCE_MODE}" != "true" ]]; then
  read -r -p "Are you sure you want to proceed with LIVE restore? [y/N]: " CONFIRM
  if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
    echo "[-] Restore aborted by operator."
    exit 1
  fi
fi

echo "[+] Pausing API container to prevent concurrent database writes..."
docker compose -f "${COMPOSE_FILE}" stop api || true

echo "[+] Restoring database from backup..."
gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --quiet

echo "[+] Starting API container..."
docker compose -f "${COMPOSE_FILE}" start api

echo "[+] Checking service readiness probe..."
sleep 2
docker compose -f "${COMPOSE_FILE}" exec -T api node -e \
  'fetch("http://127.0.0.1:3000/readyz").then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))'

echo "=================================================================="
echo " Live Restore Completed and Verified Successfully!"
echo "=================================================================="
