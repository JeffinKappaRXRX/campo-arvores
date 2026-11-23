#!/usr/bin/env python3
"""Make a private WGS84 pole lookup from the operational GeoPackage."""
import argparse
from contextlib import closing
import hashlib
import json
import math
from pathlib import Path
import sqlite3

from pyproj import CRS, Transformer
from shapely import from_wkb

import importlib.util
spec = importlib.util.spec_from_file_location("gpkg", Path(__file__).with_name("import-conjuntos.py"))
gpkg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpkg)


def normalize_id(value):
    return str(value or "").strip().removeprefix("226-")


def build(source, requested):
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro&immutable=1", uri=True)) as db:
        layer = db.execute("""SELECT column_name,geometry_type_name,srs_id
            FROM gpkg_geometry_columns WHERE table_name='13_Postes'""").fetchone()
        definition = db.execute("SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id=31979").fetchone()
        if layer != ("geom", "POINT", 31979) or not definition or not CRS.from_wkt(definition[0]).equals(CRS(31979)):
            raise ValueError("Expected 13_Postes point layer in SIRGAS 2000 / UTM 19S")
        transform = Transformer.from_crs(31979, 4326, always_xy=True)
        groups, invalid, seen = {}, set(), 0
        digest = hashlib.sha256()
        for key, geometry in db.execute('SELECT "Id", geom FROM "13_Postes" ORDER BY fid'):
            seen += 1
            key = normalize_id(key)
            if key not in requested:
                continue
            try:
                srid, wkb = gpkg.parse_geometry(geometry)
                point = from_wkb(wkb)
                if srid != 31979 or point.geom_type != "Point" or point.is_empty:
                    raise ValueError("Unexpected point geometry")
                lon, lat = transform.transform(point.x, point.y, errcheck=True)
                if not all(math.isfinite(v) for v in (lat, lon)):
                    raise ValueError("Invalid coordinate")
            except (TypeError, ValueError, RuntimeError):
                invalid.add(key)
                continue
            digest.update(key.encode() + b"\0" + wkb)
            groups.setdefault(key, set()).add((round(lat, 7), round(lon, 7)))
    ambiguous = set()
    rows = []
    for key, points in sorted(groups.items()):
        if len(points) != 1 or key in invalid:
            ambiguous.add(key)
            continue
        lat, lon = next(iter(points))
        rows.append([key, lat, lon])
    return {
        "schema": "sigora-postes-1",
        "source": {"file": source.name, "layer": "13_Postes", "crs": "EPSG:31979", "selectedGeometrySha256": digest.hexdigest()},
        "crs": "EPSG:4326",
        "rows": rows,
        "ambiguous": sorted(ambiguous | invalid),
        "counts": {"sourceRows": seen, "requestedIds": len(requested), "confirmedIds": len(rows),
                   "ambiguousIds": len(ambiguous | invalid), "missingIds": len(requested - groups.keys() - invalid)},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--ids", type=Path, required=True, help="JSON array of exact pole IDs")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(strict=True), args.output.resolve()
    if output.is_relative_to(Path(__file__).resolve().parents[1]) or output in (source, args.ids.resolve()):
        parser.error("Write the private lookup outside the source repository and inputs")
    ids = {normalize_id(value) for value in json.loads(args.ids.read_text(encoding="utf-8"))}
    result = build(source, ids - {""})
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(result["counts"]))


if __name__ == "__main__":
    main()
