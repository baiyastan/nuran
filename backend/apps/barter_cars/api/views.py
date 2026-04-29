"""Admin-only REST endpoints for barter cars."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import BarterCar
from ..permissions import IsAdmin
from ..services import (
    compute_stats,
    create_barter_car,
    edit_received_car,
    mark_sold,
    soft_delete,
)
from .serializers import BarterCarSerializer, MarkSoldSerializer


def _raise_drf(exc: DjangoValidationError):
    """Translate Django ValidationError to DRF 400."""
    detail = getattr(exc, 'message_dict', None) or exc.messages
    raise DRFValidationError(detail)


class BarterCarViewSet(viewsets.ModelViewSet):
    """Admin-only CRUD + custom actions for barter cars."""

    serializer_class = BarterCarSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'brand', 'agreed_currency']
    search_fields = ['brand', 'model', 'plate_number', 'vin', 'received_from_name']
    ordering_fields = ['received_at', 'sold_at', 'created_at', 'agreed_value']
    ordering = ['-received_at', '-id']

    def get_queryset(self):
        qs = BarterCar.objects.all()
        include_archived = self.request.query_params.get('include_archived') == 'true'
        if not include_archived:
            qs = qs.filter(is_active=True)
        return qs.select_related('created_by')

    def perform_create(self, serializer):
        try:
            car = create_barter_car(actor=self.request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            _raise_drf(exc)
        serializer.instance = car

    def perform_update(self, serializer):
        car = serializer.instance
        try:
            edit_received_car(
                car, actor=self.request.user, **serializer.validated_data
            )
        except DjangoValidationError as exc:
            _raise_drf(exc)

    def perform_destroy(self, instance):
        try:
            soft_delete(instance, actor=self.request.user)
        except DjangoValidationError as exc:
            _raise_drf(exc)

    @action(detail=True, methods=['post'], url_path='mark-sold')
    def mark_sold(self, request, pk=None):
        car = self.get_object()
        in_serializer = MarkSoldSerializer(data=request.data)
        in_serializer.is_valid(raise_exception=True)
        payload = in_serializer.validated_data
        notes = payload.pop('notes', '')
        try:
            mark_sold(car, actor=request.user, **payload)
        except DjangoValidationError as exc:
            _raise_drf(exc)
        if notes:
            car.notes = (car.notes + '\n' if car.notes else '') + f'[sold] {notes}'
            car.save(update_fields=['notes', 'updated_at'])
        car.refresh_from_db()
        return Response(
            BarterCarSerializer(car).data, status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        qs = BarterCar.objects.all()  # compute_stats filters is_active itself
        return Response(compute_stats(qs))
