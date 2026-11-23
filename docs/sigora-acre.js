'use strict';

// Public map locations; electrical supply references are maintained in the private register.
const SigoraAcre = [
 ['upa-sobral','UPA Sobral','upa','Rio Branco',[-9.9831357,-67.8250294],'https://observatorio.saude.ac.gov.br/acompanhamento/upa-sobral/'],
 ['upa-cidade-do-povo','UPA Cidade do Povo','upa','Rio Branco',[-10.0253666,-67.7527422],'https://observatorio.saude.ac.gov.br/acompanhamento/upa-cidade-do-povo/'],
 ['upa-via-verde','UPA Via Verde','upa','Rio Branco',[-9.9814374,-67.8473148],'https://observatorio.saude.ac.gov.br/acompanhamento/upa-via-verde/'],
 ['upa-tucuma','UPA Tucumã','upa','Rio Branco',[-9.9508972,-67.8580793],'https://www.openstreetmap.org/relation/19899799'],
 ['huerb','HUERB · Pronto-socorro de Rio Branco','emergencia','Rio Branco',[-9.96494,-67.81522],'https://td.med.br/estabelecimento/hospital-geral-de-clinicas-de-rio-branco-2001578'],
 ['fundhacre','FUNDHACRE','hospital','Rio Branco',[-9.96600,-67.85465],'https://td.med.br/estabelecimento/fundhacre-2001586'],
 ['hospital-jurua','Hospital Regional do Juruá','hospital','Cruzeiro do Sul',[-7.59525,-72.68328],'https://www.openstreetmap.org/node/9173556517'],
 ['hospital-alto-acre','Hospital Regional do Alto Acre · Wildy Viana','hospital','Brasiléia',[-10.991440,-68.760351],'https://buscacomercio.com/cidades/brasileia/hospitais-e-clinicas/hospital-regional-do-alto-acre-wildy-viana'],
 ['detran-boa-esperanca','DETRAN · Unidade Boa Esperança','transito','Rio Branco',[-9.9545783,-67.8249920],'https://www.openstreetmap.org/way/648612575'],
 ['deracre','DERACRE · sede','infra','Rio Branco',[-9.9845542,-67.8061791],'https://estado.ac.gov.br/orgao-entidades/autarquias-publicas/'],
 ['imac','IMAC · sede','ambiental','Rio Branco',null,'https://imac.ac.gov.br/'],
 ['idaf','IDAF · sede','ambiental','Rio Branco',null,'https://estado.ac.gov.br/orgao-entidades/autarquias-publicas/'],
 ['palacio-rio-branco','Palácio Rio Branco','governo','Rio Branco',[-9.974722,-67.809722],'https://pt.wikipedia.org/wiki/Pal%C3%A1cio_Rio_Branco_(Acre)'],
 ['sefaz','SEFAZ · sede','governo','Rio Branco',[-9.9747401,-67.8085026],'https://www.openstreetmap.org/way/648632563'],
 ['bombeiros-rbr','Corpo de Bombeiros · Estrada do Amapá','servico','Rio Branco',[-10.0109072,-67.8059525],'https://www.openstreetmap.org/way/607509326']
].map(([id,nome,tipo,municipio,point,source])=>({id,nome,tipo,municipio,point,source}));
