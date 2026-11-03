// Real-time invalidation channel for field and management clients. D1 remains the source of truth.
export class CampoRealtime {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/connect'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket obrigatório.',{status:426,headers:{Upgrade:'websocket'}});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server);
   server.send(JSON.stringify({type:'ready',version:'4.6.2',at:new Date().toISOString()}));
   return new Response(null,{status:101,webSocket:client});
  }
  if(url.pathname==='/publish'&&request.method==='POST'){
   let event;try{event=await request.json();}catch{return Response.json({error:'Evento inválido.'},{status:400});}
   const kind=typeof event?.kind==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(event.kind)?event.kind:'data-change';
   const message=JSON.stringify({type:'change',kind,at:new Date().toISOString()});let delivered=0;
   for(const socket of this.ctx.getWebSockets()){try{socket.send(message);delivered++;}catch{try{socket.close(1011,'Falha ao atualizar');}catch{}}}
   return Response.json({ok:true,delivered});
  }
  return new Response('Not found',{status:404});
 }
 webSocketMessage(socket,message){if(message==='ping')socket.send('pong');}
 webSocketError(socket){try{socket.close(1011,'Conexão interrompida');}catch{}}
}

async function realtimePublish(env,kind){
 if(!env.CAMPO_REALTIME)return;
 try{
  const response=await env.CAMPO_REALTIME.getByName('management').fetch(new Request('https://campo-realtime/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind})}));
  if(!response.ok)throw Error('HTTP '+response.status);
 }catch(error){console.warn(JSON.stringify({event:'realtime_publish_failed',kind,error:error instanceof Error?error.message:String(error)}));}
}
