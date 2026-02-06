"""
User API serializers.
"""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from ..models import User


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT token serializer that uses email instead of username."""
    
    username_field = 'email'
    
    def validate(self, attrs):
        """Validate and authenticate user using email."""
        credentials = {
            'email': attrs.get('email'),
            'password': attrs.get('password')
        }
        
        if not all(credentials.values()):
            raise serializers.ValidationError('Email and password are required.')
        
        user = User.objects.filter(email=credentials['email']).first()
        
        if user and user.check_password(credentials['password']):
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled.')
            
            refresh = self.get_token(user)
            
            data = {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
            
            return data
        else:
            raise serializers.ValidationError('Invalid email or password.')


class RegisterSerializer(serializers.Serializer):
    """Serializer for user registration."""
    
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=True, min_length=8)
    
    def validate(self, attrs):
        """Validate password match."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        return attrs
    
    def create(self, validated_data):
        """Create user with role="foreman"."""
        email = validated_data['email']
        password = validated_data['password']
        
        # Check if user already exists
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({'email': 'User with this email already exists.'})
        
        # Create user with role="foreman" (always, ignore any incoming role)
        user = User.objects.create_user(
            email=email,
            password=password,
            role='foreman'  # Always set to foreman
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User."""
    
    class Meta:
        model = User
        fields = ['id', 'email', 'role']
        read_only_fields = ['id', 'email', 'role']
    
    def validate_role(self, value):
        """Prevent role changes via API - role is read-only."""
        if self.instance and self.instance.role != value:
            raise serializers.ValidationError('Role cannot be changed via API.')
        return value


class UserListSerializer(serializers.ModelSerializer):
    """Serializer for listing users."""
    
    class Meta:
        model = User
        fields = ['id', 'email', 'role', 'is_active', 'date_joined']


class UserRoleUpdateSerializer(serializers.Serializer):
    """Serializer for updating user role."""
    
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=True)
    
    def validate_role(self, value):
        """Validate role is one of the allowed choices."""
        if value not in ['admin', 'director', 'foreman']:
            raise serializers.ValidationError('Invalid role. Must be one of: admin, director, foreman.')
        return value

