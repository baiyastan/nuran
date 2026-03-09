"""
PDF rendering helpers for reports.
"""
from __future__ import annotations

from io import BytesIO
from decimal import Decimal, InvalidOperation
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_REGULAR = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"
FONT_REGULAR_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
FONT_BOLD_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


SECTION_CONFIG = {
    "income_sources": {
        "section_title": "Сводка по источникам дохода",
        "name_label": "Название",
    },
    "expense_categories": {
        "section_title": "Сводка по категориям расходов",
        "name_label": "Название",
    },
}

DETAIL_CONFIG = {
    "income_source": {
        "report_title": "Детализация по источнику дохода",
        "item_label": "Источник",
        "columns": ["Дата", "Сумма", "Источник", "Комментарий"],
        "empty_label": "Нет данных",
    },
    "expense_category": {
        "report_title": "Детализация по категории расходов",
        "item_label": "Категория",
        "columns": ["Дата", "Сумма", "Категория", "Комментарий"],
        "empty_label": "Нет данных",
    },
}


def _display_name(value: str | None) -> str:
    return value or "Uncategorized"


def _register_pdf_fonts() -> None:
    registered_fonts = pdfmetrics.getRegisteredFontNames()
    if FONT_REGULAR not in registered_fonts:
        pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(FONT_REGULAR_PATH)))
    if FONT_BOLD not in registered_fonts:
        pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_BOLD_PATH)))


def format_pdf_amount(value: object) -> str:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return str(value)

    quantized = amount.quantize(Decimal("0.01"))
    if quantized == quantized.quantize(Decimal("1")):
        return f"{int(quantized):,}".replace(",", " ")

    return f"{quantized:,.2f}".replace(",", " ")


def _build_pdf_styles():
    styles = getSampleStyleSheet()
    title_style = styles["Title"].clone("PdfTitle")
    title_style.fontName = FONT_BOLD
    heading_style = styles["Heading2"].clone("PdfHeading")
    heading_style.fontName = FONT_BOLD
    body_style = styles["BodyText"].clone("PdfBody")
    body_style.fontName = FONT_REGULAR
    return title_style, heading_style, body_style


def _build_pdf_document(buffer: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )


def build_report_section_pdf(section_type: str, section_data: dict) -> bytes:
    _register_pdf_fonts()
    config = SECTION_CONFIG[section_type]
    buffer = BytesIO()
    document = _build_pdf_document(buffer)
    title_style, heading_style, body_style = _build_pdf_styles()

    rows = sorted(
        section_data["rows"],
        key=lambda row: _display_name(row.get("source_name") or row.get("category_name")).lower(),
    )

    story = [
        Paragraph("Nuran", title_style),
        Spacer(1, 6),
        Paragraph("Отчёты", heading_style),
        Paragraph(config["section_title"], heading_style),
        Spacer(1, 6),
        Paragraph(f"Месяц: {section_data['month']}", body_style),
        Paragraph(f"Статус месяца: {section_data['month_status']}", body_style),
        Paragraph(f"План: {format_pdf_amount(section_data['totals']['plan'])}", body_style),
        Paragraph(f"Факт: {format_pdf_amount(section_data['totals']['fact'])}", body_style),
        Spacer(1, 10),
    ]

    table_data = [[config["name_label"], "План", "Факт", "Разница", "Кол-во", "Доля %"]]
    for row in rows:
        table_data.append(
            [
                _display_name(row.get("source_name") or row.get("category_name")),
                format_pdf_amount(row["plan"]),
                format_pdf_amount(row["fact"]),
                format_pdf_amount(row["diff"]),
                str(row["count"]),
                f"{row['sharePercent']:.1f}%" if row["sharePercent"] is not None else "—",
            ]
        )

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[58 * mm, 24 * mm, 24 * mm, 24 * mm, 18 * mm, 22 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)

    document.build(story)
    return buffer.getvalue()


def build_report_detail_pdf(detail_type: str, detail_data: dict) -> bytes:
    _register_pdf_fonts()
    config = DETAIL_CONFIG[detail_type]
    buffer = BytesIO()
    document = _build_pdf_document(buffer)
    title_style, heading_style, body_style = _build_pdf_styles()

    story = [
        Paragraph("Nuran", title_style),
        Spacer(1, 6),
        Paragraph("Отчёты", heading_style),
        Paragraph(config["report_title"], heading_style),
        Spacer(1, 6),
        Paragraph(f"Месяц: {detail_data['month']}", body_style),
        Paragraph(f"Статус месяца: {detail_data['month_status']}", body_style),
        Paragraph(f"{config['item_label']}: {_display_name(detail_data['item_name'])}", body_style),
        Paragraph(f"Кол-во: {detail_data['total_count']}", body_style),
        Paragraph(f"Сумма: {format_pdf_amount(detail_data['total_amount'])}", body_style),
        Spacer(1, 10),
    ]

    table_data = [config["columns"]]
    for row in detail_data["rows"]:
        table_data.append(
            [
                row["date"],
                format_pdf_amount(row["amount"]),
                _display_name(row["name"]),
                row["comment"] or "—",
            ]
        )

    if len(table_data) == 1:
        table_data.append([config["empty_label"], "—", "—", "—"])

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[28 * mm, 28 * mm, 48 * mm, 68 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (2, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)

    document.build(story)
    return buffer.getvalue()
