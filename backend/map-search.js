// Address search is explicitly submitted. Local layer suggestions never call this provider.
async function mapAddressSearch(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 let body;try{body=await sharedBody(request,2000);}catch{return json({error:'Pesquisa inválida.'},400);}
 const query=typeof body.query==='string'?body.query.trim().replace(/\s+/g,' '):'';
 if(query.length<3||query.length>160)return json({error:'Informe de 3 a 160 caracteres, incluindo cidade e estado.'},400);
 const db=env.SHARED_DB?.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;if(!db)return json({error:'Pesquisa online indisponível. Use as camadas salvas ou coordenadas.'},503);
 try{const key='photon:'+query.toLocaleLowerCase('pt-BR'),now=Date.now(),cached=await db.prepare('SELECT data FROM campo_place_cache WHERE cache_key=? AND expires_at>?').bind(key,now).first();if(cached)return json({...JSON.parse(cached.data),cached:true});
 const gate=await db.prepare("INSERT INTO campo_search_limit(id,next_at) VALUES('places',?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE campo_search_limit.next_at<=?").bind(now+1100,now).run();if(!gate.meta?.changes)return json({error:'Pesquisa ocupada. Aguarde um instante e toque em Buscar.'},429);
 const url=new URL(env.MAP_GEOCODER_URL||'https://photon.komoot.io/api/');if(url.protocol!=='https:'||url.username||url.password)return json({error:'Serviço de endereços não configurado corretamente.'},503);url.searchParams.set('q',query);url.searchParams.set('limit','6');url.searchParams.set('countrycode','BR');
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'CampoVegetacao/4.3 (explicit place search; mapeamento-arvores.pages.dev)'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Provider unavailable');
 const data=JSON.parse(await(await limitedBody(response,500000)).text());if(!Array.isArray(data.features))throw Error('Invalid provider');
 const results=data.features.slice(0,6).flatMap(f=>{const c=f.geometry?.coordinates,p=f.properties||{};if(f.geometry?.type!=='Point'||!Array.isArray(c)||!sharedCoordinate(c[1],90)||!sharedCoordinate(c[0],180))return [];const title=[p.name,p.street,p.housenumber].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,200)||'Endereço';const detail=[p.district,p.city,p.county,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,300);return [{title,detail,lat:c[1],lon:c[0]}];});const out={results,provider:'Photon',attribution:'© OpenStreetMap contributors · ODbL'};
 await db.batch([db.prepare('INSERT INTO campo_place_cache(cache_key,data,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').bind(key,JSON.stringify(out),now+7*86400000),db.prepare('DELETE FROM campo_place_cache WHERE expires_at<? OR cache_key IN (SELECT cache_key FROM campo_place_cache ORDER BY expires_at DESC LIMIT -1 OFFSET 1000)').bind(now)]);return json(out);
 }catch{return json({error:'Endereços indisponíveis agora. Use coordenadas ou a rede salva e tente novamente depois.'},502);}
}
