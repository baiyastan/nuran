---
name: backup-recovery-playbook
description: Production database backup and recovery for the nuran app (Django + PostgreSQL on Ubuntu + Timeweb Cloud S3). Use when diagnosing why backups aren't reaching S3, restoring from an encrypted backup, rotating AWS or GPG credentials, debugging `./scripts/backup_321.sh`, or answering "is X backed up?". Covers the backup pipeline (pg_dump → gzip → GPG → S3), required .env vars, retention (7 days local / indefinite S3), the `ru-1` region quirk, the misleading `NoneType is not iterable` error, git-stripped executable bits, rotated keys diagnosed from `InvalidAccessKeyId`, restore procedure (including a no-touch verify-only test), and Telegram alert conventions. Triggers on 'backup failing', 'restore from backup', 'rotate GPG passphrase', 'rotate AWS keys', 'NoneType is not iterable', 'InvalidAccessKeyId', 'S3 bucket empty', 'permission denied backup_321', 'verify backup integrity'.
type: operations
---

# Бэкап жана калыбына келтирүү — playbook

`nuran` production'дун PostgreSQL базасынын бэкап чынжыры, көп учураган бузулуштар, жана калыбына келтирүү жол-жобосу. Бул playbook **2026-04-23 тажрыйбасынан** жазылды: 5 күн бэкапсыз болгон, 6 катмар маселе ачылды.

## 0. Тез reference — эмнеден баштайт?

**Биринчи — кол менен иштетип, ачык катаны көрүңүз:**

```bash
cd /var/www/nuran && ./scripts/backup_321.sh
```

Ката текстине жараша §3'тин тийиштүү бөлүмүнө өтүңүз:

| Көргөн ката | Бөлүм |
|---|---|
| `Permission denied` | §3.1 |
| `S3_BUCKET and S3_ENDPOINT must be set` | §3.2 |
| `argument of type 'NoneType' is not a container or iterable` | §3.3 — **бул симптом, чыныгы катаны табуу керек** |
| `Backup completed successfully.` бирок S3 бош | §0.1 (мониторинг) |

### 0.1 Кол менен иштетсе ийгиликтүү болсо, бирок cron иштебесе

Бул көп учурайт — cron'дун айлана-чөйрөсү терминалдан айырмаланат:

1. `crontab -l | grep backup` — cron каттоо бардыгын текшерүү
2. `cat /var/log/nuran_backup.log | tail -80` — акыркы иштетүүдөгү катаны окуу
3. `ls -lh /var/backups/nuran/` — локалдык файлдар бар беле

## 1. Архитектура

```
02:00 cron (root)
    ↓
scripts/backup_321.sh
    ↓
pg_dump (docker compose exec db) → gzip → /var/backups/nuran/nuran_YYYYMMDD_HHMMSS.sql.gz
    ↓
GPG encrypt (AES-256, S2K) → .sql.gz.gpg
    ↓
sha256sum → .sql.gz.gpg.sha256
    ↓
aws s3 cp → s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/
    ↓
Telegram: ✅ SUCCESS / ❌ FAILED
```

### Файлдар/жолдор

| | Жайгашуусу |
|---|---|
| Скрипт | `/var/www/nuran/scripts/backup_321.sh` |
| Cron каттоо | `root crontab`: `00 02 * * * cd /var/www/nuran && ./scripts/backup_321.sh >> /var/log/nuran_backup.log 2>&1` |
| Локалдык бэкаптар | `/var/backups/nuran/` (акыркы 7, кол менен же script ротация кылат) |
| Лог | `/var/log/nuran_backup.log` |
| S3 prefix | `s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/` |
| S3 региону | **`ru-1`** (ЭМЕС `ru-central1` — бул биз 2026-04-23 да таптык) |
| S3 эндпоинт | `https://s3.twcstorage.ru` (Timeweb Cloud) |

### Ротация

- **Локал**: акыркы 7, автомат өчөт
- **S3**: скрипт **эч нерсе өчүрбөйт**; чексиз сакталат. Эгер керек болсо — Timeweb панелинде **S3 Lifecycle Policy** орнотуу (мис. 1 жылдан улуу → cold / өчүрүү)

## 2. Милдеттүү `.env` өзгөрмөлөр

Бул талаалар толук болмоюнча скрипт иштебейт:

