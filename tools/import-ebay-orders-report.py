#!/usr/bin/env python3
import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


OUTPUT_PATH = Path("data/sales-backfill.json")


def clamp_title(value):
    cleaned = " ".join((value or "").split())
    if not cleaned:
        return "a Vaulture eBay item"
    if len(cleaned) <= 92:
        return cleaned
    return f"{cleaned[:89].strip()}..."


def parse_quantity(value):
    try:
        quantity = int(float(value or 1))
    except ValueError:
        quantity = 1
    return quantity if quantity > 0 else 1


def parse_sale_date(value):
    value = (value or "").strip()
    formats = [
        "%d-%b-%y",
        "%d-%b-%Y",
        "%d %b %Y",
        "%d %b %y",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.replace(hour=12, tzinfo=timezone.utc)
        except ValueError:
            pass

    raise ValueError(f"Unsupported Sale Date format: {value!r}")


def anonymised_id(parts):
    joined = "|".join(part for part in parts if part)
    return hashlib.sha256(joined.encode()).hexdigest()[:14]


def find_header_row(rows):
    for index, row in enumerate(rows):
        if "Item Title" in row and "Sale Date" in row and "Quantity" in row:
            return index, row
    raise ValueError("Could not find the eBay orders report header row.")


def import_sales(path):
    with path.open(newline="", encoding="utf-8-sig") as file:
        rows = list(csv.reader(file))

    header_index, headers = find_header_row(rows)
    sales = []

    for row in rows[header_index + 1:]:
      if len(row) != len(headers):
          continue

      record = dict(zip(headers, row))
      title = clamp_title(record.get("Item Title"))
      sale_date = (record.get("Sale Date") or "").strip()
      if not sale_date or not record.get("Item Title"):
          continue

      quantity = parse_quantity(record.get("Quantity"))
      sold_at = parse_sale_date(sale_date)
      sale_id = anonymised_id([
          record.get("Sales Record Number"),
          record.get("Item Number"),
          sale_date,
          title,
      ])

      sales.append({
          "id": sale_id,
          "source": "eBay",
          "title": title,
          "quantity": quantity,
          "soldAt": sold_at.isoformat().replace("+00:00", "Z"),
          "dedupeKey": f"orders-report|{sale_id}",
      })

    sales.sort(key=lambda sale: sale["soldAt"], reverse=True)
    return sales


def load_existing_sales():
    if not OUTPUT_PATH.exists():
        return []

    payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return payload.get("sales") or []


def merge_sales(sales):
    merged = {}

    for sale in sales:
        key = sale.get("dedupeKey") or "|".join([
            sale.get("source", ""),
            sale.get("soldAt", ""),
            sale.get("title", ""),
            str(sale.get("quantity") or 1),
        ])
        merged[key] = {
            "id": sale.get("id") or anonymised_id([key]),
            "source": sale.get("source") or "Marketplace",
            "title": clamp_title(sale.get("title")),
            "quantity": parse_quantity(sale.get("quantity")),
            "soldAt": sale.get("soldAt"),
            **({"dedupeKey": sale["dedupeKey"]} if sale.get("dedupeKey") else {}),
        }

    return sorted(merged.values(), key=lambda sale: sale["soldAt"], reverse=True)


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 tools/import-ebay-orders-report.py /path/to/eBay-orders-report.csv")
        return 1

    report_path = Path(sys.argv[1]).expanduser()
    sales = import_sales(report_path)
    merged_sales = merge_sales([*load_existing_sales(), *sales])
    payload = {
        "source": "marketplace-imports",
        "importedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "privacy": "Imported from marketplace exports with buyer names, usernames, addresses, emails, seller IDs, order IDs, prices, fees, payment details and tracking data removed.",
        "sales": merged_sales,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    print(f"Wrote {len(merged_sales)} anonymised sale records to {OUTPUT_PATH} ({len(sales)} eBay rows imported)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
