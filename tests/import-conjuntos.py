"""Synthetic GeoPackage conversion tests; no private territorial fixture."""
import importlib.util
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest

import pyproj
import shapely
from shapely.geometry import MultiPolygon, Polygon, shape

spec = importlib.util.spec_from_file_location("import_conjuntos", Path(__file__).resolve().parents[1] / "tools/import-conjuntos.py")
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def binary(geometry, srid=31979, envelope=1, little=True):
    endian = "<" if little else ">"
    flags = int(little) | envelope << 1
    sizes = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}
    values = [0.] * sizes[envelope]
    return b"GP\x00" + bytes([flags]) + struct.pack(endian + "i", srid) + struct.pack(endian + "d" * len(values), *values) + shapely.to_wkb(geometry)


def fixture(path, geometry, srid=31979):
    with closing(sqlite3.connect(path)) as db:
        db.executescript('''
          CREATE TABLE gpkg_contents (table_name TEXT, data_type TEXT, srs_id INTEGER, last_change TEXT);
          CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z INTEGER, m INTEGER);
          CREATE TABLE gpkg_spatial_ref_sys (srs_id INTEGER, organization TEXT, organization_coordsys_id INTEGER, definition TEXT);
          CREATE TABLE "22_conjunto_eletrico" (fid INTEGER PRIMARY KEY, geom BLOB, "Id" INTEGER, "Nome" TEXT, "Código" INTEGER, "Área" TEXT);
        ''')
        db.execute("INSERT INTO gpkg_contents VALUES (?,?,?,?)", (converter.LAYER, "features", srid, "2026-01-01T00:00:00Z"))
        db.execute("INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,?,?)", (converter.LAYER, "geom", "MULTIPOLYGON", srid, 0, 0))
        db.execute("INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?)", (srid, "EPSG", srid, pyproj.CRS(srid).to_wkt()))
        db.execute('INSERT INTO "22_conjunto_eletrico" VALUES (?,?,?,?,?,?)', (1, binary(geometry), 500, "CONJUNTO TESTE", 1234, "fixture"))
        db.commit()


class ImportTests(unittest.TestCase):
    def test_headers_endianness_envelopes_and_bad_input(self):
        triangle = Polygon([(0, 0), (10, 0), (0, 10), (0, 0)])
        for little in (False, True):
            for envelope in range(5):
                srid, wkb = converter.parse_geometry(binary(triangle, envelope=envelope, little=little))
                self.assertEqual(srid, 31979)
                self.assertTrue(shapely.from_wkb(wkb).equals_exact(triangle, 0))
        valid = binary(triangle)
        invalid = [b"", b"XX" + valid[2:], valid[:10], valid[:2] + b"\x01" + valid[3:], valid[:3] + b"\x0b" + valid[4:], valid[:3] + b"\x11" + valid[4:], valid[:3] + b"\x21" + valid[4:]]
        for blob in invalid:
            with self.assertRaises(ValueError):
                converter.parse_geometry(blob)

    def test_conversion_preserves_topology_metadata_and_axis_order(self):
        outer = [(500000, 10000000), (501000, 10000000), (501000, 9999000), (500000, 9999000), (500000, 10000000)]
        hole = [(500200, 9999800), (500800, 9999800), (500800, 9999200), (500200, 9999200), (500200, 9999800)]
        original = MultiPolygon([Polygon(outer, [hole])])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.gpkg"
            fixture(path, original)
            before = path.read_bytes()
            collection, audit = converter.convert(path)
            self.assertEqual(path.read_bytes(), before)
        feature = collection["features"][0]
        self.assertEqual(feature["properties"], {"codigo": "1234", "nome": "CONJUNTO TESTE", "id": 500, "fid": 1})
        self.assertEqual(feature["geometry"]["type"], "MultiPolygon")
        point = feature["geometry"]["coordinates"][0][0][0]
        self.assertAlmostEqual(point[0], -69, places=9)
        self.assertAlmostEqual(point[1], 0, places=9)
        self.assertEqual(len(shape(feature["geometry"]).geoms[0].interiors), 1)
        self.assertEqual(audit["vertexCount"], 10)
        self.assertLess(audit["features"][0]["roundTripMaxErrorM"], 0.01)
        self.assertEqual(collection["source"]["crs"], "EPSG:31979")
        self.assertEqual(collection["targetCRS"], "EPSG:4326")
        self.assertEqual(len(collection["source"]["sha256"]), 64)
        json.dumps(collection, allow_nan=False)

    def test_rejects_wrong_crs_and_invalid_polygon(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wrong-crs.gpkg"
            fixture(path, MultiPolygon([Polygon([(0, 0), (1, 0), (0, 1), (0, 0)])]), 4326)
            with self.assertRaisesRegex(ValueError, "EPSG:31979"):
                converter.convert(path)
            path = Path(directory) / "invalid.gpkg"
            fixture(path, MultiPolygon([Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])]))
            with self.assertRaisesRegex(ValueError, "Invalid conjunto"):
                converter.convert(path)


if __name__ == "__main__":
    unittest.main()