| Өзгөрмө | Мисал | Эскертүү |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | `N04M...J78X` (20 белги) | Timeweb S3 Access Key |
| `AWS_SECRET_ACCESS_KEY` | 40 белги | Timeweb S3 Secret |
| `AWS_DEFAULT_REGION` | **`ru-1`** | `ru-central1` иштебейт |
| `S3_BUCKET` | `30dd63ad-b8ad-48a9-9fb7-c545973fac8d` | bucket UUID |
| `S3_ENDPOINT` | `https://s3.twcstorage.ru` | Timeweb endpoint |
| `GPG_PASSPHRASE` | куч sөз | ⚠️ Жоголсо — бардык эски бэкаптар окулбайт |
| `MIN_DUMP_SIZE_BYTES` | `10240` | <10KB дамп шек болуп чыгат |
| `TELEGRAM_BOT_TOKEN` | — | Ката/ийгилик билдирүүлөр үчүн |
| `TELEGRAM_CHAT_ID` | — | Ошол эле |

Текшерүү:
```bash
awk -F= '/^AWS_ACCESS_KEY_ID=/ {gsub(/"/,"",$2); print "ACCESS_KEY:", length($2)} \
         /^AWS_SECRET_ACCESS_KEY=/ {gsub(/"/,"",$2); print "SECRET:", length($2)} \
         /^S3_BUCKET=/ {print $1"="(length($2)>0?"set":"MISSING")} \
         /^S3_ENDPOINT=/ {print $1"="(length($2)>0?"set":"MISSING")} \
         /^GPG_PASSPHRASE=/ {print $1"="(length($2)>0?"set":"MISSING")}' /var/www/nuran/.env
```

Күтүлгөн: `ACCESS_KEY: 20` / `SECRET: 40` / баары `=set`.

## 3. Кадимки бузулуштар (2026-04-23 тажрыйбасынан)

### 3.1 `Permission denied` — git execute bit'ти сууруп салат

**Симптом:** `./scripts/backup_321.sh: Permission denied`

**Себеби:** `git pull` (автодеплой) execute bit'ти жок кылат, эгерде git-те сакталбаса.

**Тез оңдоо (серверде):**
```bash
cd /var/www/nuran
chmod +x scripts/backup_321.sh scripts/backup.sh scripts/restore.sh scripts/deploy.sh
```

**Түбүн жок кылуу (локалдык репо + push):**
```bash
git update-index --chmod=+x scripts/backup_321.sh scripts/backup.sh scripts/restore.sh scripts/deploy.sh
git commit -m "mark backup/deploy scripts as executable"
git push
```
Андан кийин `git pull` executable bit'ти сактап турат.

### 3.2 `S3_BUCKET and S3_ENDPOINT must be set in .env.`

**Симптом:** ошол эле сап ката, скрипт иштебейт.

**Себеби:** `.env`те эки сап жок.

**Оңдоо:**
```bash
cat >> /var/www/nuran/.env << 'EOF'

# S3 (Timeweb Cloud)
S3_BUCKET=30dd63ad-b8ad-48a9-9fb7-c545973fac8d
S3_ENDPOINT=https://s3.twcstorage.ru
EOF
```

### 3.3 `NoneType is not iterable` — жашырылган чыныгы ката

**Симптом:** `aws: [ERROR]: argument of type 'NoneType' is not a container or iterable`

**Эң маанилүү эреже:** бул катa — дайыма **симптом**, чыныгы ката эмес. AWS CLI'дин `s3errormsg.py` модулундагы баг: Timeweb бош `<Message></Message>` кайтарганда, CLI аны талдай албай жыгылат. Ошондуктан версия даунгрейд иштебейт — баг бардык AWS CLI v2 версияларында бар.

**Чыныгы катаны табуу (дайыма биринчи кадам):**
```bash
aws s3 ls s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/ \
  --endpoint-url https://s3.twcstorage.ru --region ru-1 \
  --debug 2>&1 | grep -A1 "<Error>"
```

Debug чыгаруунун ичиндеги `<Code>...</Code>` чыныгы катаны ачат:

| Чыныгы ката | Себеби | Оңдоо |
|---|---|---|
| `InvalidAccessKeyId` | Ачкыч Timeweb тарабынан билинбейт (балким ротация) | §3.4 — ачкычты жаңыртуу |
| `SignatureDoesNotMatch` | Secret ачкыч туура эмес (копиялаганда ката) | §3.4 — secret'ти кайра көчүрүү |
| `AccessDenied` | Ачкыч туура, бирок уруксат жетпейт | Timeweb панелинде bucket permissions |
| `InvalidRequest` / `InvalidBucketName` | Регион же bucket ID туура эмес | §3.5 |

