#!/usr/bin/env python3
"""Build the private ARBORA MT routing snapshot from Rede_Campo and the VERA export."""
import argparse
import gzip
import json
import sqlite3
import sys
from collections import Counter, defaultdict

import numpy as np
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely import from_wkb
from shapely.ops import linemerge


def geom(blob):
    if not blob or blob[:2] != b'GP' or blob[3] & 16:
        return None
    return from_wkb(blob[8 + (0, 32, 48, 48, 64)[(blob[3] >> 1) & 7]:])


def key(value):
    return str(value or '').strip().upper()


def section(value):
    value = key(value).removeprefix('T').strip().removesuffix('.0')
    return int(value) if value in ('1', '2', '3') else 0


def layer(db, name):
    candidates = [r for r in db.execute('SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns') if r[0].lower().endswith(name)]
    if len(candidates) != 1:
        raise ValueError(f'Esperava uma camada {name}: {candidates}')
    return candidates[0]


def quoted(value):
    return '"' + value.replace('"', '""') + '"'


def build(field, vera):
    with gzip.open(vera, 'rt', encoding='utf-8') as source:
        reference = {str(row[0]): row for row in json.load(source)}
    with sqlite3.connect(f'file:{field}?mode=ro', uri=True) as db:
        mt, mt_geo, mt_crs = layer(db, '17_vaos_mt')
        pole, pole_geo, pole_crs = layer(db, '13_postes')
        local = 31979
        transform_mt = Transformer.from_crs(mt_crs, local, always_xy=True).transform
        transform_pole = Transformer.from_crs(pole_crs, local, always_xy=True).transform
        to_wgs = Transformer.from_crs(local, 4326, always_xy=True).transform
        pole_ids, pole_points = [], []
        for raw_id, blob in db.execute(f'SELECT Id,{quoted(pole_geo)} FROM {quoted(pole)}'):
            point = geom(blob)
            if raw_id and point is not None and not point.is_empty:
                pole_ids.append(int(raw_id))
                pole_points.append(transform_pole(point.x, point.y))
        tree = cKDTree(pole_points)
        counts = Counter()
        data, endpoints, lines = [], [], []
        for raw_id, feeder, typ, block, blob in db.execute(f'SELECT Id,Alimentador,TIPO_TRECHO,Name_Bloco,{quoted(mt_geo)} FROM {quoted(mt)} ORDER BY Alimentador, Id'):
            line = geom(blob)
            if line is None or not raw_id:
                counts['sem geometria ou ID'] += 1
                continue
            if line.geom_type == 'MultiLineString':
                line = linemerge(line)
            if line.geom_type != 'LineString' or line.length <= 0:
                counts['geometria desconectada'] += 1
                continue
            ref = reference.get(str(raw_id))
            _, fallback_feeder, locality, zone, fallback_section, fallback_block, metres = ref or ('', '', '', '', '', '', 0)
            feeder = key(feeder) or key(fallback_feeder)
            if not feeder:
                counts['sem alimentador'] += 1
                continue
            counts['ID VERA' if ref else 'sem ID VERA'] += 1
            counts['extensão cadastrada' if metres else 'extensão geométrica'] += 1
            xy = [(float(x), float(y)) for x, y, *_ in line.coords]
            if mt_crs != local:
                xy = [transform_mt(x, y) for x, y in xy]
                from shapely.geometry import LineString
                line = LineString(xy)
            endpoints.extend((xy[0], xy[-1]))
            lines.append(line)
            data.append([int(raw_id), feeder, key(locality), {'URBANO': 1, 'RURAL': 2}.get(key(zone), 0), section(typ) or section(fallback_section), key(block) or key(fallback_block), round(metres * 1000), 0, 0, 0, xy])
    distances, indices = tree.query(endpoints, k=2, workers=2)
    supported = defaultdict(list)
    for i, row in enumerate(data):
        for side in (0, 1):
            d, idx = distances[i * 2 + side], indices[i * 2 + side]
            if d[0] <= 3 and (d[1] - d[0] >= .25 or pole_ids[idx[0]] == pole_ids[idx[1]]):
                row[7 + side] = pole_ids[idx[0]]
        if row[7] and row[8] and row[7] != row[8]:
            supported[tuple(sorted(row[7:9]))].append(i)
            counts['dois postes identificados'] += 1
    group = 0
    for members in supported.values():
        if len({data[i][1] for i in members}) < 2:
            continue
        clusters = []
        for i in members:
            match = next((c for c in clusters if all(lines[i].hausdorff_distance(lines[j]) <= 3 for j in c)), None)
            if match is None:
                clusters.append([i])
            else:
                match.append(i)
        for cluster in clusters:
            if len({data[i][1] for i in cluster}) < 2:
                continue
            group += 1
            for i in cluster:
                data[i][9] = group
                counts['vãos compartilhados'] += 1
    feeders = sorted({r[1] for r in data})
    localities = sorted({r[2] for r in data})
    blocks = sorted({r[5] for r in data})
    dictionaries = [{x: i for i, x in enumerate(items)} for items in (feeders, localities, blocks)]
    for row in data:
        for col, dictionary in zip((1, 2, 5), dictionaries):
            row[col] = dictionary[row[col]]
        lon, lat = to_wgs(*zip(*row[10]))
        row[10] = [round(n * 1e6) for p in zip(lon, lat) for n in p]
    counts['alimentadores'] = len(feeders)
    counts['grupos compartilhados'] = group
    counts['vãos no pacote'] = len(data)
    print(json.dumps(counts, ensure_ascii=False), file=sys.stderr)
    return {'feeders': feeders, 'localities': localities, 'blocks': blocks, 'rows': data}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rede_campo')
    parser.add_argument('vera_json_gz')
    parser.add_argument('saida_json_gz')
    args = parser.parse_args()
    result = build(args.rede_campo, args.vera_json_gz)
    with gzip.GzipFile(filename='', mode='wb', fileobj=open(args.saida_json_gz, 'wb'), mtime=0) as out:
        out.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode())


if __name__ == '__main__':
    main()
