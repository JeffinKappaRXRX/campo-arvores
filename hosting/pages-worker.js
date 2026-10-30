// Stable public address; application source remains versioned in GitHub.
export default {async fetch(request,env){
 const url=new URL(request.url),official='https://mapeamento-arvores.pages.dev';
 if(url.pathname.startsWith('/api/')){const origin=request.headers.get('Origin');if(origin&&origin!==official)return new Response('Origem não autorizada.',{status:403});const headers=new Headers(request.headers);headers.set('Origin',official);return env.CAMPO_API.fetch(new Request('https://campo-internal'+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));}
 if(!['GET','HEAD'].includes(request.method))return new Response('Método não permitido.',{status:405});
 if(url.pathname==='/config.js')return new Response('window.CAMPO_CONFIG={apiBase:location.origin};',{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}});
 const path=url.pathname==='/'?'/index.html':url.pathname;if(!/^\/[a-zA-Z0-9_./-]+$/.test(path)||path.includes('..'))return new Response('Not found',{status:404});
 const upstream=new URL('https://jeffinkapparxrx.github.io/campo-arvores/docs'+path+url.search);upstream.searchParams.set('campo_source',String(Math.floor(Date.now()/60000)));const response=await fetch(upstream,{method:request.method,headers:{'Accept':request.headers.get('Accept')||'*/*'},redirect:'follow'});const out=new Response(response.body,response);out.headers.delete('set-cookie');out.headers.set('Cache-Control',/\.(?:html|js|css|json)$/.test(path)?'no-cache':'public, max-age=3600');return out;
}};
