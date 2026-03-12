from apps.reports.services.pdf import (
    build_report_detail_pdf,
    build_report_section_pdf,
    format_pdf_amount,
)


class TestReportPdfFormatting:
    def test_format_pdf_amount_removes_trailing_zeroes_for_whole_amounts(self):
        assert format_pdf_amount("40000.00") == "40 000"
        assert format_pdf_amount("3150000.00") == "3 150 000"

    def test_format_pdf_amount_preserves_non_whole_amounts(self):
        assert format_pdf_amount("40000.50") == "40 000.50"
        assert format_pdf_amount("3150000.25") == "3 150 000.25"

    def test_build_report_section_pdf_supports_cyrillic_rows(self):
        pdf_content = build_report_section_pdf(
            "income_sources",
            {
                "month": "2026-03",
                "month_status": "OPEN",
                "totals": {
                    "plan": "40000.00",
                    "fact": "3150000.00",
                },
                "rows": [
                    {
                        "source_name": "карыз",
                        "plan": "40000.00",
                        "fact": "3150000.00",
                        "diff": "3110000.00",
                        "count": 2,
                        "sharePercent": 100.0,
                    },
                    {
                        "source_name": "жардам",
                        "plan": "1000.00",
                        "fact": "1000.00",
                        "diff": "0.00",
                        "count": 1,
                        "sharePercent": 0.0,
                    },
                ],
                "transfers": [
                    {
                        "direction": "Банк → Касса",
                        "amount": "300.00",
                        "comment": "Внутренний перевод между счетами. Не влияет на доходы и расходы.",
                    },
                    {
                        "direction": "Касса → Банк",
                        "amount": "0.00",
                        "comment": "Переводов не было",
                    },
                ],
                "transfer_details": [
                    {
                        "transferred_at": "2026-03-01",
                        "source_account": "BANK",
                        "destination_account": "CASH",
                        "amount": "300.00",
                        "comment": "Комментарий 1",
                    },
                    {
                        "transferred_at": "2026-03-02",
                        "source_account": "CASH",
                        "destination_account": "BANK",
                        "amount": "100.00",
                        "comment": "Комментарий 2",
                    },
                ],
            },
        )

        assert pdf_content.startswith(b"%PDF")
        assert b"DejaVuSans" in pdf_content

    def test_build_report_detail_pdf_supports_cyrillic_rows(self):
        pdf_content = build_report_detail_pdf(
            "income_source",
            {
                "month": "2026-03",
                "month_status": "OPEN",
                "item_name": "карыз",
                "total_count": 2,
                "total_amount": "3190000.00",
                "rows": [
                    {
                        "date": "2026-03-01",
                        "amount": "40000.00",
                        "name": "карыз",
                        "comment": "жардам",
                    },
                    {
                        "date": "2026-03-02",
                        "amount": "3150000.00",
                        "name": "карыз",
                        "comment": "жардам",
                    },
                ],
            },
        )

        assert pdf_content.startswith(b"%PDF")
        assert b"DejaVuSans" in pdf_content
