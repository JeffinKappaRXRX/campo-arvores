// Prévia local com dados fictícios. Não consulta nem altera produção.
import http from 'node:http';
import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../docs/manejo-core.js'),day=M.day;
const table=rows=>({n:rows.length,c:Object.fromEntries([...new Set(rows.flatMap(Object.keys))].map(k=>[k,rows.map(r=>r[k]??null)]))});
const data={resumo:{hoje:'2026-11-04',corteDec:'2026-11-03',fontes:[],alertas:[],conjuntos:{1:'Conjunto de teste'},frentes:[]},chaves:table([{chave:'TESTE-T1',trecho:1,polo:'RBR',alim:'TESTE-01',conj:'1',plano:'Teste',mun:'Rio Branco'},{chave:'TESTE-T2',trecho:2,polo:'RBR',alim:'TESTE-02',conj:'1',plano:'Teste',mun:'Rio Branco'}]),parque_postes:table([{id:'POSTE-A',lat:-9.95,lon:-67.82,tr:1,chave:'TESTE-T1',alim:'TESTE-01',polo:'RBR',conj:'1',ult:day('2026-01-10'),nAb:1,arvE:8},{id:'POSTE-B',lat:-7.63,lon:-72.67,tr:2,chave:'TESTE-T2',alim:'TESTE-02',polo:'RBR',conj:'1',base:day('2026-01-10'),baseF:'Última poda',arvE:8},{id:'POSTE-C',tr:2,chave:'TESTE-T2',alim:'TESTE-02',polo:'RBR',conj:'1',arvE:null}]),vera_prev:table([{id:'ARVORE-A',poste:'POSTE-A',lat:-9.95,lon:-67.82,chave:'TESTE-T1',alim:'TESTE-01',polo:'RBR',conj:'1',especie:'Mangueira',diasToque:30,classe:'ALTO',equipeIT:'Linha viva ou desligamento',lev:day('2026-01-01')},{id:'ARVORE-B',poste:'POSTE-A',lat:-9.95,lon:-67.82,chave:'TESTE-T1',alim:'TESTE-01',polo:'RBR',conj:'1',especie:'Oiti',diasToque:120,classe:'BAIXO',equipeIT:'Linha morta a distância'}])};
const parts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,gzipSync(JSON.stringify(v)).toString('base64')])),generation='cen-20261116100000';
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(req.method!=='GET'){res.writeHead(405);res.end();return;}let json;
 if(u.pathname==='/api/auth/status')json={admin:true};
 else if(u.pathname==='/api/central/meta')json={generation,updatedAt:'2026-11-15T12:00:00Z',manifest:Object.fromEntries(Object.keys(parts).map(k=>[k,{parts:1}]))};
 else if(u.pathname==='/api/central/data')json={body:parts[u.searchParams.get('name')]};
 else if(u.pathname==='/api/central/premissas')json={premissas:{}};
 if(json){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(json));return;}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(('<!doctype html><title>Prévia de manejo</title><style>body{margin:0}iframe{border:0;width:100%;height:calc(100vh - 30px)}div{padding:6px;background:#fff1b8;font:14px system-ui}</style><div>TESTE LOCAL · DADOS FICTÍCIOS · NÃO É O PAINEL OFICIAL</div><iframe src="/central.html?embed=1#manejo"></iframe>').replace('#manejo',u.searchParams.get('view')==='mapa'?'#mapa':'#manejo'));return;}
 if(!/^\/(?:vendor\/)?[\w.-]+$/.test(u.pathname)){res.writeHead(404);res.end();return;}
 let content=await fs.readFile(new URL('../docs'+u.pathname,import.meta.url));if(u.pathname==='/central.html')content=content.toString().replace('<script src="api-client.js"></script>','').replace('<script src="config.js"></script>','');res.setHeader('Content-Type',u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html');res.end(content);
 }catch{res.writeHead(404);res.end();}}).listen(3088,'127.0.0.1',()=>console.log('Prévia fictícia: http://127.0.0.1:3088'));
