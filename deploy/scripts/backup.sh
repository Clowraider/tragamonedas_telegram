#!/usr/bin/env bash
# ==============================================================================
# Database Backup Script for Slot Machine MVP
# Creates a compressed, checksummed PostgreSQL dump from the Docker container.
#
# Usage:
#   ./backup.sh [backup_destination_dir]
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
BACKUP_DIR="${1:-${DEPLOY_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_FILENAME="slot_machine_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
CHECKSUM_PATH="${BACKUP_PATH}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "=================================================="
echo " Starting Slot Machine Database Backup"
echo " Timestamp: ${TIMESTAMP}"
echo " Database:  ${POSTGRES_DB}"
echo " Target:    ${BACKUP_PATH}"
echo "=================================================="

# Check if postgres service is running
if ! docker compose -f "${COMPOSE_FILE}" ps --status running --format '{{.Service}}' | grep -q "^postgres$"; then
  echo "[-] ERROR: PostgreSQL container is not running in compose project." >&2
  exit 1
fi

echo "[+] Executing pg_dump stream..."
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    --clean --if-exists --no-owner --no-privileges --quote-all-identifiers \
  | gzip -9 > "${BACKUP_PATH}"

# Validate file exists and is not empty
if [[ ! -s "${BACKUP_PATH}" ]]; then
  echo "[-] ERROR: Backup file was not created or is 0 bytes." >&2
  rm -f "${BACKUP_PATH}"
  exit 2
fi

# Verify gzip integrity
echo "[+] Verifying gzip archive integrity..."
gzip -t "${BACKUP_PATH}"

# Compute SHA-256 Checksum
echo "[+] Generating SHA-256 checksum..."
if command -v sha256sum &>/dev/null; then
  (cd "${BACKUP_DIR}" && sha256sum "${BACKUP_FILENAME}" > "${CHECKSUM_PATH}")
elif command -v shasum &>/dev/null; then
  (cd "${BACKUP_DIR}" && shasum -a 256 "${BACKUP_FILENAME}" > "${CHECKSUM_PATH}")
else
  echo "[-] WARNING: Neither sha256sum nor shasum available. Skipping checksum generation."
fi

BACKUP_SIZE="$(du -h "${BACKUP_PATH}" | cut -f1)"
echo "[+] Backup successfully created!"
echo "    File:     ${BACKUP_PATH}"
echo "    Size:     ${BACKUP_SIZE}"
if [[ -f "${CHECKSUM_PATH}" ]]; then
  echo "    Checksum: $(cat "${CHECKSUM_PATH}")"
fi

# Prune old backups
if [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  echo "[+] Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
  find "${BACKUP_DIR}" -type f \( -name "*.sql.gz" -o -name "*.sha256" \) -mtime "+${RETENTION_DAYS}" -delete || true
fi

echo "=================================================="
echo " Backup Completed Successfully"
echo " Recommended Off-Host Strategy:"
echo "   rsync -avz ${BACKUP_DIR}/ backup-user@remote-storage:/backups/slot-machine/"
echo "   or sync to Proxmox Backup Server (PBS) / S3 restic repository."
echo "=================================================="
