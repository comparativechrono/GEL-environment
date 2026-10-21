#!/usr/bin/env python3
"""
Build the simulated data-browser schema from an official Genomics England
data dictionary spreadsheet.

The Research Environment documentation publishes the data dictionary for each
release as an .xlsx file (e.g. r19_data_dictionary.xlsx, GMS_data_dictionary_v5.xlsx).
Each "category" sheet lists, per table, every field with its short name (column
caption), data type and enumerated values. This script turns those sheets into
the JSON schema used by js/services/labkey-server.js to create empty tables.

Only structural information is kept: table names, column names, column captions,
data types and enumerated codes. Free-text field descriptions are deliberately
omitted - point users at the official dictionary for those.

Usage:
    python3 tools/build_labkey_schema.py \
        --xlsx r19_data_dictionary.xlsx \
        --project main-programme \
        --folder main-programme_v19_2024-10-31 \
        --label "100kGP Release v19" \
        --out data/labkey/schema/main-programme_v19_2024-10-31.json

Requires: openpyxl
"""
import argparse
import datetime as _dt
import json
import re
import sys

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required: pip install openpyxl")

# Sheet name -> LabKey "Data Views" category shown in the simulator.
CATEGORY_MAP = {
    "quick views": "Quick View",
    "common": "Common",
    "bioinformatics": "Bioinformatics",
    "cancer": "Cancer",
    "rare disease": "Rare Disease",
    "long read sequencing": "Long Read Sequencing",
    "transcriptomics": "Transcriptomics",
    "secondary data - phe ncras": "NCRAS",
    "research community provided dat": "Research Community provided data",
    "research community provided data": "Research Community provided data",
    "secondary data - nhsd": "Secondary Data NHSE",
    "secondary data - mhsds": "Mental Health",
    "cancer specific datasets -pilot": "Cancer Specific Curated Datasets - Pilot",
    "cancer specific datasets - pilot": "Cancer Specific Curated Datasets - Pilot",
}

CATEGORY_ORDER = [
    "Quick View", "Common", "Bioinformatics", "Long Read Sequencing", "Transcriptomics",
    "Cancer", "Rare Disease", "Secondary Data NHSE", "NCRAS", "Mental Health",
    "Cancer Specific Curated Datasets - Pilot", "Research Community provided data",
]

TYPE_MAP = {
    "string": "String", "enum": "Enum", "integer": "Integer", "date": "Date",
    "datetime": "DateTime", "time": "Time", "decimal": "Decimal", "double": "Double",
    "float": "Double", "boolean": "Boolean", "clinical code": "Clinical code",
    "guid": "String", "none": "String", "": "String",
}

TABLE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_ ]*$")
FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_ ]*$")


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s if s else None


def norm_name(name):
    return re.sub(r"\s+", "_", name.strip())


def category_for(sheet_title, table_name):
    cat = CATEGORY_MAP.get(sheet_title.strip().lower())
    if cat == "Secondary Data NHSE" and re.match(r"^(mhmd|mhldds)_", table_name):
        return "Mental Health"
    return cat


def parse_workbook(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    tables = {}   # name -> table dict
    order = []
    for ws in wb.worksheets:
        rows = ws.iter_rows(values_only=True)
        try:
            header = next(rows)
        except StopIteration:
            continue
        if not header or clean(header[0]) != "Table":
            continue
        current_field = None
        for raw in rows:
            row = list(raw) + [None] * 8
            t, f, short, _desc, dtype, value, vdesc = (clean(c) for c in row[:7])
            if t and f:
                if not TABLE_RE.match(t) or not FIELD_RE.match(f):
                    current_field = None
                    continue
                tname = norm_name(t)
                cat = category_for(ws.title, tname)
                if cat is None:
                    current_field = None
                    continue
                tbl = tables.get(tname)
                if tbl is None:
                    tbl = {"name": tname, "category": cat, "columns": [], "_seen": set()}
                    tables[tname] = tbl
                    order.append(tname)
                elif tbl["category"] != cat:
                    also = tbl.setdefault("alsoIn", [])
                    if cat not in also:
                        also.append(cat)
                fname = norm_name(f)
                if fname.lower() in tbl["_seen"]:
                    current_field = next(c for c in tbl["columns"] if c["name"].lower() == fname.lower())
                else:
                    col = {
                        "name": fname,
                        "label": short or fname.replace("_", " ").title(),
                        "type": TYPE_MAP.get((dtype or "").lower(), "String"),
                    }
                    tbl["columns"].append(col)
                    tbl["_seen"].add(fname.lower())
                    current_field = col
                if value is not None and current_field is not None:
                    add_value(current_field, value, vdesc)
            elif not t and not f and value is not None and current_field is not None:
                add_value(current_field, value, vdesc)
            elif t and not f:
                current_field = None
    out = []
    for name in order:
        tbl = tables[name]
        tbl.pop("_seen", None)
        if len(tbl["columns"]) < 2:
            continue  # lookup fragments, not real tables
        out.append(tbl)
    return out


def add_value(col, value, vdesc):
    if col["type"] not in ("Enum", "Boolean", "Clinical code"):
        # Values column is sometimes used for format hints on non-enum fields.
        col.setdefault("hint", value)
        return
    vals = col.setdefault("values", [])
    if len(vals) < 2000 and not any(v[0] == value for v in vals):
        vals.append([value, vdesc] if vdesc and vdesc != value else [value])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--project", required=True, help="LabKey project folder, e.g. main-programme")
    ap.add_argument("--folder", required=True, help="release sub-folder, e.g. main-programme_v19_2024-10-31")
    ap.add_argument("--label", required=True, help="human readable release label")
    ap.add_argument("--source-url", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tables = parse_workbook(args.xlsx)
    cats = [c for c in CATEGORY_ORDER if any(t["category"] == c for t in tables)]
    m = re.search(r"(\d{4}-\d{2}-\d{2})$", args.folder)
    doc = {
        "generatedBy": "tools/build_labkey_schema.py",
        "generatedAt": _dt.date.today().isoformat(),
        "source": {
            "file": args.xlsx.split("/")[-1],
            "url": args.source_url,
            "note": "Structure only (tables, columns, captions, types, coded values). "
                    "See the official data dictionary for field definitions.",
        },
        "project": args.project,
        "folder": args.folder,
        "folderPath": f"/{args.project}/{args.folder}",
        "label": args.label,
        "releaseDate": m.group(1) if m else None,
        "schema": "lists",
        "categories": cats,
        "tables": sorted(tables, key=lambda t: (cats.index(t["category"]), t["name"].lower())),
    }
    with open(args.out, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
    ncols = sum(len(t["columns"]) for t in tables)
    print(f"{args.out}: {len(tables)} tables, {ncols} columns, categories: {', '.join(cats)}")


if __name__ == "__main__":
    main()
