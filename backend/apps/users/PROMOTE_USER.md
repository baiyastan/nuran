# Promote User to Admin

## Django Shell Snippet

To promote an existing user to admin role, run Django shell and execute:

```python
from apps.users.models import User

# Promote user by email (replace 'admin@example.com' with actual email)
user = User.objects.get(email='admin@example.com')
user.role = 'admin'
user.is_staff = True
user.is_superuser = True
user.save()

# Verify
print(f"User: {user.email}, Role: {user.role}, Staff: {user.is_staff}, Superuser: {user.is_superuser}")
```

## One-liner (for quick execution)

Replace `admin@example.com` with the actual user email:

```bash
python manage.py shell -c "from apps.users.models import User; u = User.objects.get(email='admin@example.com'); u.role='admin'; u.is_staff=True; u.is_superuser=True; u.save(); print(f'Promoted: {u.email} -> {u.role}')"
```

## Notes

- Replace `admin@example.com` with the actual user email in both snippets above
- After promotion, user will have full admin access
- User must log out and log back in for frontend to pick up the new role
- Only existing superusers or admins should run this command

