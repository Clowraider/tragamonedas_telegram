# Proxmox VE Deployment & Operations Guide

This guide details the production deployment, operations, telemetry, automated backup, isolated restore drills, and disaster recovery procedures for the **Telegram Slot Machine MVP** on **Proxmox Virtual Environment (PVE)**.

---

## 1. System Architecture on Proxmox

The deployment runs as a modular Docker Compose stack inside an isolated Proxmox guest.

```
                  Internet / Telegram Clients
                              │
                    ┌─────────▼─────────┐
                    │ Proxmox Firewall  │ (Allow Ports 80, 443, 22 only)
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │    Caddy Proxy    │ (slot-caddy: 80, 443 with Auto-TLS)
                    └────┬─────────┬────┘
        Static Traffic   │         │  API Traffic (/v1/*, /healthz, /readyz)
        ┌────────────────┘         └────────────────┐
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│ Web Frontend  │                           │   Fastify     │
│  (slot-web)   │                           │     API       │
│  Port 80 (int)│                           │  (slot-api)   │
└───────────────┘                           │ Port 3000(int)│
                                            └───────┬───────┘
                     ┌──────────────────────────────┼──────────────┐
                     │ (Runs once before API starts)│              │
                     ▼                              ▼              ▼
              ┌───────────────┐             ┌───────────────┐ ┌───────────────┐
              │   Migration   │             │  PostgreSQL   │ │  Prometheus   │
              │(slot-migrate) │             │(slot-postgres)│ │(slot-prom...) │
              └───────────────┘             └───────────────┘ └───────────────┘
                     └──────────────────────────────┘
                        Private Docker Bridge (`slot_internal_net`)
```

### Network Isolation Policy

- **Public Surface**: Only Caddy binds to host ports `80` and `443`.
- **Private Services**: PostgreSQL (`5432`), Fastify API (`3000`), Nginx Web (`80`), and Prometheus (`9090`) communicate strictly over the internal bridge `slot_internal_net` and **never publish ports to the Proxmox host or public network**.
- **Metrics Privacy**: `/metrics` is blocked at the Caddy ingress layer and is scraped only internally by Prometheus.

---

## 2. Prerequisites & Sizing

### Guest Type Selection

- **Option A: Dedicated KVM/QEMU Virtual Machine (Recommended)**
  - Full kernel isolation and zero Docker storage driver quirks.
  - OS: Debian 12 (Bookworm) or Ubuntu 24.04 LTS.
- **Option B: Unprivileged LXC Container**
  - Requires container features: `nesting=1,keyctl=1`.
  - In Proxmox host `/etc/pve/lxc/<CTID>.conf`:
    ```ini
    features: nesting=1,keyctl=1
    ```

### Recommended Sizing

| Resource    | Minimum       | Recommended Production             |
| :---------- | :------------ | :--------------------------------- |
| **vCPU**    | 1 Core        | 2 Cores                            |
| **RAM**     | 2 GB          | 4 GB                               |
| **Disk**    | 15 GB SSD     | 30 GB NVMe / ZFS with TRIM         |
| **Network** | 1 Gbps virtIO | 1 Gbps virtIO with static IP / DNS |

### Software Prerequisites on the Guest

```bash
# Update and install Docker + Compose V2
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

---

## 3. Initial Setup and Deployment

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/slot-machine.git /opt/slot-machine
cd /opt/slot-machine
```

### Step 2: Configure Environment Secrets

Copy the production environment template and fill in production secrets:

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

**Key Parameters to Configure:**

