#!/usr/bin/env python3
"""Concilia as duas exportações do SGM no computador que consegue lê-las."""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HOME_SPOOL = Path(r"K:\Onedrive\OneDrive - Energisa\Documentos\1 - BASES PARA BI\wqc_spool")
OFFICIAL = "https://mapeamento-arvores.pages.dev/api/vera/progress/sync"
TOKEN_ENV = "VERA_PROGRESS_SYNC_TOKEN"


def normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(c for c in value.upper() if not unicodedata.combining(c))


def column(value):
    return re.sub("[^A-Z0-9]", "", normalize(value))


def clean(value, length=100):
    return str(value or "").strip()[:length]


def gis_id(value):
    return re.fullmatch(r"(?:\d+-)?(\d{1,20})(?:\.0+)?", clean(value))


def day(value, excel=False):
    value = clean(value)
    try:
        if excel and re.fullmatch(r"\d{5}(?:\.\d+)?", value):
            return (date(1899, 12, 30) + timedelta(days=int(float(value)))).isoformat()
        if re.match(r"^\d{4}-\d{2}-\d{2}(?:$|[T ])", value):
            return date.fromisoformat(value[:10]).isoformat()
        if match := re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|[T ])", value):
            d, m, y = map(int, match.groups())
            return date(y, m, d).isoformat()
    except ValueError:
        pass
    return ""


def preferred(*values):
    return next((clean(value) for value in values if clean(value)), "")


def order_record(fields, executed_file=False):
    get = lambda *names: preferred(*(fields.get(column(name)) for name in names))
    order_id = get("OS_INT_PRIMARIA", "ID_OS_PRIMARIA", "OS_INTERNA")
    number = get("NUM_OS_PRIMARIA", "NUMERO_OS_PRIMARIA", "NUM_OS")
    id_match = gis_id(order_id)
    scheme = " ".join(fields.get(column(name), "") for name in ("DESC_ESQUEMA", "ESQUEMA_SERVICO", "DESCRICAO_ESQUEMA"))
    note = " ".join(fields.get(column(name), "") for name in ("OBSERVACAO", "OBSERVACAO_OS", "OBS_OS"))
    code = get("COD_ESQUEMA")
    status = normalize(get("STATUS_GERAL_OS", "STATUS_OS", "STATUS"))
    finished = day(get("DATA_TERMINO", "DATA_DE_TERMINO", "DATA_EXECUCAO"))
    if status.startswith("CANCEL"):
        state = "cancelada"
    elif finished and (executed_file or status == "EXECUTADA" or status == "CONCLUIDA"):
        state = "executada"
    else:
        state = "pendente"
    scope = normalize(scheme + " " + note)
    return {
        "id": (id_match[1] if id_match else order_id) or normalize(number),
        "number": number, "feeder": normalize(get("ALIMENTADOR")),
        "block": normalize(get("NUM_OPERATIVO", "NAME_BLOCO", "CHAVE")),
        "team": get("EQUIPE_EXEC", "EQUIPE_EXECUTORA", "EQUIPE_PROGRAMADA"),
        "inspector": get("INSPETOR", "NOME_INSPETOR"),
        "status": state, "day": finished if state == "executada" else "",
        "_vera": "VERA" in scope,
        "_inspection": normalize(code) == "RD-INSP-016" or bool(
            re.search(r"\b(?:INSP\w*|VISTORI\w*|LEVANTAMENT\w*|MAPEAMENT\w*)\b", scope)
        ),
        "_gis": get("ID_GIS", "ID_VAO"),
    }


def order_priority(order):
    return ({"executada": 2, "cancelada": 1, "pendente": 0}[order["status"]], order["day"])


def reconciled_orders(rows):
    grouped = defaultdict(list)
    number_ids = defaultdict(set)
    for row in rows:
        if row["number"] and row["id"] != normalize(row["number"]):
            number_ids[normalize(row["number"])].add(row["id"])
    for row in rows:
        ids = number_ids[normalize(row["number"])]
        order_id = next(iter(ids)) if row["id"] == normalize(row["number"]) and len(ids) == 1 else row["id"]
        if order_id:
            grouped[order_id].append(row)
    result = []
    for order_id, related in grouped.items():
        if not any(row["_vera"] for row in related):
            continue
        chosen = dict(max(related, key=order_priority), id=order_id)
        for name in ("block", "feeder", "_gis", "team", "inspector", "number"):
            if not chosen[name]:
                known = {row[name] for row in related if row[name]}
                if len(known) == 1:
                    chosen[name] = known.pop()
        chosen["_inspection"] = any(row["_inspection"] for row in related)
        result.append(chosen)
    return sorted(result, key=lambda order: order["id"])


def coverage_row(span, when, order=""):
    span_id, metres, feeder, block, section, zone = span
    return [when, span_id, metres, feeder, block, section, zone, order]


