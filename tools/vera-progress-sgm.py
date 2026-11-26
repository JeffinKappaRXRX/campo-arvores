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
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import BadZipFile

OFFICIAL = "https://mapeamento-arvores.pages.dev/api/vera/progress/sync"
TOKEN_ENV = "VERA_PROGRESS_SYNC_TOKEN"


def normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(c for c in value.upper() if not unicodedata.combining(c))


def column(value):
    return re.sub("[^A-Z0-9]", "", normalize(value))


def source_path(path):
    if path.exists():
        return path
    parent = source_path(path.parent) if path.parent != path else path
    if parent == path:
        raise FileNotFoundError(f"Pasta ou arquivo indisponível: {path}")
    matches = [child for child in parent.iterdir() if column(child.name) == column(path.name)]
    if len(matches) != 1:
        raise FileNotFoundError(f"Origem sem correspondência única: {path}")
    return matches[0]


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


def text_export(raw):
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def read_export(path, executed_file):
    before = path.stat()
    raw = path.read_bytes()
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or not raw:
        raise ValueError(f"{path.name} está vazio ou em atualização.")
    text = text_export(raw)
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


DEC_IDS = {"IDOCORRENCIA", "NUMOCORRENCIA", "NUMEROOCORRENCIA", "CODOCORRENCIA",
           "NUMINTERRUPCAO", "IDINTERRUPCAO", "NUMEROINTERRUPCAO"}
DEC_DATES = {"DATAINICIO", "DATAHORAINICIO", "DATAINICIOINTERRUPCAO", "DATAHORAINICIOINTERRUPCAO",
             "DATAOCORRENCIA", "DATADAOCORRENCIA", "DATAHORAINICIOOCORRENCIA", "DATAINICIOOCORRENCIA"}
DEC_FEEDERS = {"ALIMENTADOR", "CODALIMENTADOR", "NOMEALIMENTADOR", "ALIMENTADORORIGEM"}


def dec_files(root, pattern, current_year):
    selected = []
    for folder in sorted(root.iterdir()):
        if not folder.is_dir() or not re.fullmatch(r"20\d{2}", folder.name) or int(folder.name) > current_year:
            continue
        for path in sorted(folder.glob(pattern)):
            if path.is_file() and not path.name.startswith("~$") and path.suffix.lower() in {".txt", ".csv", ".xlsx", ".xlsm"}:
                selected.append(path)
    if not selected:
        raise ValueError("DEC/FEC: nenhum arquivo de ocorrência encontrado nas pastas anuais.")
    return selected


def dec_table(path, sheet, id_column):
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        try:
            from openpyxl import load_workbook
        except ImportError as error:
            raise ValueError("Instale openpyxl para ler a fonte Excel do DEC/FEC.") from error
        book = load_workbook(path, read_only=True, data_only=True)
        try:
            if not sheet and len(book.sheetnames) != 1:
                raise ValueError(f"{path.name}: informe a aba de ocorrências com --dec-aba.")
            if sheet and sheet not in book.sheetnames:
                raise ValueError(f"{path.name}: aba de ocorrências {sheet} ausente.")
            yield from book[sheet or book.sheetnames[0]].values
        finally:
            book.close()
        return
    text = text_export(path.read_bytes())
    if not text.strip():
        raise ValueError(f"{path.name}: fonte DEC/FEC vazia.")
    first = text.splitlines()[0]
    delimiter = next((sep for sep in ("\t", ";", "|", ",") if id_column.intersection(
        column(c) for c in next(csv.reader([first], delimiter=sep)))), None)
    if not delimiter:
        raise ValueError(f"{path.name}: cabeçalho DEC/FEC sem identificador de ocorrência reconhecido.")
    yield from csv.reader(StringIO(text, newline=""), delimiter=delimiter)


def occurrences(source, pattern, sheet, identity="", start="", feeder="", current_year=None):
    current_year = current_year or datetime.now(timezone(timedelta(hours=-5))).year
    aliases = [(column(name), defaults) for name, defaults in
               [(identity, DEC_IDS), (start, DEC_DATES), (feeder, DEC_FEEDERS)]]
    found, files = {}, []
    for path in dec_files(source, pattern, current_year):
        before = path.stat()
        table = dec_table(path, sheet, {aliases[0][0]} if aliases[0][0] else DEC_IDS)
        try:
            columns = [column(c) for c in next(table, [])]
            selected = [[i for i, name in enumerate(columns) if name in ({exact} if exact else choices)]
                        for exact, choices in aliases]
            if any(len(i) != 1 for i in selected):
                raise ValueError(f"{path.name}: confirme as colunas de ID, início e alimentador do DEC/FEC.")
            id_col, day_col, feeder_col = (i[0] for i in selected)
            for line_no, row in enumerate(table, 2):
                if not any(value not in (None, "") for value in row):
                    continue
                if len(row) <= max(id_col, day_col, feeder_col):
                    raise ValueError(f"{path.name}: linha incompleta ({line_no}).")
                identifier, when, network = clean(row[id_col]), day(row[day_col], excel=True), normalize(clean(row[feeder_col]))
                if not identifier or not when:
                    raise ValueError(f"{path.name}: ID ou início inválido na linha {line_no}.")
                identifier = re.sub(r"^(\d+)\.0+$", r"\1", identifier)
                key = (when[:4], identifier)
                first, feeders = found.setdefault(key, (when, set()))
                if network:
                    feeders.add(network)
                found[key] = (min(first, when), feeders)
        finally:
            table.close()
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError(f"{path.name} está em atualização.")
        files.append({"name": path.relative_to(source).as_posix(), "modified":
                      datetime.fromtimestamp(after.st_mtime, timezone.utc).isoformat(timespec="seconds")})
    counts = Counter()
    for when, feeders in found.values():
        counts[when, ""] += 1
        for network in feeders:
            counts[when, network] += 1
    if not counts or not any(when.startswith(str(current_year)) for when, _ in counts):
        raise ValueError(f"DEC/FEC: nenhuma ocorrência identificada em {current_year}.")
    return {"version": 1, "files": files, "lastDay": max(when for when, _ in counts),
            "counts": [[when, network, count] for (when, network), count in sorted(counts.items())]}


