#!/usr/bin/env python3
"""Extrai o histórico comprovado do Painel VERA e o catálogo de vãos para o SGM."""
import argparse
import json
import posixpath
import runpy
import sys
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

sgm = runpy.run_path(str(Path(__file__).with_name("vera-progress-sgm.py")))
day, normalize, coverage_row = (sgm[name] for name in ("day", "normalize", "coverage_row"))
SS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
COLUMNS = {
    "Vãos": "B E AB AG AH AN BU BV BY",
    "OS_VERA": "A B C D H X Y Z AA",
    "BASE ÁRVORES": "A Y Z AQ AR AS AU AV",
}


def elements(book, path, tag):
    with book.open(path) as stream:
        for _, el in etree.iterparse(stream, tag=SS + tag):
            yield el
            el.clear()
            while el.getprevious() is not None:
                del el.getparent()[0]


def read_book(path):
    with ZipFile(path) as book:
        workbook = etree.fromstring(book.read("xl/workbook.xml"))
        rels = etree.fromstring(book.read("xl/_rels/workbook.xml.rels"))
        by_id = {link.get("Id"): link.get("Target") for link in rels}
        names = {el.get("name"): by_id[el.get(REL)] for el in workbook.iter(SS + "sheet")}
        sheets = {}
        strings_needed = set()
        for name, columns in COLUMNS.items():
            wanted = set(columns.split())
            target = names[name]
            path = target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target)
            sheet = sheets[name] = []
            for el in elements(book, path, "row"):
                if el.get("r") == "1":
                    continue
                row = {}
                for cell in el:
                    col = cell.get("r", "").rstrip("0123456789")
                    if col not in wanted:
                        continue
                    value = cell.findtext(SS + "v")
                    if cell.get("t") == "s":
                        value = int(value)
                        strings_needed.add(value)
                    if value is not None and cell.get("t") != "e":
                        row[col] = value
                if row:
                    sheet.append(row)
        strings = {}
        for i, el in enumerate(elements(book, "xl/sharedStrings.xml", "si")):
            if i in strings_needed:
                strings[i] = "".join(t.text or "" for t in el.iter(SS + "t"))
                strings_needed.remove(i)
            if not strings_needed:
                break
        return {name: [{col: strings[value] if isinstance(value, int) else value
                        for col, value in row.items()} for row in sheet] for name, sheet in sheets.items()}


def extract(sheets):
    orders = []
    order_by_block = {}
    for row in sheets["OS_VERA"]:
        order_id = str(row.get("A", "")).removesuffix(".0")
        if not order_id:
            continue
        finish = day(row.get("X"), excel=True)
        status = "executada" if row.get("AA") == "EXECUTADA" and finish else "pendente"
        order = {
            "id": order_id, "number": row.get("B", "").strip(), "feeder": normalize(row.get("D")),
            "block": normalize(row.get("C")), "team": row.get("Y", ""), "inspector": row.get("Z", ""),
            "status": status, "day": finish if status == "executada" else "", "link": "OS_VERA da planilha",
        }
        orders.append(order)
        if status == "executada" and finish.startswith("2026-"):
            previous = order_by_block.get(order["block"])
            if not previous or finish > previous["day"]:
                order_by_block[order["block"]] = order

    spans = []
    coverage = []
    unknown_dates = []
    seen = set()
    for row in sheets["Vãos"]:
        span_id = row.get("B", "").removesuffix(".0")
        value = row.get("BY", "0") or "0"
        try:
            metres = round(float(value) * 1000, 5)
        except ValueError:
            continue
        if not span_id.isdecimal() or span_id in seen or not 0 < metres <= 50000:
            continue
        seen.add(span_id)
        span = [span_id, metres, normalize(row.get("E")), normalize(row.get("AH")),
                row.get("AG", "").removesuffix(".0"), normalize(row.get("AB"))]
        spans.append(span)
        if row.get("BU") == "Sim":
            finish = day(row.get("AN"), excel=True)
            if finish.startswith("2025-"):
                coverage.append(coverage_row(span, finish))
            else:
                unknown_dates.append(span_id)
        if row.get("BV") == "Sim":
            # O Painel VERA usa Name_Bloco e o maior DATA_TERMINO para o histórico publicado.
            order = order_by_block.get(span[3])
            if order:
                coverage.append(coverage_row(span, order["day"], order["id"]))
            else:
                unknown_dates.append(span_id)

    tree_counts = defaultdict(int)
    seen_trees = set()
    for row in sheets["BASE ÁRVORES"]:
        tree_id = row.get("A")
        if not tree_id or not row.get("Y") or tree_id in seen_trees:
            continue
        finish = day(row.get("AQ"), excel=True)
        if finish[:4] != row.get("AR") or not finish:
            continue
        seen_trees.add(tree_id)
        tree_counts[finish, normalize(row.get("Z")), row.get("AV", ""), normalize(row.get("AU"))] += 1
    trees = [[*group, count] for group, count in sorted(tree_counts.items())]
    return {"version": 1, "coverage": coverage, "trees": trees, "orders": orders}, spans, unknown_dates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--historico", type=Path, required=True)
    parser.add_argument("--catalogo", type=Path, required=True)
    args = parser.parse_args()
    try:
        history, spans, unknown = extract(read_book(args.workbook))
        if not spans or not history["coverage"] or not history["trees"] or unknown:
            raise ValueError(f"Histórico incompleto: {len(unknown)} registros de vão sem data comprovada.")
        for path, value in ((args.historico, history), (args.catalogo, spans)):
            path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        print(f"{len(spans)} vãos no catálogo, {len(history['coverage'])} vínculos históricos.")
    except (KeyError, ValueError, OSError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
