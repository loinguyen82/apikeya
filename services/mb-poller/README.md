# APIVN MB Bank Poller

Standalone VPS worker for APIVN's zero-gateway-fee VietQR top-up flow.

## Flow

```text
APIVN topup (15-minute QR)
        |
        v
MB receiving account
        |
        v
one shared VPS poller (>= 60 seconds between MB history calls)
        |
        v
signed /api/internal/bank-events
        |
        v
Supabase reconciliation
        |
        v
wallet ledger + paid topup
```

The worker is deliberately outside the root npm workspace. MB credentials and the unofficial MB dependency stay on the VPS and are never required by the Next.js/Cloudflare builds.

## Safety model

- One poller per receiving bank account, not one poller per user/QR.
- MB history calls have a hard minimum interval of 60 seconds.
- When APIVN has no pending/grace topups, the service only checks APIVN state and does not poll MB.
- On process startup, one recovery history scan is performed. Replayed transactions are safe because the database owns idempotency.
- Only incoming credits containing an `APV...` payment code are forwarded.
- MB username/password/account number are never included in the webhook payload or normal logs.
- This service does not implement transfers or any write operation against the bank account.

## Important limitation

The `mbbank` package is an unofficial wrapper around MB Bank's internet-banking endpoints. Bank-side changes, captcha/login changes, account restrictions, or session behavior can break it. Use a dedicated receiving account, test with a low-value transfer first, and migrate the bank-event source to an official bank API when the volume justifies it.

## Install on VPS

Node.js 22+ is recommended.

```bash
cd /opt/apivn/services/mb-poller
cp .env.example .env
npm install
npm run check
npm start
```

Fill `.env` with:

- `MB_USERNAME`: MB internet-banking login.
- `MB_PASSWORD`: MB password.
- `MB_ACCOUNT_NUMBER`: dedicated account receiving APIVN top-ups.
- `APIVN_BASE_URL`: production APIVN web origin.
- `BANK_POLLER_SECRET`: the same long random secret configured on the APIVN web deployment.

Do not commit `.env`.

## systemd

Example `/etc/systemd/system/apivn-mb-poller.service`:

```ini
[Unit]
Description=APIVN MB Bank top-up poller
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=apivn
WorkingDirectory=/opt/apivn/services/mb-poller
EnvironmentFile=/opt/apivn/services/mb-poller/.env
ExecStart=/usr/bin/node src/index.mjs
Restart=on-failure
RestartSec=15
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now apivn-mb-poller
sudo journalctl -u apivn-mb-poller -f
```

## Production activation order

1. Apply `supabase/migrations/010_mb_bank_poller.sql`.
2. Deploy the web app with `BANK_POLLER_SECRET` and the MB public receiving-account display configuration.
3. Install this worker on the VPS and configure its private `.env`.
4. Start the worker and confirm the startup recovery scan succeeds.
5. Create a 20,000 VND test top-up, transfer the exact amount with the exact `APV...` content, and confirm the top-up becomes `paid` exactly once.
6. Restart the worker and confirm the same bank transaction is replayed without adding wallet balance a second time.

Do not switch a production receiving account until these checks pass.
