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
        "columns": ["Дата", "Контрагент", "Счёт", "Сумма", "Комментарий"],
        "empty_label": "Нет данных",
    },
    "expense_category": {
        "report_title": "Детализация по категории расходов",
        "item_label": "Категория",
        "columns": ["Дата", "Категория", "Счёт", "Сумма", "Комментарий"],
        "empty_label": "Нет данных",
    },
}


def _display_name(value: str | None) -> str:
    return value or "Uncategorized"


def _ensure_pdf_font_files_exist() -> None:
    missing_paths = [
        str(font_path)
        for font_path in (FONT_REGULAR_PATH, FONT_BOLD_PATH)
        if not font_path.is_file()
    ]
    if missing_paths:
        missing_display = ", ".join(missing_paths)
        raise RuntimeError(
            "Required DejaVu font files are missing for PDF export: "
            f"{missing_display}. Install DejaVu fonts in the backend image."
        )


def _register_pdf_fonts() -> None:
    _ensure_pdf_font_files_exist()
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

    # Unified PDF header: start with "Отчёты" for all reports
    story = [
        Paragraph("Отчёты", title_style),
        Spacer(1, 6),
        Paragraph(config["section_title"], heading_style),
        Spacer(1, 6),
        Paragraph(
            f'<font name="{FONT_BOLD}">Месяц:</font> {section_data["month"]}',
            body_style,
        ),
    ]
    if section_data.get("period_label"):
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Период:</font> {section_data["period_label"]}',
                body_style,
            )
        )
    else:
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Период:</font> весь месяц',
                body_style,
            )
        )
    if section_data.get("account_filter_label"):
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Счёт:</font> {section_data["account_filter_label"]}',
                body_style,
            )
        )
    story.extend(
        [
            Paragraph(
                f'<font name="{FONT_BOLD}">План:</font> {format_pdf_amount(section_data["totals"]["plan"])}',
                body_style,
            ),
            Paragraph(
                f'<font name="{FONT_BOLD}">Факт:</font> {format_pdf_amount(section_data["totals"]["fact"])}',
                body_style,
            ),
            Spacer(1, 10),
        ]
    )

    table_data = [[config["name_label"], "План", "Факт", "Разница", "Кол-во", "%"]]
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

    # Unified PDF header: start with "Отчёты" for all reports
    story = [
        Paragraph("Отчёты", title_style),
        Spacer(1, 6),
        Paragraph(config["report_title"], heading_style),
        Spacer(1, 6),
        Paragraph(
            f'<font name="{FONT_BOLD}">Месяц:</font> {detail_data["month"]}',
            body_style,
        ),
    ]
    if detail_data.get("period_label"):
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Период:</font> {detail_data["period_label"]}',
                body_style,
            )
        )
    else:
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Период:</font> весь месяц',
                body_style,
            )
        )
    if detail_data.get("account_filter_label"):
        story.append(
            Paragraph(
                f'<font name="{FONT_BOLD}">Счёт:</font> {detail_data["account_filter_label"]}',
                body_style,
            )
        )
    story.extend(
        [
            Paragraph(
                f'<font name="{FONT_BOLD}">{config["item_label"]}:</font> {_display_name(detail_data["item_name"])}',
                body_style,
            ),
            Paragraph(
                f'<font name="{FONT_BOLD}">Кол-во:</font> {detail_data["total_count"]}',
                body_style,
            ),
            Paragraph(
                f'<font name="{FONT_BOLD}">Сумма:</font> {format_pdf_amount(detail_data["total_amount"])}',
                body_style,
            ),
            Spacer(1, 10),
        ]
    )

    table_data = [config["columns"]]
    for row in detail_data["rows"]:
        account_raw = row.get("account")
        if account_raw == "CASH":
            account_label = "Касса"
        elif account_raw == "BANK":
            account_label = "Банк"
        else:
            account_label = "—"

        table_data.append(
            [
                row["date"],
                _display_name(row["name"]),
                account_label,
                format_pdf_amount(row["amount"]),
                row["comment"] or "—",
            ]
        )

    if len(table_data) == 1:
        table_data.append([config["empty_label"], "—", "—", "—"])

    table = Table(
        table_data,
        repeatRows=1,
        # 5 columns: Дата, Контрагент/Категория, Счёт, Сумма, Комментарий
        # Total width ~= 178 mm (210 - 2*16 margins)
        colWidths=[22 * mm, 42 * mm, 22 * mm, 32 * mm, 60 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
                # Slightly smaller font to keep 5-column table readable
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (2, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)

    document.build(story)
    return buffer.getvalue()


def build_transfer_direction_pdf(
    month: str,
    direction_label: str,
    total_amount: Decimal,
    detail_rows: list[dict],
) -> bytes:
    """
    Build a standalone PDF for transfers in a single direction for a given month.
    """
    _register_pdf_fonts()
    buffer = BytesIO()
    document = _build_pdf_document(buffer)
    title_style, heading_style, body_style = _build_pdf_styles()

    # Unified header: "Отчёты" + direction title + month
    story: list = [
        Paragraph("Отчёты", title_style),
        Spacer(1, 6),
        Paragraph(f"Переводы между счетами: {direction_label}", heading_style),
        Spacer(1, 6),
        Paragraph(f"Месяц: {month}", body_style),
        Spacer(1, 10),
    ]

    # Detail section (no summary table for direction-specific export)
    story.append(Paragraph("Детализация переводов", heading_style))

    if not detail_rows:
        story.append(
            Paragraph(
                "За выбранный месяц операций по данному направлению не было.",
                body_style,
            )
        )
    else:
        detail_table_data = [["Дата", "Откуда", "Куда", "Сумма", "Комментарий"]]
        for row in detail_rows:
            source_raw = row.get("source_account")
            dest_raw = row.get("destination_account")

            if source_raw == "CASH":
                source_label = "Касса"
            elif source_raw == "BANK":
                source_label = "Банк"
            else:
                source_label = "—"

            if dest_raw == "CASH":
                dest_label = "Касса"
            elif dest_raw == "BANK":
                dest_label = "Банк"
            else:
                dest_label = "—"

            detail_table_data.append(
                [
                    row.get("transferred_at") or "",
                    source_label,
                    dest_label,
                    format_pdf_amount(row.get("amount") or "0"),
                    Paragraph(str(row.get("comment") or ""), body_style),
                ]
            )

        detail_table = Table(
            detail_table_data,
            repeatRows=1,
            colWidths=[22 * mm, 32 * mm, 32 * mm, 24 * mm, 70 * mm],
        )
        detail_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
                    ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                    ("ALIGN", (0, 0), (0, -1), "LEFT"),
                    ("ALIGN", (1, 0), (2, -1), "LEFT"),
                    ("ALIGN", (4, 0), (4, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(detail_table)

    document.build(story)
    return buffer.getvalue()


def build_cash_movement_pdf(data: dict, filters: dict) -> bytes:
    """Build account statement PDF for cash movement in a period."""
    _register_pdf_fonts()
    buffer = BytesIO()
    document = _build_pdf_document(buffer)
    title_style, heading_style, body_style = _build_pdf_styles()

    account_raw = filters.get("account")
    if account_raw == "CASH":
        account_label = "Касса"
    elif account_raw == "BANK":
        account_label = "Банк"
    else:
        account_label = "—"

    start_date = filters.get("start_date")
    end_date = filters.get("end_date")
    period_label = f"{start_date.isoformat()} — {end_date.isoformat()}"

    opening = format_pdf_amount(data["opening_balance"])
    income = format_pdf_amount(data["period_income"])
    expense = format_pdf_amount(data["period_expense"])
    transfer_net = format_pdf_amount(data["transfer_net"])
    closing = format_pdf_amount(data["closing_balance"])

    # Optional label overrides for integrations, with exact required defaults.
    labels = {
        "opening_balance": "Начальный остаток",
        "period_income": "Доход за период",
        "period_expense": "Расход за период",
        "transfer_net": "Transfer net",
        "closing_balance": "Конечный остаток",
    }
    custom_labels = filters.get("labels")
    if isinstance(custom_labels, dict):
        labels.update({k: v for k, v in custom_labels.items() if isinstance(v, str) and v.strip()})

    story = [
        Paragraph("Отчёты", title_style),
        Spacer(1, 6),
        Paragraph("Движение средств по счёту", heading_style),
        Spacer(1, 8),
        Paragraph(f'<font name="{FONT_BOLD}">Период:</font> {period_label}', body_style),
        Paragraph(f'<font name="{FONT_BOLD}">Счёт:</font> {account_label}', body_style),
        Spacer(1, 10),
        Paragraph(f'<font name="{FONT_BOLD}">{labels["opening_balance"]}:</font> {opening}', body_style),
        Paragraph(f'<font name="{FONT_BOLD}">{labels["period_income"]}:</font> {income}', body_style),
        Paragraph(f'<font name="{FONT_BOLD}">{labels["period_expense"]}:</font> {expense}', body_style),
        Paragraph(f'<font name="{FONT_BOLD}">{labels["transfer_net"]}:</font> {transfer_net}', body_style),
        Paragraph(f'<font name="{FONT_BOLD}">{labels["closing_balance"]}:</font> {closing}', body_style),
    ]

    document.build(story)
    return buffer.getvalue()
