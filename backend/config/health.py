"""
Lightweight liveness / readiness endpoints used by the deploy healthcheck.

`healthz` returns 200 iff Django can ping the database. No auth, no router,
so CI/CD shell can curl it directly.
"""
from django.db import OperationalError, connection
from django.http import JsonResponse


def healthz(_request):
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except OperationalError as exc:
        return JsonResponse(
            {'status': 'error', 'db': 'unreachable', 'detail': str(exc)[:200]},
            status=503,
        )
    return JsonResponse({'status': 'ok', 'db': 'ok'})