Эгер `--debug` жыйынтыгында `<Error>` жок болсо — башка маселе (тармак, DNS, SSL). Андан кийин `curl -v https://s3.twcstorage.ru` менен тактаңыз.

### 3.4 `InvalidAccessKeyId` — ачкыч ротация кылынган

Кадимкисинде Timeweb консолунда кимдир бирөө "Сгенерировать новый ключ" басат — эски ачкыч дароо жараксыз болот.

**Оңдоо:**
1. Timeweb Cloud dashboard → S3 bucket → "Подключение" → көчүрмө иконка (📋):
   - `S3 Access Key` (20 белги)
   - `S3 Secret Access Key` (40 белги)
2. `.env`те алмаштырыңыз:
   ```bash
   sed -i 's|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID="NEW_KEY"|' /var/www/nuran/.env
   sed -i 's|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY="NEW_SECRET"|' /var/www/nuran/.env
   ```
3. Узундукту текшерүү (§2'деги awk менен) — **20 жана 40** болушу керек
4. Тест:
   ```bash
   set -a && source /var/www/nuran/.env && set +a
   aws s3 ls --endpoint-url https://s3.twcstorage.ru --region ru-1
   ```
   Bucket тизме көрүнсө — ачкыч иштейт.

### 3.5 Регион `ru-central1` → `ru-1`

**Симптом:** Debug'та `<Code>InvalidAccessKeyId</Code>` (§3.3), **бирок ачкычтар туура** (`aws s3 ls --region ru-1 ...` иштейт).

**Себеби:** `.env`те `AWS_DEFAULT_REGION="ru-central1"` — Timeweb'тин чыныгы региону `ru-1`. Башка регион менен SigV4 имзалоо бузулат → Timeweb ачкычты "билбейт" деп туюнтат (анткени региондон-регионго имзалар ар кандай).

**Оңдоо:**
```bash
sed -i 's|^AWS_DEFAULT_REGION=.*|AWS_DEFAULT_REGION="ru-1"|' /var/www/nuran/.env
```

### 3.6 `.env`те ачкыч бар көрүнөт, бирок чындыгында бош

**Симптом:** `grep AWS_ACCESS_KEY_ID .env` "бир нерсе бар" деп көрсөтөт, бирок маскалоо `""` берет.

**Диагноз — чыныгы узундукту алуу:**
```bash
awk -F= '/^AWS_ACCESS_KEY_ID=/ {gsub(/"/,"",$2); print length($2)}' /var/www/nuran/.env
awk -F= '/^AWS_SECRET_ACCESS_KEY=/ {gsub(/"/,"",$2); print length($2)}' /var/www/nuran/.env
```
Туура: `20` жана `40`. Эгер `0-4` болсо — nano'да туура сакталбаган, кайра орнотуу керек.

## 4. Кол менен бэкап жасоо (проверка үчүн)

```bash
cd /var/www/nuran
./scripts/backup_321.sh
```

Ийгиликтүү болсо акырында: `"Backup completed successfully."` + Telegram "✅ Nuran backup SUCCESS".

## 5. Калыбына келтирүү (restore)

### 5.1 Керектүү файлдарды S3'тен жүктөө

```bash
# Бардык бар бэкаптарды көрүү
aws s3 ls s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/ \
  --endpoint-url https://s3.twcstorage.ru --region ru-1

# Керек болгон күндүн бэкабын алуу (мис. 2026-04-16)
aws s3 cp \
  s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/nuran_20260416_020001.sql.gz.gpg \
  /tmp/restore.sql.gz.gpg \
  --endpoint-url https://s3.twcstorage.ru --region ru-1
```

### 5.2 GPG менен ачуу

```bash
# GPG_PASSPHRASE .env'тен алынат
source /var/www/nuran/.env
gpg --batch --passphrase "$GPG_PASSPHRASE" --decrypt /tmp/restore.sql.gz.gpg > /tmp/restore.sql.gz
gunzip /tmp/restore.sql.gz   # /tmp/restore.sql чыгат
```

**Маанилүү:** GPG passphrase жоголсо — бул кадам мүмкүн ЭМЕС. Passphrase'ти **ар дайым password manager'де** сактаңыз (1Password, Bitwarden, KeePass).

### 5.3 PostgreSQL'ге кайра салуу

```bash
# Учурдагы базаны сактап коюу (коопсуздук үчүн)
docker compose -f /var/www/nuran/infra/docker-compose.yml exec -T db \
  pg_dump -U nuran nuran | gzip > /tmp/before_restore_$(date +%s).sql.gz

# Базанын мурунку маалыматын өчүрүп (эскертүү!), бэкапты түртүү
docker compose -f /var/www/nuran/infra/docker-compose.yml exec -T db \
  psql -U nuran nuran < /tmp/restore.sql
```

**⚠️ Эскертүү:** Бул учурдагы маалыматты жок кылат. Биринчи `before_restore_...sql.gz` жасап коюңуз.

### 5.4 `scripts/restore.sh` автомат ыкмасы

Долбоордо дагы `scripts/restore.sh` бар (кысылган, шифрленбеген `.sql.gz` файлдарды кабыл алат):
```bash
./scripts/restore.sh /var/backups/nuran/nuran_20260416_020001.sql.gz
```

Бирок S3'тен шифрленген бэкапты адегенде кол менен ачуу керек (§5.2).

## 6. Коопсуздук — ротация

### 6.1 GPG passphrase

- **Ар 6-12 айда** ротация кылуу сунуштап
- Эски passphrase'ти "архив ачкыч" катары сактаңыз — эски бэкаптар ошону менен шифрленген
- Жаңы passphrase'ти `.env`'ке жазып, андан кийинки бэкаптар жаңысы менен шифрленет
- Эски бэкаптарды 1 ай ичинде жаңыдан шифрлөө (эгер керек болсо)

### 6.2 AWS S3 ачкычтары

- Timeweb Cloud dashboard'дан "Сгенерировать ключ" басуу менен ротация
- Эски ачкыч дароо жараксыз болот — `.env`ти **жаңыртпаганча** бэкап иштебейт
- Ротация кылсак — дароо `.env`ти жаңыртып, кол менен бир бэкап чуркатуу

### 6.3 Коопсуздук белгилери

Төмөнкү учурда дароо ротация: сервер бөлөккө берилди, developer командадан чыкты, `.env` (же passphrase) чат/скриншот/репо аркылуу тышкы жакка чыгып кетти.

## 7. Тест-restore (verify-only) — бэкап чыныгы иштейби

Өнөр базасына тийбей, бир бэкап файлдын **ачыла алышын** жана **реалдуу маалымат** экенин текшерүү. Айда бир жолу жасалса ийгилик.

```bash
# 1. S3'тен акыркы бэкапты алуу
LATEST=$(aws s3 ls s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/ \
  --endpoint-url https://s3.twcstorage.ru --region ru-1 \
  | awk '{print $NF}' | grep '.gpg$' | sort | tail -1)
aws s3 cp \
  "s3://30dd63ad-b8ad-48a9-9fb7-c545973fac8d/nuran/db/production/daily/${LATEST}" \
  /tmp/verify.sql.gz.gpg \
  --endpoint-url https://s3.twcstorage.ru --region ru-1

# 2. GPG passphrase'ти .env'тен алып ачуу
set -a && source /var/www/nuran/.env && set +a
gpg --batch --passphrase "$GPG_PASSPHRASE" --decrypt /tmp/verify.sql.gz.gpg > /tmp/verify.sql.gz
# ката жок болсо — passphrase туура жана файл бузук эмес

# 3. Дамп ичиндеги таблица санын эсептөө (sanity check)
zcat /tmp/verify.sql.gz | grep -c "CREATE TABLE"
# Күтүлгөн: 20+ таблица. Эгер 0 болсо — бэкап бош / бузук.

# 4. Учурдагы базадагы таблица санын текшерүү (катыш үчүн)
docker compose -f /var/www/nuran/infra/docker-compose.yml exec -T db \
  psql -U nuran -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"

# 5. Тазалоо
rm -f /tmp/verify.sql.gz /tmp/verify.sql.gz.gpg
```

Эгер 3-кадамдагы сан 4-кадамдагыдан көп аз болсо — бэкап толук эмес, иликтөө зарыл.

## 8. Мониторинг ыргагы

| Ирет | Эмне текшерилет |
|---|---|
| Күн сайын | Telegram'да `✅ SUCCESS` билдирүү — 2 күн жок болсо cron өчкөнбү текшерүү: `crontab -l \| grep backup` |
| Ай сайын | §7 verify-only restore |
| Чейрек сайын | Timeweb dashboard'то "Объем хранения" өсүп барабы — тыйылып калса cron же upload бузулган |

**Дагы:** Telegram `❌ FAILED` билдирүүсү келсе — дароо иштетүү; көпчүлүк учурда §3'ткo туш болобуз.
