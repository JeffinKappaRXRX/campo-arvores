#!/usr/bin/env python3
"""Build the private ARBORA MT routing snapshot from the operational GeoPackage."""
import argparse
import gzip
import json
import re
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


def metres(value):
    try:
        parsed = float(str(value or '').strip().replace(',', '.'))
        return parsed if parsed > 0 else 0
    except ValueError:
        return 0


def pole_pair(value):
    values = []
    for token in re.split(r'[^0-9]+', str(value or '')):
        if token and token not in values:
            values.append(token)
    return values[:2]


def layer(db, name):
    candidates = [r for r in db.execute('SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns') if r[0].lower().endswith(name)]
    if len(candidates) != 1:
        raise ValueError(f'Esperava uma camada {name}: {candidates}')
    return candidates[0]


def quoted(value):
    return '"' + value.replace('"', '""') + '"'


def build(field, vera=None):
    reference = {}
    if vera:
        with gzip.open(vera, 'rt', encoding='utf-8') as source:
            reference = {str(row[0]): row for row in json.load(source)}
    with sqlite3.connect(f'file:{field}?mode=ro', uri=True) as db:
        mt, mt_geo, mt_crs = layer(db, '17_vaos_mt')
        pole, pole_geo, pole_crs = layer(db, '13_postes')
        local = 31979
        transform_mt = Transformer.from_crs(mt_crs, local, always_xy=True).transform
        transform_pole = Transformer.from_crs(pole_crs, local, always_xy=True).transform
        to_wgs = Transformer.from_crs(local, 4326, always_xy=True).transform
        pole_ids, pole_points, pole_data = [], [], {}
        for raw_id, locality, zone, blob in db.execute(f'SELECT Id,Localidade,Urbano_Rural,{quoted(pole_geo)} FROM {quoted(pole)}'):
            point = geom(blob)
            if raw_id and point is not None and not point.is_empty:
                pole_id = str(raw_id)
                coordinates = transform_pole(point.x, point.y)
                pole_ids.append(pole_id)
                pole_points.append(coordinates)
                pole_data[pole_id] = (coordinates, key(locality), key(zone))
        tree = cKDTree(pole_points)
        counts = Counter()
        data, unresolved, lines, exact_links = [], [], [], set()
        query = f'SELECT Id,Alimentador,TIPO_TRECHO,Name_Bloco,{quoted("Comprimento Atual")},Id_Poste,{quoted(mt_geo)} FROM {quoted(mt)} ORDER BY Alimentador, Id'
        for raw_id, feeder, typ, block, registered_length, linked_poles, blob in db.execute(query):
            line = geom(blob)
            if line is None or not raw_id:
                counts['sem geometria ou ID'] += 1
                continue
            if line.geom_type == 'MultiLineString':
                line = linemerge(line)
            if line.geom_type != 'LineString' or line.length <= 0:
                counts['geometria desconectada'] += 1
                continue
            xy = [(float(x), float(y)) for x, y, *_ in line.coords]
            if mt_crs != local:
                xy = [transform_mt(x, y) for x, y in xy]
                from shapely.geometry import LineString
                line = LineString(xy)
            ref = reference.get(str(raw_id))
            _, fallback_feeder, locality, zone, fallback_section, fallback_block, fallback_metres = ref or ('', '', '', '', '', '', 0)
            feeder = key(feeder) or key(fallback_feeder)
            if not feeder:
                counts['sem alimentador'] += 1
                continue
            counts['ID VERA' if ref else 'sem ID VERA'] += 1
            length = metres(registered_length) or metres(fallback_metres)
            counts['extensão cadastrada' if length else 'extensão geométrica'] += 1
            row_index = len(data)
            exact = pole_pair(linked_poles)
            if len(exact) == 2 and all(pole_id in pole_data for pole_id in exact):
                direct = sum(np.linalg.norm(np.subtract(xy[side], pole_data[exact[side]][0])) for side in (0, 1))
                reverse = sum(np.linalg.norm(np.subtract(xy[side], pole_data[exact[1 - side]][0])) for side in (0, 1))
                if reverse < direct:
                    exact.reverse()
                counts['postes vinculados pelo GPKG'] += 1
                exact_links.add(row_index)
            else:
                exact = []
            for side in (0, 1):
                if len(exact) < 2:
                    unresolved.append((row_index, side, xy[side]))
            lines.append(line)
            data.append([int(raw_id), feeder, key(locality), {'URBANO': 1, 'RURAL': 2}.get(key(zone), 0), section(typ) or section(fallback_section), key(block) or key(fallback_block), round(length * 1000) if length else 0, *(exact if len(exact) == 2 else (0, 0)), 0, xy])
    distances, indices = tree.query([point for _, _, point in unresolved], k=2, workers=2) if unresolved else ([], [])
    for (row_index, side, _), d, idx in zip(unresolved, distances, indices):
        if d[0] <= 3 and (d[1] - d[0] >= .25 or pole_ids[idx[0]] == pole_ids[idx[1]]):
            data[row_index][7 + side] = pole_ids[idx[0]]
            counts['postes vinculados pela geometria'] += 1
    supported = defaultdict(list)
    for i, row in enumerate(data):
        metadata = [pole_data.get(str(pole_id)) for pole_id in row[7:9] if pole_id]
        if not row[2]:
            row[2] = next((item[1] for item in metadata if item and item[1]), '')
        if not row[3]:
            row[3] = next(({'URBANO': 1, 'RURAL': 2}.get(item[2], 0) for item in metadata if item and item[2]), 0)
        if row[7] and row[8] and row[7] != row[8]:
            supported[tuple(sorted(row[7:9]))].append(i)
            counts['dois postes identificados'] += 1
    group = 0
    for members in supported.values():
        if len({data[i][1] for i in members}) < 2:
            continue
        exact_members = [i for i in members if i in exact_links]
        clusters = [exact_members] if exact_members else []
        for i in (i for i in members if i not in exact_links):
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
    parser.add_argument('referencia_ou_saida')
    parser.add_argument('saida_json_gz', nargs='?')
    args = parser.parse_args()
    vera = args.referencia_ou_saida if args.saida_json_gz else None
    output = args.saida_json_gz or args.referencia_ou_saida
    result = build(args.rede_campo, vera)
    with gzip.GzipFile(filename='', mode='wb', fileobj=open(output, 'wb'), mtime=0) as out:
        out.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode())


if __name__ == '__main__':
    main()
