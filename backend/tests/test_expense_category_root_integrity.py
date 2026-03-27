import pytest
from django.core.management import call_command
from django.core.exceptions import ValidationError

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import ExpenseCategory
from apps.budgeting.services.category_bootstrap import ensure_canonical_expense_roots


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_roots',
        email='admin_roots@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.mark.django_db
def test_cannot_create_manual_root_via_api(admin_client):
    response = admin_client.post(
        '/api/v1/budgets/expense-categories/',
        {
            'name': 'Manual root',
            'scope': 'office',
            'kind': 'EXPENSE',
            'parent': None,
        },
        format='json',
    )
    assert response.status_code == 400
    assert 'system-defined' in str(response.data).lower()


@pytest.mark.django_db
def test_can_create_child_under_canonical_root(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='office', name='Офис расходы', parent__isnull=True)
    response = admin_client.post(
        '/api/v1/budgets/expense-categories/',
        {
            'name': 'Stationery',
            'scope': 'office',
            'kind': 'EXPENSE',
            'parent': root.id,
        },
        format='json',
    )
    assert response.status_code == 201
    assert response.data['parent_id'] == root.id


@pytest.mark.django_db
def test_duplicate_child_name_same_parent_rejected(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='project', name='Объект расходы', parent__isnull=True)
    ExpenseCategory.objects.create(
        name='  Materials  ',
        scope='project',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )
    response = admin_client.post(
        '/api/v1/budgets/expense-categories/',
        {
            'name': 'materials',
            'scope': 'project',
            'kind': 'EXPENSE',
            'parent': root.id,
        },
        format='json',
    )
    assert response.status_code == 400
    assert 'name' in response.data
    assert response.data['name']


@pytest.mark.django_db
def test_ensure_canonical_roots_creates_missing():
    ExpenseCategory.objects.all().delete()
    result = ensure_canonical_expense_roots()
    assert len(result) == 3
    assert ExpenseCategory.objects.filter(parent__isnull=True, scope='office', name='Офис расходы').exists()
    assert ExpenseCategory.objects.filter(parent__isnull=True, scope='project', name='Объект расходы').exists()
    assert ExpenseCategory.objects.filter(parent__isnull=True, scope='charity', name='Благотворительность').exists()


@pytest.mark.django_db
def test_repair_duplicate_roots_dry_run_does_not_write():
    canonical = ExpenseCategory.objects.create(
        name='Офис расходы',
        scope='office',
        kind='EXPENSE',
        parent=None,
        is_active=False,
        is_system_root=True,
    )
    duplicate = ExpenseCategory.objects.create(
        name='Офис расходы',
        scope='office',
        kind='EXPENSE',
        parent=None,
        is_active=True,
    )
    child = ExpenseCategory.objects.create(
        name='Paper',
        scope='office',
        kind='EXPENSE',
        parent=duplicate,
        is_active=True,
    )

    call_command('repair_duplicate_roots')
    child.refresh_from_db()
    duplicate.refresh_from_db()
    assert child.parent_id == duplicate.id
    assert duplicate.is_active is True
    assert ExpenseCategory.objects.filter(pk=duplicate.id).exists()
    assert canonical.id != duplicate.id


@pytest.mark.django_db
def test_repair_duplicate_roots_apply_repoints_and_deactivates():
    canonical = ExpenseCategory.objects.create(
        name='Объект расходы',
        scope='project',
        kind='EXPENSE',
        parent=None,
        is_active=False,
        is_system_root=True,
    )
    duplicate = ExpenseCategory.objects.create(
        name='Объект расходы',
        scope='project',
        kind='EXPENSE',
        parent=None,
        is_active=True,
    )
    child = ExpenseCategory.objects.create(
        name='Concrete',
        scope='project',
        kind='EXPENSE',
        parent=duplicate,
        is_active=True,
    )

    call_command('repair_duplicate_roots', '--apply')

    child.refresh_from_db()
    duplicate.refresh_from_db()
    assert child.parent_id == canonical.id
    assert duplicate.is_active is False
    assert ExpenseCategory.objects.filter(pk=duplicate.id).exists()


@pytest.mark.django_db
def test_unique_active_root_per_scope_enforced():
    ExpenseCategory.objects.create(
        name='Благотворительность',
        scope='charity',
        kind='EXPENSE',
        parent=None,
        is_active=True,
        is_system_root=True,
    )
    with pytest.raises(ValidationError):
        second = ExpenseCategory(
            name='Another charity root',
            scope='charity',
            kind='EXPENSE',
            parent=None,
            is_active=True,
        )
        second.full_clean()


