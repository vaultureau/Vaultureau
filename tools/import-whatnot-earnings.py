#!/usr/bin/env python3
import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


OUTPUT_PATH = Path("data/sales-backfill.json")
PUBLIC_FEED_PATH = Path("data/sales-feed.json")
ORDER_TRANSACTION_TYPE = "ORDER_EARNINGS"


def clamp_title(value):
    cleaned = " ".join((value or "").split())
    if not cleaned:
        return "a Vaulture Whatnot item"
    if len(cleaned) <= 92:
        return cleaned
    return f"{cleaned[:89].strip()}..."


def parse_quantity(value):
    try:
        quantity = int(float(value or 1))
    except ValueError:
        quantity = 1
    return quantity if quantity > 0 else 1


def parse_utc_datetime(value):
    value = (value or "").strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            pass

    raise ValueError(f"Unsupported Whatnot date format: {value!r}")


def anonymised_id(parts):
    joined = "|".join(part for part in parts if part)
    return hashlib.sha256(joined.encode()).hexdigest()[:14]


def safe_sale_from_public_feed(record):
    sale_id = (record.get("id") or "").strip()
    title = clamp_title(record.get("title"))
    sold_at = (record.get("soldAt") or "").strip()

    if not sale_id or not title or not sold_at:
        return None

    return {
        "id": sale_id,
        "source": record.get("source") or "eBay",
        "title": title,
        "quantity": parse_quantity(record.get("quantity")),
        "soldAt": parse_utc_datetime(sold_at.replace(".000Z", "Z")).isoformat().replace("+00:00", "Z"),
    }


def load_existing_sales():
    sales = []

    if OUTPUT_PATH.exists():
        payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        sales.extend(payload.get("sales") or [])

    existing_ids = {sale.get("id") for sale in sales if sale.get("id")}

    if PUBLIC_FEED_PATH.exists():
        payload = json.loads(PUBLIC_FEED_PATH.read_text(encoding="utf-8"))
        for record in payload.get("recent") or []:
            if record.get("id") in existing_ids:
                continue
            safe_sale = safe_sale_from_public_feed(record)
            if safe_sale:
                sales.append(safe_sale)
                existing_ids.add(safe_sale["id"])

    return sales


def import_sales(path):
    sales = []
    skipped = 0

    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        for record in reader:
            if not any((value or "").strip() for value in record.values()):
                continue

            if (record.get("TRANSACTION_TYPE") or "").strip() != ORDER_TRANSACTION_TYPE:
                skipped += 1
                continue

            title = clamp_title(record.get("LISTING_TITLE"))
            sold_at = parse_utc_datetime(
                record.get("ORDER_PLACED_AT_UTC") or record.get("TRANSACTION_COMPLETED_AT_UTC")
            )
            quantity = parse_quantity(record.get("QUANTITY_SOLD"))
            sale_id = anonymised_id([
                record.get("ORDER_ID"),
                record.get("LEDGER_TRANSACTION_ID"),
                record.get("SHIPMENT_ID"),
                sold_at.isoformat(),
                title,
            ])

            sales.append({
                "id": sale_id,
                "source": "Whatnot",
                "title": title,
                "quantity": quantity,
                "soldAt": sold_at.isoformat().replace("+00:00", "Z"),
                "dedupeKey": f"whatnot-earnings|{sale_id}",
            })

    return sales, skipped


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
            "soldAt": parse_utc_datetime(str(sale.get("soldAt") or "")).isoformat().replace("+00:00", "Z"),
            **({"dedupeKey": sale["dedupeKey"]} if sale.get("dedupeKey") else {}),
        }

    return sorted(merged.values(), key=lambda sale: sale["soldAt"], reverse=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 tools/import-whatnot-earnings.py /path/to/*_earnings.csv [...]")
        return 1

    imported_sales = []
    skipped = 0

    for report_path in (Path(value).expanduser() for value in sys.argv[1:]):
        sales, skipped_rows = import_sales(report_path)
        imported_sales.extend(sales)
        skipped += skipped_rows

    merged_sales = merge_sales([*load_existing_sales(), *imported_sales])
    payload = {
        "source": "marketplace-imports",
        "importedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "privacy": "Imported from marketplace exports with buyer names, seller IDs, order IDs, shipment IDs, prices, fees, payment details and tracking data removed.",
        "sales": merged_sales,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n", encoding="utf-8")
    print(
        f"Wrote {len(merged_sales)} anonymised sale records to {OUTPUT_PATH} "
        f"({len(imported_sales)} Whatnot order rows imported, {skipped} non-order rows skipped)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
