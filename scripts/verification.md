# CI/CD and production verification

Run these from the server (or with `--resolve` from a machine that can reach the server). Replace `YOUR_WEBHOOK_SECRET` and `SERVER_IP` / `nuranpark.com` as needed.

## 1. Health check

```bash
curl -i https://nuranpark.com/healthz
```

Expected: `200 OK` with body `ok` and `Content-Type: text/plain`. If using HTTP only:

```bash
curl -i http://nuranpark.com/healthz
```

## 2. Webhook deploy trigger (POST with ref refs/heads/main)

From the server or with correct secret:

```bash
curl -i -X POST "https://nuranpark.com/hooks/deploy" \
  -H "Content-Type: application/json" \
  -H "X-Deploy-Token: YOUR_WEBHOOK_SECRET" \
  -d '{"ref":"refs/heads/main"}'
```

Expected: `200 OK` and response body like "Deploy triggered". After a successful trigger:

- Webhook container logs show the hook executed: `docker compose -f infra/docker-compose.yml logs webhook --tail=50`
- Deploy trigger log has an entry: `tail -20 /var/www/nuran/scripts/.deploy-trigger.log`
- Deploy log has an entry: `tail -20 /var/www/nuran/scripts/.deploy.log`

## 3. Nginx to webhook connectivity (inside container)

From the host (repo root `/var/www/nuran`):

```bash
docker compose -f infra/docker-compose.yml exec nginx curl -s -o /dev/null -w "%{http_code}\n" -X POST http://webhook:9000/hooks/deploy \
  -H "Content-Type: application/json" \
  -H "X-Deploy-Token: YOUR_WEBHOOK_SECRET" \
  -d '{"ref":"refs/heads/main"}'
```

Expected: `200`. If you get `000` or connection errors, nginx cannot reach the webhook container (network or webhook down).

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
curl -i -X POST "https://nuranpark.com/hooks/deploy" \
  -H "Content-Type: application/json" \
  -H "X-Deploy-Token: YOUR_WEBHOOK_SECRET" \
  -d '{"ref":"refs/heads/main"}' \
  --resolve "nuranpark.com:443:SERVER_IP"
```

Expected: same as step 2.
