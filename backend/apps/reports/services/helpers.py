"""Small pure helpers for reports (no ORM)."""
from decimal import Decimal


def to_decimal_str(value: Decimal) -> str:
    return str((value or Decimal('0.00')).quantize(Decimal('0.00')))