def link_orders(spans, orders):
    keys = defaultdict(list)
    by_id = {}
    for span in spans:
        span_id, _, feeder, block, _, _ = span
        by_id[span_id] = span
        if block:
            keys[(feeder, block)].append(span)
    feeders_by_key = defaultdict(set)
    for feeder, block in keys:
        feeders_by_key[block].add(feeder)
    coverage = []
    public = []
    for order in orders:
        block, feeder = order["block"], order["feeder"]
        direct_id = gis_id(order["_gis"])
        direct = by_id.get(direct_id[1]) if direct_id else None
        if direct and (not feeder or direct[2] == feeder):
            links, reason = [direct], "Vão"
        elif block and feeder and (feeder, block) in keys:
            links, reason = keys[(feeder, block)], "Chave"
        elif block and not feeder and len(feeders_by_key[block]) == 1:
            feeder = next(iter(feeders_by_key[block]))
            links, reason = keys[(feeder, block)], "Chave"
        else:
            links, reason = [], "Sem vínculo inequívoco"
        if not order["_inspection"]:
            links, reason = [], "Sem serviço de inspeção identificado"
        if order["status"] == "executada":
            coverage.extend(coverage_row(span, order["day"], order["id"]) for span in links)
        public.append({**{k: v for k, v in order.items() if not k.startswith("_")}, "feeder": feeder, "link": reason})
    return coverage, public


def read_export(path, executed_file):
    before = path.stat()
    raw = path.read_bytes()
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or not raw:
        raise ValueError(f"{path.name} está vazio ou em atualização.")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16")
    else:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1252")
    from io import StringIO
    header = text.splitlines()[0]
    required = {"OSINTPRIMARIA", "IDOSPRIMARIA", "NUMOSPRIMARIA", "NUMEROOSPRIMARIA"}
    delimiter = next((sep for sep in ("\t", ";", "|", ",") if
                      required.intersection(column(c) for c in next(csv.reader([header], delimiter=sep)))), None)
    if delimiter is None:
        raise ValueError(f"{path.name}: cabeçalho sem identificador da OS primária.")
    csv.field_size_limit(1_000_000)
    reader = csv.reader(StringIO(text, newline=""), delimiter=delimiter)
    columns = [column(c) for c in next(reader)]
    if not set(columns).intersection({"DESCESQUEMA", "ESQUEMASERVICO", "DESCRICAOESQUEMA", "OBSERVACAO", "OBSERVACAOOS", "OBSOS"}):
        raise ValueError(f"{path.name}: cabeçalho sem esquema de serviço ou observação.")
    if executed_file and not set(columns).intersection({"DATATERMINO", "DATADETERMINO", "DATAEXECUCAO"}):
        raise ValueError(f"{path.name}: cabeçalho sem DATA_TERMINO.")
    rows = []
    for values in reader:
        if not any(values):
            continue
        if len(values) != len(columns):
            raise ValueError(f"{path.name}: número de campos inválido perto da linha {reader.line_num}.")
        row = order_record(dict(zip(columns, values)), executed_file)
        if row["id"]:
            rows.append(row)
    return rows, {"name": path.name, "modified": datetime.fromtimestamp(after.st_mtime, timezone.utc).isoformat(timespec="seconds")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogo", type=Path, required=True)
    parser.add_argument("--executadas", type=Path, default=HOME_SPOOL / "SGM OS EXEC.txt")
    parser.add_argument("--pendentes", type=Path, default=HOME_SPOOL / "SGM OS.txt")
    parser.add_argument("--saida", type=Path, help="Gera JSON para conferência local.")
    parser.add_argument("--enviar", action="store_true", help="Atualiza o snapshot no painel.")
    args = parser.parse_args()
    if not (args.saida or args.enviar):
        parser.error("Use --saida, --enviar ou ambos.")
    try:
        if args.executadas.resolve() == args.pendentes.resolve():
            raise ValueError("Informe os dois arquivos distintos do SGM.")
        catalog = args.catalogo.read_bytes()
        spans = json.loads(catalog)
        done, done_file = read_export(args.executadas, True)
        pending, pending_file = read_export(args.pendentes, False)
        coverage, orders = link_orders(spans, reconciled_orders([*done, *pending]))
        payload = {
            "version": 1, "files": [done_file, pending_file], "coverage": coverage,
            "orders": orders, "catalog": hashlib.sha256(catalog).hexdigest(),
        }
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        if args.saida:
            args.saida.write_bytes(body)
        if args.enviar:
            token = os.environ.get(TOKEN_ENV, "")
            if len(token) < 32:
                raise ValueError(f"Defina {TOKEN_ENV} para enviar o snapshot.")
            req = Request(OFFICIAL, data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
            with urlopen(req, timeout=90) as response:
                confirmation = json.load(response)
            print("Envio SGM confirmado. Última gravação:", confirmation.get("updatedAt"))
        print(f"{len(orders)} OS VERA, {len(coverage)} vínculos de vão executados.")
    except HTTPError as error:
        print(f"Envio não confirmado (HTTP {error.code}): {error.read(500).decode(errors='replace')}", file=sys.stderr)
        return 1
    except (ValueError, OSError, csv.Error) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