def save_snapshot(payload, filename, send, label, dataset=""):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if filename:
        filename.write_bytes(body)
    if send:
        token = os.environ.get(TOKEN_ENV, "")
        if len(token) < 32:
            raise ValueError(f"Defina {TOKEN_ENV} para enviar o snapshot.")
        req = Request(OFFICIAL + ("?dataset=" + dataset if dataset else ""), data=body,
                      headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
        with urlopen(req, timeout=90) as response:
            confirmation = json.load(response)
        print(f"Envio {label} confirmado. Última gravação:", confirmation.get("updatedAt"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogo", type=Path, required=True)
    parser.add_argument("--sgm-dir", type=Path, default=os.getenv("ARBORA_SGM_DIR"), help="Pasta corporativa de Atualizações Diárias.")
    parser.add_argument("--executadas", type=Path)
    parser.add_argument("--pendentes", type=Path)
    parser.add_argument("--dec-fec", type=Path, default=os.getenv("ARBORA_DEC_FEC_DIR"), help="Pasta bd_DEC_FEC com subpastas anuais.")
    parser.add_argument("--dec-padrao", default="*", help="Padrão do arquivo anual de ocorrências.")
    parser.add_argument("--dec-aba", default="")
    parser.add_argument("--dec-id", default="")
    parser.add_argument("--dec-inicio", default="")
    parser.add_argument("--dec-alimentador", default="")
    parser.add_argument("--saida-dec", type=Path, help="Gera a contagem do DEC/FEC para conferência local.")
    parser.add_argument("--saida", type=Path, help="Gera JSON para conferência local.")
    parser.add_argument("--enviar", action="store_true", help="Atualiza o snapshot no painel.")
    args = parser.parse_args()
    if not (args.saida or args.enviar or args.saida_dec):
        parser.error("Use --saida, --saida-dec ou --enviar.")
    if args.saida_dec and not args.dec_fec:
        parser.error("Use --dec-fec junto com --saida-dec.")
    if not args.sgm_dir and not (args.executadas and args.pendentes):
        parser.error("Informe --sgm-dir ou os dois arquivos do SGM.")
    failed = False
    try:
        executed = source_path(args.executadas or args.sgm_dir / "SGM OS EXEC.txt")
        pending_path = source_path(args.pendentes or args.sgm_dir / "SGM OS.txt")
        if executed.resolve() == pending_path.resolve():
            raise ValueError("Informe os dois arquivos distintos do SGM.")
        catalog = args.catalogo.read_bytes()
        spans = json.loads(catalog)
        done, done_file = read_export(executed, True)
        pending, pending_file = read_export(pending_path, False)
        coverage, orders = link_orders(spans, reconciled_orders([*done, *pending]))
        payload = {
            "version": 1, "files": [done_file, pending_file], "coverage": coverage,
            "orders": orders, "catalog": hashlib.sha256(catalog).hexdigest(),
        }
        save_snapshot(payload, args.saida, args.enviar, "SGM")
        print(f"{len(orders)} OS VERA, {len(coverage)} vínculos de vão executados.")
    except HTTPError as error:
        print(f"Envio não confirmado (HTTP {error.code}): {error.read(500).decode(errors='replace')}", file=sys.stderr)
        failed = True
    except (ValueError, OSError, csv.Error) as error:
        print(error, file=sys.stderr)
        failed = True
    if args.dec_fec:
        try:
            snapshot = occurrences(source_path(args.dec_fec), args.dec_padrao, args.dec_aba,
                                   args.dec_id, args.dec_inicio, args.dec_alimentador)
            save_snapshot(snapshot, args.saida_dec, args.enviar, "DEC/FEC", "dec-fec")
            print(f"DEC/FEC até {snapshot['lastDay']}. {len(snapshot['files'])} arquivo(s) anual(is).")
        except HTTPError as error:
            print(f"DEC/FEC: envio não confirmado (HTTP {error.code}).", file=sys.stderr)
            failed = True
        except (ValueError, OSError, csv.Error, BadZipFile) as error:
            print(f"DEC/FEC: {error}", file=sys.stderr)
            failed = True
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
