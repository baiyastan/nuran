"""Canonical expense root bootstrap helpers."""

from apps.budgeting.models import ExpenseCategory


CANONICAL_ROOTS = {
    'office': 'Офис расходы',
    'project': 'Объект расходы',
    'charity': 'Благотворительность',
}


def ensure_canonical_expense_roots():
    """
    Ensure canonical roots exist and are marked as system roots.

    This helper does not merge duplicates. It only guarantees each scope has
    at least one canonical root available for controlled workflows.
    """
    result = []
    for scope, canonical_name in CANONICAL_ROOTS.items():
        root = (
            ExpenseCategory.objects.filter(
                scope=scope,
                parent__isnull=True,
                name=canonical_name,
            )
            .order_by('id')
            .first()
        )
        created = False
        if root is None:
            root = ExpenseCategory.objects.create(
                name=canonical_name,
                scope=scope,
                kind='EXPENSE',
                parent=None,
                is_active=True,
                is_system_root=True,
            )
            created = True
        else:
            changed = False
            if not root.is_active:
                root.is_active = True
                changed = True
            if not root.is_system_root:
                root.is_system_root = True
                changed = True
            if root.kind != 'EXPENSE':
                root.kind = 'EXPENSE'
                changed = True
            if changed:
                root.save(update_fields=['is_active', 'is_system_root', 'kind', 'updated_at'])

        result.append(
            {
                'scope': scope,
                'name': canonical_name,
                'id': root.id,
                'created': created,
            }
        )

    return result

