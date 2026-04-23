"""Serializers for barter-car admin endpoints."""
from rest_framework import serializers

from ..models import BarterCar


class BarterCarSerializer(serializers.ModelSerializer):
    """Full serializer for list / detail / create / edit."""

    margin = serializers.SerializerMethodField()

    class Meta:
        model = BarterCar
        fields = [
            'id',
            'brand', 'model', 'year',
            'plate_number', 'vin', 'color', 'mileage_km',
            'has_tech_passport', 'received_by_dover',
            'received_from_name', 'received_from_phone',
            'apartment_ref',
            'agreed_value', 'agreed_currency', 'received_at',
            'status',
            'sold_price', 'sold_currency', 'sold_to_name', 'sold_to_phone', 'sold_at',
            'notes',
            'is_active',
            'created_at', 'updated_at', 'created_by',
            'margin',
        ]
        read_only_fields = [
            'id', 'status',
            'sold_price', 'sold_currency', 'sold_to_name', 'sold_to_phone', 'sold_at',
            'is_active',
            'created_at', 'updated_at', 'created_by',
            'margin',
        ]

    def get_margin(self, obj):
        value = obj.margin
        return None if value is None else str(value)


class MarkSoldSerializer(serializers.Serializer):
    """Input for POST /barter-cars/{id}/mark-sold/."""

    sold_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    sold_currency = serializers.ChoiceField(choices=[('KGS', 'KGS'), ('USD', 'USD')])
    sold_at = serializers.DateField()
    sold_to_name = serializers.CharField(max_length=120)
    sold_to_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=''
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
