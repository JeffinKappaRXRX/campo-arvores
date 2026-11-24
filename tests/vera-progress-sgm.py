import csv
import runpy
import tempfile
from pathlib import Path

test = runpy.run_path(str(Path(__file__).parents[1] / "tools" / "vera-progress-sgm.py"))
headers = ["OS_INT_PRIMARIA", "NUM_OS_PRIMARIA", "ALIMENTADOR", "NUM_OPERATIVO", "STATUS_OS",
           "DESC_ESQUEMA", "OBSERVAÇÃO", "DATA_TÉRMINO", "EQUIPE_EXEC", "ID_GIS"]
done = [
    ["1", "OS0001", "AAL-01C9", "RBR444", "EXECUTADA", "Inspeção", "", "21/11/2026 18:43", "AFA-INRD01", "226-9999"],
    ["3", "OS0003", "AAL-01C9", "RBR444", "EXECUTADA", "Poda VERA", "", "22/11/2026", "", ""],
    ["4", "OS0004", "AAL-01C9", "RBR444", "EXECUTADA", "Vistoria VERA", "", "24/11/2026", "", "226-1002"],
    ["5", "OS0005", "TAN-01C5", "RBR444", "EXECUTADA", "Vistoria VERA", "", "24/11/2026", "", ""],
]
pending = [
    ["", "OS0001", "AAL-01C9", "RBR444", "DESPACHADA", "", "d"*300 + "\nProjeto VERA", "", "", ""],
    ["2", "OS0002", "AAL-01C9", "RBR444", "CRIADA", "Levantamento VERA", "", "", "", ""],
    ["6", "OS0006", "AAL-01C9", "RBR444", "CRIADA", "Inspeção regular", "", "", "", ""],
]
with tempfile.TemporaryDirectory() as tmp:
    a, b = (Path(tmp) / name for name in ("SGM OS EXEC.txt", "SGM OS.txt"))
    for path, rows in ((a, done), (b, pending)):
        with path.open("w", encoding="cp1252", newline="") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(headers)
            writer.writerows(rows)
    merged = test["reconciled_orders"]([*test["read_export"](a, True)[0], *test["read_export"](b, False)[0]])
    coverage, orders = test["link_orders"]([
        ["1001", 100, "AAL-01C9", "RBR444", "1", "URBANO"],
        ["1002", 200, "AAL-01C9", "RBR444", "1", "URBANO"],
    ], merged)
    assert [(o["id"], o["status"], o["day"], o["link"]) for o in orders] == [
        ("1", "executada", "2026-11-21", "Chave"), ("2", "pendente", "", "Chave"),
        ("3", "executada", "2026-11-22", "Sem serviço de inspeção identificado"),
        ("4", "executada", "2026-11-24", "Vão"),
        ("5", "executada", "2026-11-24", "Sem vínculo inequívoco"),
    ]
    assert [(r[7], r[1]) for r in coverage] == [("1", "1001"), ("1", "1002"), ("4", "1002")]
print("Leitura dos dois TXT, conciliação, DATA_TERMINO e vínculos SGM verificados.")