@pytest.mark.django_db
def test_create_without_parent_rejected(admin_client):
    ensure_canonical_expense_roots()
    response = admin_client.post(
        '/api/v1/budgets/expense-categories/',
        {
            'name': 'No parent category',
            'scope': 'office',
            'kind': 'EXPENSE',
        },
        format='json',
    )
    assert response.status_code == 400
    assert 'parent' in response.data


@pytest.mark.django_db
def test_cannot_create_category_under_ordinary_child(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='office', is_system_root=True, parent__isnull=True)
    ordinary_child = ExpenseCategory.objects.create(
        name='Office Child',
        scope='office',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )

    response = admin_client.post(
        '/api/v1/budgets/expense-categories/',
        {
            'name': 'Nested Child',
            'scope': 'office',
            'kind': 'EXPENSE',
            'parent': ordinary_child.id,
        },
        format='json',
    )
    assert response.status_code == 400
    assert 'parent' in response.data


@pytest.mark.django_db
def test_cannot_update_category_to_become_manual_root(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='project', is_system_root=True, parent__isnull=True)
    child = ExpenseCategory.objects.create(
        name='Concrete',
        scope='project',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )

    response = admin_client.patch(
        f'/api/v1/budgets/expense-categories/{child.id}/',
        {'parent': None},
        format='json',
    )
    assert response.status_code == 400
    assert 'parent' in response.data


@pytest.mark.django_db
def test_cannot_move_category_under_non_root_child(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='charity', is_system_root=True, parent__isnull=True)
    first_child = ExpenseCategory.objects.create(
        name='Medicine',
        scope='charity',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )
    second_child = ExpenseCategory.objects.create(
        name='Food',
        scope='charity',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )

    response = admin_client.patch(
        f'/api/v1/budgets/expense-categories/{second_child.id}/',
        {'parent': first_child.id},
        format='json',
    )
    assert response.status_code == 400
    assert 'parent' in response.data


@pytest.mark.django_db
def test_cannot_edit_system_root_name_manually(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='office', is_system_root=True, parent__isnull=True)

    response = admin_client.patch(
        f'/api/v1/budgets/expense-categories/{root.id}/',
        {'name': 'Renamed root'},
        format='json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_expense_categories_list_returns_full_filtered_results_without_pagination(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='office', is_system_root=True, parent__isnull=True)

    for idx in range(25):
        ExpenseCategory.objects.create(
            name=f'Office child {idx}',
            scope='office',
            kind='EXPENSE',
            parent=root,
            is_active=True,
        )
    ExpenseCategory.objects.create(
        name='Office inactive child',
        scope='office',
        kind='EXPENSE',
        parent=root,
        is_active=False,
    )

    response = admin_client.get('/api/v1/budgets/expense-categories/?scope=office&is_active=true')
    assert response.status_code == 200
    assert response.data['next'] is None
    assert response.data['previous'] is None
    assert response.data['count'] == len(response.data['results'])
    # 1 active root + 25 active children (inactive child excluded by filter)
    assert response.data['count'] == 26
    assert all(item['scope'] == 'office' for item in response.data['results'])
    assert all(item['is_active'] is True for item in response.data['results'])


@pytest.mark.django_db
def test_expense_categories_list_kind_filter_still_works_without_pagination(admin_client):
    ensure_canonical_expense_roots()
    root = ExpenseCategory.objects.get(scope='project', is_system_root=True, parent__isnull=True)
    ExpenseCategory.objects.create(
        name='Project income legacy',
        scope='project',
        kind='INCOME',
        parent=root,
        is_active=True,
    )
    ExpenseCategory.objects.create(
        name='Project expense child',
        scope='project',
        kind='EXPENSE',
        parent=root,
        is_active=True,
    )

    response = admin_client.get('/api/v1/budgets/expense-categories/?scope=project&is_active=true&kind=EXPENSE')
    assert response.status_code == 200
    assert response.data['next'] is None
    assert response.data['count'] == len(response.data['results'])
    assert all(item['scope'] == 'project' for item in response.data['results'])
    assert all(item['is_active'] is True for item in response.data['results'])
    assert all(item['kind'] == 'EXPENSE' for item in response.data['results'])

