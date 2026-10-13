import fs from 'node:fs/promises';
const sources=await Promise.all(['inspection-rules.js','core.js','access.js'].map(f=>fs.readFile(new URL(f,import.meta.url),'utf8')));await fs.writeFile(new URL('worker.js',import.meta.url),'const ASSETS={};\n'+sources.join('\n'));console.log('API gerada: worker.js');
