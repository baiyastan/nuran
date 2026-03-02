"""
User models.
"""
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    """Custom user manager that handles email as username and sets role for superusers."""
    
    def create_user(self, email, username=None, password=None, **extra_fields):
        """Create and save a regular user."""
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        if username is None:
            username = email.split('@')[0]  # Use email prefix as username
        
        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, username=None, password=None, **extra_fields):
        """Create and save a superuser with admin role."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')  # Set role to admin for superusers
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        if extra_fields.get('role') != 'admin':
            raise ValueError('Superuser must have role="admin".')
        
        return self.create_user(email, username, password, **extra_fields)


class User(AbstractUser):
    """Custom user model with email as username and role field."""
    
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('director', 'Director'),
        ('foreman', 'Foreman'),
    ]
    
    email = models.EmailField(
        unique=True,
        help_text='Email address used for login'
    )
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='foreman',
        help_text='User role for RBAC'
    )
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']  # username still required but not used for login
    
    objects = UserManager()
    
    class Meta:
        ordering = ['id']
    
    def __str__(self):
        return f"{self.email} ({self.role})"