- `DOMAIN`: Fully qualified public domain (e.g. `slot.example.com`).
- `ACME_EMAIL`: Operator email for SSL certificate alerts.
- `POSTGRES_PASSWORD`: Strong random string (e.g. `openssl rand -hex 24`).
- `TELEGRAM_BOT_TOKEN`: Real token from [@BotFather](https://t.me/BotFather).
- `APP_SECRET`: Strong signing key (minimum 32 chars: `openssl rand -hex 32`).
- `AUTH_MODE=telegram` and `NODE_ENV=production`.

### Step 3: Launch the Stack

```bash
cd /opt/slot-machine/deploy
docker compose up -d --build
```

### Step 4: Verify Health and Readiness

Verify that all containers are healthy:

```bash
# Check container status
docker compose ps

# Check API readiness probe (verifies database connectivity)
docker compose exec api node -e \
  'fetch("http://127.0.0.1:3000/readyz").then(r => r.ok ? console.log("READINESS OK") : process.exit(1))'

# Check external HTTPS endpoint via Caddy
curl -i https://slot.example.com/healthz
curl -i https://slot.example.com/readyz

# Verify that /metrics is rejected externally
curl -i https://slot.example.com/metrics
# Expected: 403 Forbidden
```

---

## 4. Systemd Service (Auto-Start on Boot)

To ensure the stack restarts reliably after any Proxmox host or VM reboot, configure a systemd service:

Create `/etc/systemd/system/slot-machine.service`:

```ini
[Unit]
Description=Slot Machine Docker Compose Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/slot-machine/deploy
ExecStart=/usr/bin/docker compose -f /opt/slot-machine/deploy/compose.yaml up -d
ExecStop=/usr/bin/docker compose -f /opt/slot-machine/deploy/compose.yaml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable slot-machine.service
```

---

## 5. Automated Backups & Off-Host Retention

### Daily Automated Backup (Cron)

Configure a root cron job to run the backup script every night at 02:00 UTC:

```bash
sudo crontab -e
```

Add:

```cron
0 2 * * * /opt/slot-machine/deploy/scripts/backup.sh /var/backups/slot-machine >> /var/log/slot-backup.log 2>&1
```

### Manual Backup Command

```bash
/opt/slot-machine/deploy/scripts/backup.sh /var/backups/slot-machine
```

Output includes:

- Timestamped dump: `/var/backups/slot-machine/slot_machine_slot_machine_YYYYMMDD_HHMMSSZ.sql.gz`
- SHA-256 Checksum: `...sql.gz.sha256`
- Automatic cleanup of backups older than 14 days.

### Off-Host Backup Strategy

1. **Proxmox Backup Server (PBS)**:
   Schedule daily guest VM snapshots from Proxmox VE pointing to a dedicated Proxmox Backup Server datastore with deduplication and encryption.
2. **Remote Storage Sync (rsync / Rclone)**:
   ```bash
   rsync -avz --delete /var/backups/slot-machine/ backup-user@remote-storage.infra:/backups/slot-machine/
   ```

---

## 6. Restore Drills & Disaster Recovery

### Scenario A: Isolated Restore Drill (Non-Disruptive)

To verify backup data integrity without impacting live players or taking down the active database:

```bash
/opt/slot-machine/deploy/scripts/restore.sh \
  /var/backups/slot-machine/slot_machine_slot_machine_20260801_020000Z.sql.gz \
  --isolated
```

**What the drill validates:**

1. Validates GZIP and SHA-256 archive checksums.
2. Creates an ephemeral scratch database (`slot_restore_drill_<timestamp>`).
3. Restores the full SQL stream.
4. Asserts presence of `players`, `wallets`, and `spin_rounds` tables.
5. Asserts the business invariant: **no negative wallet balances** (`balance >= 0`).
6. Asserts atomic settlement consistency across all historical rounds.
7. Drops the scratch database and outputs statistics.

### Scenario B: Live Production Disaster Recovery

If restoring after hardware corruption or catastrophic failure:

```bash
/opt/slot-machine/deploy/scripts/restore.sh \
  /var/backups/slot-machine/slot_machine_slot_machine_20260801_020000Z.sql.gz \
  --force
```

**The script will:**

1. Safely stop the API container to prevent in-flight writes.
2. Decompress and apply the SQL backup to the production database.
3. Restart the API container.
4. Run healthcheck queries to verify ready state.

---

## 7. Zero-Downtime Rollout & Update Procedure

When deploying new versions of the application:

```bash
cd /opt/slot-machine

# 1. Pull latest code
git pull origin main

# 2. Take a pre-deployment backup
./deploy/scripts/backup.sh /var/backups/slot-machine/pre_deploy

# 3. Build updated images
docker compose -f deploy/compose.yaml build

# 4. Run database migrations (must succeed before starting new API)
docker compose -f deploy/compose.yaml run --rm migrate

# 5. Recreate web and API containers gracefully
docker compose -f deploy/compose.yaml up -d --no-deps web api

# 6. Verify health
docker compose -f deploy/compose.yaml exec api node -e \
  'fetch("http://127.0.0.1:3000/readyz").then(r => r.ok ? process.exit(0) : process.exit(1))'
```

---

## 8. Rollback Strategy

### A. Schema-Compatible Code Rollback

If a newly deployed API image exhibits runtime issues but database schema was not modified destructively:

```bash
cd /opt/slot-machine/deploy
# Revert git commit or image tag
git checkout <PREVIOUS_COMMIT_TAG>
docker compose build api web
docker compose up -d --no-deps api web
```

### B. Incompatible Migration Rollback

If a migration introduced breaking changes and cannot run with previous code:

```bash
cd /opt/slot-machine/deploy

# 1. Stop incoming API traffic
docker compose stop api

# 2. Restore database from pre-deployment backup
./scripts/restore.sh /var/backups/slot-machine/pre_deploy/<PRE_DEPLOY_BACKUP>.sql.gz --force

# 3. Check out and deploy previous stable release
git checkout <PREVIOUS_COMMIT_TAG>
docker compose up -d --build
```
