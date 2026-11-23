#!/usr/bin/env python3
"""Convert the official conjuntos GeoPackage to private, auditable WGS84 GeoJSON.

Install tools/requirements-conjuntos.txt in an isolated environment. Example:
  python tools/import-conjuntos.py INPUT.gpkg --output PRIVATE/conjuntos.geojson

The source is opened read-only. No source geometry is repaired, simplified,
rounded, or silently skipped. Outputs belong outside public assets/repositories.
"""

import argparse
from contextlib import closing
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import struct

import pyproj
import shapely
from shapely.geometry import mapping
from shapely.validation import explain_validity


LAYER = "22_conjunto_eletrico"
SOURCE_CRS = 31979
TARGET_CRS = 4326
FIELDS = {"code": "Código", "name": "Nome", "id": "Id", "fid": "fid"}


def parse_geometry(blob):
    """Read standard GeoPackageBinary header and return (SRID, WKB bytes)."""
    if not isinstance(blob, bytes) or len(blob) < 8 or blob[:2] != b"GP":
        raise ValueError("Invalid GeoPackage geometry header")
    if blob[2] != 0:
        raise ValueError("Unsupported GeoPackage geometry version")
    flags = blob[3]
    if flags & 0xE0:
        raise ValueError("Extended/reserved GeoPackage geometry flags are unsupported")
    if flags & 0x10:
        raise ValueError("Empty GeoPackage geometry")
    envelope = (flags >> 1) & 7
    envelope_size = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}.get(envelope)
    if envelope_size is None:
        raise ValueError("Invalid GeoPackage envelope indicator")
    endian = "<" if flags & 1 else ">"
    srid = struct.unpack(endian + "i", blob[4:8])[0]
    offset = 8 + 8 * envelope_size
    if len(blob) < offset + 5:
        raise ValueError("Truncated GeoPackage geometry")
    if envelope_size:
        values = struct.unpack(endian + "d" * envelope_size, blob[8:offset])
        if not all(math.isfinite(value) for value in values):
            raise ValueError("Nonfinite GeoPackage geometry envelope")
    return srid, blob[offset:]


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def convert(source):
    source = Path(source).resolve(strict=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    transformer = pyproj.Transformer.from_crs(SOURCE_CRS, TARGET_CRS, always_xy=True)
    inverse = pyproj.Transformer.from_crs(TARGET_CRS, SOURCE_CRS, always_xy=True)
    features, geometries, geometry_audit = [], [], []
    codes, names = set(), set()
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        contents = connection.execute(
            "SELECT * FROM gpkg_contents WHERE table_name=?", (LAYER,)
        ).fetchone()
        column = connection.execute(
            "SELECT * FROM gpkg_geometry_columns WHERE table_name=?", (LAYER,)
        ).fetchone()
        if not contents or not column or contents["data_type"] != "features":
            raise ValueError("Expected conjuntos feature layer is absent")
        if contents["srs_id"] != SOURCE_CRS or column["srs_id"] != SOURCE_CRS:
            raise ValueError("Conjuntos must declare EPSG:31979 in both metadata tables")
        crs = connection.execute(
            "SELECT * FROM gpkg_spatial_ref_sys WHERE srs_id=?", (SOURCE_CRS,)
        ).fetchone()
        if (not crs or crs["organization"].upper() != "EPSG"
                or crs["organization_coordsys_id"] != SOURCE_CRS
                or not pyproj.CRS.from_wkt(crs["definition"]).equals(pyproj.CRS(SOURCE_CRS))):
            raise ValueError("Source CRS definition disagrees with EPSG:31979")
        if column["geometry_type_name"].upper() not in ("POLYGON", "MULTIPOLYGON"):
            raise ValueError("Conjuntos layer must contain polygons")
        if column["z"] or column["m"]:
            raise ValueError("Only 2D conjuntos geometry is supported")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(" + quote_identifier(LAYER) + ")")}
        if not set(FIELDS.values()).issubset(columns):
            raise ValueError("Required official code/name/identity fields are absent")
        for row in connection.execute("SELECT * FROM " + quote_identifier(LAYER) + " ORDER BY fid"):
            code, name = row[FIELDS["code"]], row[FIELDS["name"]]
            if code is None or not str(code).strip() or not isinstance(name, str) or not name.strip():
                raise ValueError("Conjunto has an empty official code or name")
            code, name = str(code).strip(), name.strip()
            if code in codes or name in names:
                raise ValueError("Duplicate official conjunto code or name")
            codes.add(code)
            names.add(name)
            srid, wkb = parse_geometry(row[column["column_name"]])
            if srid != SOURCE_CRS:
                raise ValueError("Geometry SRID disagrees with source metadata")
            geometry = shapely.from_wkb(wkb)
            if geometry.geom_type not in ("Polygon", "MultiPolygon") or geometry.is_empty:
                raise ValueError("Empty or non-polygon conjunto: " + code)
            if not geometry.is_valid:
                raise ValueError("Invalid conjunto " + code + ": " + explain_validity(geometry))
            projected = shapely.transform(geometry, transformer.transform, interleaved=False)
            if projected.is_empty or not projected.is_valid:
                raise ValueError("Transformation produced invalid geometry: " + code)
            coords = shapely.get_coordinates(projected)
            if not all(math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90 for x, y in coords):
                raise ValueError("Transformation produced invalid WGS84 coordinates: " + code)
            source_coords = shapely.get_coordinates(geometry)
            xs, ys = inverse.transform(coords[:, 0], coords[:, 1], errcheck=True)
            error = max(math.hypot(x - old[0], y - old[1]) for x, y, old in zip(xs, ys, source_coords))
            if error > 0.01:
                raise ValueError("Coordinate round-trip error exceeds 1 cm: " + code)
            features.append({
                "type": "Feature", "id": code, "bbox": list(projected.bounds),
                "properties": {"codigo": code, "nome": name, "id": row[FIELDS["id"]], "fid": row[FIELDS["fid"]]},
                "geometry": mapping(projected),
            })
            geometries.append((code, geometry))
            parts = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
            geometry_audit.append({
                "codigo": code, "nome": name, "valid": True,
                "parts": len(parts), "holes": sum(len(part.interiors) for part in parts),
                "vertices": len(coords), "areaSourceM2": geometry.area,
                "bboxWgs84": list(projected.bounds), "roundTripMaxErrorM": error,
                "sampleInteriorWgs84": list(projected.representative_point().coords)[0],
            })
        if not features:
            raise ValueError("Conjuntos source is empty")
        source_metadata = {
            "fileName": source.name, "sha256": digest, "layer": LAYER,
            "crs": "EPSG:" + str(SOURCE_CRS), "fields": FIELDS,
            "lastChange": contents["last_change"],
        }
    overlaps = []
    for index, (left_code, left) in enumerate(geometries):
        for right_code, right in geometries[index + 1:]:
            if left.intersects(right):
                area = left.intersection(right).area
                if area > 0:
                    overlaps.append({"codes": [left_code, right_code], "areaM2": area})
    collection = {
        "type": "FeatureCollection", "source": source_metadata,
        "targetCRS": "EPSG:" + str(TARGET_CRS), "coordinateOrder": "longitude,latitude",
        "features": features,
    }
    audit = {
        "source": source_metadata, "targetCRS": collection["targetCRS"],
        "coordinateOrder": collection["coordinateOrder"],
        "featureCount": len(features), "vertexCount": sum(row["vertices"] for row in geometry_audit),
        "geometryRepair": False, "simplification": False, "coordinateRounding": False,
        "transform": {"description": transformer.description, "accuracyM": transformer.accuracy,
                      "alwaysXY": True, "pyprojVersion": pyproj.__version__, "shapelyVersion": shapely.__version__},
        "positiveAreaOverlaps": overlaps, "features": geometry_audit,
    }
    return collection, audit


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit", type=Path, help="Defaults to OUTPUT.audit.json")
    args = parser.parse_args()
    output = args.output.resolve()
    audit_path = (args.audit or output.with_suffix(".audit.json")).resolve()
    repo = Path(__file__).resolve().parents[1]
    if output.is_relative_to(repo) or audit_path.is_relative_to(repo):
        parser.error("Write private territorial data outside the source repository")
    if output == audit_path or args.source.resolve() in (output, audit_path):
        parser.error("Source, GeoJSON and audit paths must be distinct")
    collection, audit = convert(args.source)
    write_json(output, collection)
    audit["outputSha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
    write_json(audit_path, audit)
    print(json.dumps({"features": audit["featureCount"], "vertices": audit["vertexCount"],
                      "sourceSha256": audit["source"]["sha256"], "output": str(output), "audit": str(audit_path)}))


if __name__ == "__main__":
    main()
