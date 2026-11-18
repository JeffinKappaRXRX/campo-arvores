import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const [input, output, rawSize = '2000000'] = process.argv.slice(2);
const partSize = Number(rawSize);
if (!input || !output || !Number.isSafeInteger(partSize) || partSize < 100000 || partSize > 24000000) {
  throw new Error('Uso: node hosting/prepare-route-upload.mjs pacote.json.gz pasta-saida [bytes-por-parte]');
}

const packed = await fs.readFile(input);
const data = JSON.parse(gunzipSync(packed));
const rows = data?.rows || data?.spans;
if (!Array.isArray(data?.feeders) || !Array.isArray(rows)) {
  throw new Error('Pacote de rede inválido.');
}

await fs.mkdir(output, {recursive: true});
const parts = Math.ceil(packed.byteLength / partSize);
for (let index = 0; index < parts; index++) {
  await fs.writeFile(path.join(output, `part-${index}.bin`), packed.subarray(index * partSize, (index + 1) * partSize));
}

const manifest = {
  feeders: data.feeders,
  count: rows.length,
  parts,
  size: packed.byteLength,
  sha256: createHash('sha256').update(packed).digest('hex'),
};
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
console.log(JSON.stringify(manifest));
