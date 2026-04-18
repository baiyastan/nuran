# CI/CD and production verification

Run these from the server (or with `--resolve` from a machine that can reach the server). Replace `YOUR_WEBHOOK_SECRET`, `SERVER_IP`, and `nuranpark.com` as needed.

**Prerequisite**: the value of `WEBHOOK_SECRET` in `/var/www/nuran/.env` on the server MUST match the secret pasted into the GitHub repo Webhooks UI. Mismatch → webhook silently rejects every push.

## 1. Health check

The backend `/api/v1/healthz` endpoint is what `deploy.sh` polls after every deploy. A 200 means Django can reach the database.

```bash
curl -i https://nuranpark.com/api/v1/healthz
```

Expected: `200 OK` with JSON body `{"status":"ok","db":"ok"}`. If HTTPS is not ready:

```bash
curl -i http://nuranpark.com/api/v1/healthz
```

A `503` response means the database is unreachable — check `docker compose -f infra/docker-compose.yml logs db` and the `backend` container for connection errors.

## 2. Webhook deploy trigger (manual)

The webhook requires GitHub's `X-Hub-Signature-256` header. You cannot trigger it with a plain bearer token — the header is an HMAC-SHA256 over the raw request body, keyed by `WEBHOOK_SECRET`.

```bash
BODY='{"ref":"refs/heads/main"}'
SECRET='YOUR_WEBHOOK_SECRET'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | awk '{print $1}')"

curl -i -X POST "https://nuranpark.com/hooks/deploy" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

Expected: `200 OK` and response body `Deploy triggered`. After a successful trigger:

- Webhook container logs show the hook executed: `docker compose -f infra/docker-compose.yml logs webhook --tail=50`
- Deploy trigger log has an entry: `tail -20 /var/www/nuran/scripts/.deploy-trigger.log`
- Deploy log has an entry: `tail -40 /var/www/nuran/scripts/.deploy.log`
- A Telegram message is posted (if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in `.env`).

If the signature is wrong, `deploy-trigger.sh` exits with `Bad signature` and the deploy does not run.

## 3. Nginx → webhook connectivity (inside containers)

From the host (repo root `/var/www/nuran`):

```bash
BODY='{"ref":"refs/heads/main"}'
SECRET='YOUR_WEBHOOK_SECRET'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | awk '{print $1}')"

docker compose -f infra/docker-compose.yml exec nginx \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://webhook:9000/hooks/deploy \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIG" \
    -d "$BODY"
```

Expected: `200`. If you get `000` or connection errors, nginx cannot reach the webhook container (check the `webhook` service is running and on the same compose network).

## 4. Nginx config test and reload

From the host:

```bash
docker compose -f infra/docker-compose.yml exec nginx nginx -t
```

Expected: `syntax is ok` and `test is successful`. To reload nginx without downtime:

```bash
docker compose -f infra/docker-compose.yml exec nginx nginx -s reload
```

## 5. Optional: test without Cloudflare (direct to origin)

Replace `SERVER_IP` with the Droplet IP. This bypasses Cloudflare to rule out proxy/cache issues.

```bash
BODY='{"ref":"refs/heads/main"}'
SECRET='YOUR_WEBHOOK_SECRET'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | awk '{print $1}')"

curl -i -X POST "https://nuranpark.com/hooks/deploy" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY" \
  --resolve "nuranpark.com:443:SERVER_IP"
```

Expected: same as step 2.

## 6. Webhook service rebuild (when hooks.json or deploy-trigger.sh change)

`deploy.sh` rebuilds `backend` + `nginx` only; the `webhook` service is intentionally excluded so it doesn't restart itself mid-deploy. When you change `scripts/hooks.json`, `scripts/deploy-trigger.sh`, or `infra/docker/webhook.Dockerfile`, rebuild it manually from the host:

```bash
cd /var/www/nuran
docker compose -f infra/docker-compose.yml up -d --build --force-recreate --no-deps webhook
```

## 7. Rollback verification

When a deploy fails, `deploy.sh` resets the working tree to the previous SHA and rebuilds. To confirm a healthy rollback:

```bash
git -C /var/www/nuran log -1 --oneline
curl -sf https://nuranpark.com/api/v1/healthz
```

Expected: the log shows the previous commit (not the bad one), and the healthcheck returns 200. A Telegram `❌ Nuran deploy FAILED` message includes the rollback SHA for audit.
