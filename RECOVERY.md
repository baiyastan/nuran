# Nuran Production Disaster Recovery Runbook

## 1. Goal
Restore Nuran production service after a full outage with minimum downtime and verified data integrity.

## 2. New server setup
1. Create a new DigitalOcean VPS (same region/size as production if possible).
2. Install Docker Engine and Docker Compose plugin.
3. Install Git and clone the Nuran repository to the server.
4. Open required ports in firewall/security group (`22`, `80`, `443`).
5. Confirm DNS access and SSH access to the new server.

## 3. Restore `.env`
1. Copy the latest production `.env` to the project root on the new server.
2. Verify required variables are present (Django, Postgres, S3, domain, secrets).
3. Set secure permissions for `.env` (readable only by deploy user/root).

## 4. Start Docker services
1. From project root, pull/build images:
   - `docker compose pull || true`
   - `docker compose build`
2. Start stack:
   - `docker compose up -d`
3. Check containers:
   - `docker compose ps`
   - `docker compose logs --tail=100`

## 5. Download latest backup from S3
1. Configure AWS-compatible credentials for Timeweb S3 on the server.
2. List available backups and identify the latest valid dump.
3. Download backup file to a local restore directory (for example `/opt/backups`).
4. Validate file size/date before restore.

## 6. Restore database
1. Ensure Postgres container is healthy.
2. (If needed) create/prepare target database.
3. Restore backup into Postgres using the proper format (`.sql`, `.dump`, or `.gz`).
4. Run Django migrations:
   - `docker compose exec backend python manage.py migrate`
5. (If used) collect static files:
   - `docker compose exec backend python manage.py collectstatic --noinput`

## 7. Check app health
1. Confirm Django container is running with no startup errors.
2. Check Nginx container logs for upstream/connectivity errors.
3. Open health endpoint and key user flows (login, dashboard, reports).
4. Verify DB read/write works in the app.

## 8. DNS / domain check
1. Point domain A record to the new VPS IP (if failover requires IP change).
2. Verify DNS propagation with `dig`/`nslookup`.
3. Confirm Nginx serves the correct domain and SSL certificate is valid.

## 9. Final verification checklist
- [ ] All required containers are `Up` and stable.
- [ ] Database restored from latest valid backup.
- [ ] Migrations completed successfully.
- [ ] Static/media availability confirmed.
- [ ] Health endpoint returns success.
- [ ] Core business flows tested successfully.
- [ ] Domain resolves to correct server.
- [ ] SSL works with no certificate errors.
- [ ] Incident notes documented (timeline, root cause, actions).

## Critical notes
- Without a valid `.env`, the application will not start correctly.
- Without a usable S3 backup, production data cannot be recovered.
- Disaster recovery must be tested periodically (scheduled DR drills).



## 🇰🇬 Кыргызча версия

## 1. Максат
Толук өчүп калуу болгондон кийин Nuran production кызматын минималдуу токтоп туруу менен жана маалымат бүтүндүгүн текшерип калыбына келтирүү.

## 2. Жаңы серверди даярдоо
1. Жаңы DigitalOcean VPS түзүңүз (мүмкүн болсо production менен бирдей регион/өлчөм).
2. Docker Engine жана Docker Compose plugin орнотуңуз.
3. Git орнотуп, Nuran репозиторийин серверге clone кылыңыз.
4. Firewall/security group ичинде керектүү портторду ачыңыз (`22`, `80`, `443`).
5. Жаңы серверге DNS жана SSH жеткиликтүүлүгүн текшериңиз.

## 3. `.env` калыбына келтирүү
1. Акыркы production `.env` файлын жаңы сервердеги долбоордун root папкасына көчүрүңүз.
2. Керектүү өзгөрмөлөр бар экенин текшериңиз (Django, Postgres, S3, domain, secrets).
3. `.env` үчүн коопсуз уруксаттарды коюңуз (deploy user/root гана окуй ала тургандай).

## 4. Docker кызматтарын иштетүү
1. Долбоордун root папкасынан image'дерди pull/build кылыңыз:
   - `docker compose pull || true`
   - `docker compose build`
2. Стекти иштетиңиз:
   - `docker compose up -d`
3. Контейнерлерди текшериңиз:
   - `docker compose ps`
   - `docker compose logs --tail=100`

## 5. S3'төн акыркы backup'ту жүктөө
1. Серверде Timeweb S3 үчүн AWS-шайкеш credentials'тарды конфигурациялаңыз.
2. Жеткиликтүү backup'тардын тизмесин алып, эң акыркы жарактуу dump'ту аныктаңыз.
3. Backup файлын жергиликтүү restore папкасына жүктөңүз (мисалы `/opt/backups`).
4. Restore кылуудан мурда файлдын көлөмүн/датасын текшериңиз.

## 6. Базаны калыбына келтирүү
1. Postgres контейнери healthy абалда экенин текшериңиз.
2. (Керек болсо) максаттуу базаны түзүңүз/даярдаңыз.
3. Backup'ту туура формат менен Postgres'ке калыбына келтириңиз (`.sql`, `.dump`, же `.gz`).
4. Django migrations иштетиңиз:
   - `docker compose exec backend python manage.py migrate`
5. (Колдонулса) static файлдарды чогултуңуз:
   - `docker compose exec backend python manage.py collectstatic --noinput`

## 7. Тиркеменин абалын текшерүү
1. Django контейнери startup катасыз иштеп жатканын ырастаңыз.
2. Nginx контейнер логдорун upstream/connectivity каталарына текшериңиз.
3. Health endpoint'ти жана негизги колдонуучу агымдарын ачыңыз (login, dashboard, reports).
4. Тиркемеде DB окуу/жазуу иштеп жатканын текшериңиз.

## 8. DNS / домен текшерүүсү
1. Домендин A record'ун жаңы VPS IP'сине багыттаңыз (эгер failover үчүн IP алмашуу керек болсо).
2. DNS propagation'ду `dig`/`nslookup` менен текшериңиз.
3. Nginx туура доменди тейлеп жатканын жана SSL сертификаты жарактуу экенин ырастаңыз.

## 9. Акыркы текшерүү checklist
- [ ] Бардык керектүү контейнерлер `Up` жана туруктуу абалда.
- [ ] База эң акыркы жарактуу backup'тан калыбына келтирилди.
- [ ] Migrations ийгиликтүү аяктады.
- [ ] Static/media жеткиликтүүлүгү текшерилди.
- [ ] Health endpoint ийгиликтүү жооп кайтарат.
- [ ] Негизги бизнес агымдары ийгиликтүү текшерилди.
- [ ] Домен туура серверге чечилет.
- [ ] SSL сертификат катасыз иштейт.
- [ ] Инцидент боюнча жазуулар толтурулду (timeline, root cause, actions).

## Критикалык эскертүүлөр
- Жарактуу `.env` болбосо, тиркеме туура ишке кирбейт.
- Колдонууга жарактуу S3 backup болбосо, production маалыматтарын калыбына келтирүү мүмкүн эмес.
- Disaster recovery процедурасы мезгил-мезгили менен текшерилип турушу керек (пландуу DR машыгуулары).
