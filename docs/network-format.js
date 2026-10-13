'use strict';
// Cabeçalho prevalece sobre nome/extensão: downloads móveis podem renomear arquivos.
async function detectNetworkFormat(file){
 const bytes=new Uint8Array(await file.slice(0,512).arrayBuffer());
 const matches=signature=>signature.every((n,i)=>bytes[i]===n);
 if(matches([0x37,0x7a,0xbc,0xaf,0x27,0x1c]))throw Error('Este arquivo é 7z. O app aceita GPKG ou ZIP; selecione Rede_Campo_Integrada.zip, disponibilizado na conversa, ou extraia o 7z e selecione Rede_Campo.gpkg.');
 if(matches([0x52,0x61,0x72,0x21]))throw Error('Este arquivo é RAR. Extraia o pacote e selecione o arquivo .gpkg, ou use um ZIP contendo o GPKG.');
 if(matches([0x50,0x4b,0x03,0x04])||matches([0x50,0x4b,0x05,0x06]))return 'zip';
 if(matches([...new TextEncoder().encode('SQLite format 3\0')]))return 'gpkg';
 const prefix=new TextDecoder().decode(bytes).replace(/^\uFEFF/,'').trimStart();
 if(prefix.startsWith('{'))return 'geojson';
 throw Error('Formato não reconhecido: '+(file.name||'arquivo')+'. Selecione um GPKG, um ZIP contendo GPKG ou um GeoJSON. Projeto .qgz sozinho não contém a base da rede.');
}
if(typeof module!=='undefined')module.exports={detectNetworkFormat};
