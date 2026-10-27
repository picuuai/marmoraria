// Nota fiscal (NF-e modelo 55 e NFC-e modelo 65): regimes tributários, itens e impostos.
// Os percentuais e códigos são padrões editáveis nos Ajustes e nos Cadastros: quem confirma é o contador.
import { lista, achar, config } from './db.js';
import { arred, soDigitos, tipoDocumento } from './util.js';
import { valorPeca, qtdDe } from './calc.js';
import { faltaCliente } from './cliente.js';

// CRT = código de regime tributário da nota. Simples e MEI usam CSOSN; os demais, CST.
export const REGIMES = {
  simples: { nome: 'Simples Nacional', crt: 1, csosn: true, padrao: { icmsCod: '102', pisCst: '49', pis: 0, cofins: 0 } },
  excesso: { nome: 'Simples Nacional – excesso de sublimite', crt: 2, csosn: false, padrao: { icmsCod: '00', pisCst: '49', pis: 0, cofins: 0 } },
  mei: { nome: 'MEI', crt: 4, csosn: true, padrao: { icmsCod: '102', pisCst: '49', pis: 0, cofins: 0 } },
  presumido: { nome: 'Lucro Presumido', crt: 3, csosn: false, padrao: { icmsCod: '00', pisCst: '01', pis: 0.65, cofins: 3 } },
  real: { nome: 'Lucro Real', crt: 3, csosn: false, padrao: { icmsCod: '00', pisCst: '01', pis: 1.65, cofins: 7.6 } },
};

export const CODIGOS_ICMS = {
  csosn: {
    101: '101 – Tributada com permissão de crédito', 102: '102 – Tributada sem permissão de crédito',
    103: '103 – Isenção para faixa de receita', 300: '300 – Imune', 400: '400 – Não tributada',
    500: '500 – ICMS cobrado antes por substituição', 900: '900 – Outros',
  },
  cst: {
    '00': '00 – Tributada integralmente', 20: '20 – Com redução de base', 40: '40 – Isenta', 41: '41 – Não tributada',
    60: '60 – ICMS cobrado antes por substituição', 90: '90 – Outros',
  },
};

export const ORIGENS = {
  0: '0 – Nacional', 1: '1 – Estrangeira, importação direta', 2: '2 – Estrangeira, comprada no Brasil',
  3: '3 – Nacional com mais de 40% importado', 5: '5 – Nacional com até 40% importado', 8: '8 – Nacional com mais de 70% importado',
};

// Padrões da empresa (config.fiscal), completados com os do regime
export function fiscal() {
  const f = config().fiscal || {};
  const r = REGIMES[f.regime] || REGIMES.simples;
  return {
    regime: 'simples', aliqIcms: 18, pCredSN: 0, ipi: false, tiraIcmsPis: true, ambiente: 'homologacao',
    serie55: 1, proxima55: 1, serie65: 1, proxima65: 1, natureza: 'Venda de produção do estabelecimento',
    ...r.padrao, ...f,
  };
}

// ICMS entre estados: 7% saindo do Sul/Sudeste (menos ES) para Norte, Nordeste, Centro-Oeste e ES; 12% nos demais.
// Mercadoria com conteúdo importado (origem 1, 2, 3 e 8) paga 4%.
const SUL_SUDESTE = ['PR', 'RS', 'SC', 'MG', 'RJ', 'SP'];
export function aliqInterestadual(origemUf, destinoUf, origemMerc) {
  if (['1', '2', '3', '8'].includes(String(origemMerc))) return 4;
  return SUL_SUDESTE.includes(origemUf) && !SUL_SUDESTE.includes(destinoUf) ? 7 : 12;
}

// Destinatário: contribuinte do ICMS (tem IE) ou consumidor final
export function tipoDestinatario(c) {
  const ie = String((c && c.ie) || '').trim();
  if (/^isent/i.test(ie)) return { indIEDest: 2, final: true, texto: 'Isento de inscrição estadual' };
  if (soDigitos(ie).length >= 2) return { indIEDest: 1, final: false, texto: 'Contribuinte do ICMS' };
  return { indIEDest: 9, final: true, texto: 'Consumidor final (não contribuinte)' };
}

// CFOP: 5xxx dentro do estado, 6xxx para outro; para consumidor final de outro estado, 6107 / 6108
function cfopFinal(cfop, interestadual, final) {
  const c = String(cfop || '').replace(/\D/g, '');
  if (!interestadual) return c;
  if (final && c === '5101') return '6107';
  if (final && c === '5102') return '6108';
  return c.replace(/^5/, '6');
}

// Monta os itens da nota a partir do pedido:
// - cada peça vira um item (unidade UN), com os dados fiscais do material
// - produtos viram itens com os dados fiscais do cadastro
// - serviços: "somar" entra no valor das peças (furo, recorte), "item" vira item, "fora" fica de fora (NFS-e)
// - frete/instalação: no campo frete da nota ou fora dela; o desconto é rateado entre os itens
export function montarNota(o, modelo = '55') {
  const f = fiscal(), reg = REGIMES[f.regime] || REGIMES.simples, cfg = config();
  const c = o.clienteId ? achar('clientes', o.clienteId) : null;
  const nota = o.nota || {};
  const ufEmit = f.uf || '', ufDest = (c && c.uf) || ufEmit;
  const dest = tipoDestinatario(c);
  const interestadual = modelo === '55' && !!ufDest && ufDest !== ufEmit;
  const itens = [];
  let fora = 0;

  for (const p of o.pecas) {
    const m = achar('materiais', p.materialId) || {};
    const q = qtdDe(p);
    itens.push({
      desc: `${p.nome} em ${p.materialNome} ${p.comp} x ${p.larg} cm`.slice(0, 120), un: 'UN', qtd: q, valor: valorPeca(p),
      ncm: m.ncm || '', cfop: m.cfop || '5101', origem: m.origem ?? '0', icmsCod: m.icmsCod || '', ipi: m.ipi || 0, peca: true,
    });
  }
  let somar = 0;
  for (const it of o.itens) {
    const cat = it.catId ? achar('catalogo', it.catId) : null;
    const valor = it.preco * it.qtd;
    const naNota = (cat && cat.naNota) || (it.tipo === 'servico' ? 'somar' : 'item');
    if (naNota === 'fora') { fora += valor; continue; }
    if (naNota === 'somar' && itens.some(x => x.peca)) { somar += valor; continue; }
    itens.push({
      desc: (it.nome || 'Item').slice(0, 120), un: 'UN', qtd: it.qtd, valor,
      ncm: (cat && cat.ncm) || '', cfop: (cat && cat.cfop) || (it.tipo === 'produto' ? '5102' : '5101'),
      origem: (cat && cat.origem) ?? '0', icmsCod: (cat && cat.icmsCod) || '', ipi: (cat && cat.ipi) || 0,
    });
  }
  // serviços somados: divididos entre as peças pelo valor de cada uma
  const pecas = itens.filter(x => x.peca), totPecas = pecas.reduce((s, x) => s + x.valor, 0);
  if (somar > 0) pecas.forEach(x => { x.valor += totPecas > 0 ? somar * x.valor / totPecas : somar / pecas.length; });

  const vProd = arred(itens.reduce((s, x) => s + arred(x.valor), 0));
  const freteNaNota = (nota.frete || 'frete') === 'frete' && modelo === '55';
  const vFrete = freteNaNota ? arred(o.frete || 0) : 0;
  if (!freteNaNota) fora += o.frete || 0;
  const vDesc = arred(Math.min(o.desconto || 0, vProd));

  // rateio de desconto e frete (o último item fica com a sobra dos centavos)
  const ratear = (total, campo) => {
    let resto = total;
    itens.forEach((x, i) => { x[campo] = i === itens.length - 1 ? arred(resto) : arred(vProd > 0 ? total * arred(x.valor) / vProd : 0); resto -= x[campo]; });
  };
  ratear(vDesc, 'desconto');
  ratear(vFrete, 'frete');

  const t = { vProd, vDesc, vFrete, vBC: 0, vICMS: 0, vIPI: 0, vPIS: 0, vCOFINS: 0, vCredSN: 0 };
  for (const x of itens) {
    x.valor = arred(x.valor);
    x.vUnit = x.qtd ? x.valor / x.qtd : x.valor;
    x.cfop = cfopFinal(x.cfop, interestadual, dest.final);
    x.icmsCod = x.icmsCod || f.icmsCod;
    const liquido = x.valor - x.desconto;
    // IPI (só para quem é contribuinte, normalmente indústria)
    x.ipiCst = f.ipi ? (x.ipi > 0 ? '50' : '51') : '';
    x.vIPI = f.ipi && x.ipi > 0 ? arred((liquido + x.frete) * x.ipi / 100) : 0;
    // ICMS
    x.aliqIcms = 0; x.vBC = 0; x.vICMS = 0; x.vCredSN = 0;
    if (reg.csosn) {
      if (String(x.icmsCod) === '101' && f.pCredSN > 0) x.vCredSN = arred(liquido * f.pCredSN / 100);
      if (String(x.icmsCod) === '900') { x.aliqIcms = interestadual ? aliqInterestadual(ufEmit, ufDest, x.origem) : f.aliqIcms; }
    } else if (['00', '20', '90'].includes(String(x.icmsCod))) {
      x.aliqIcms = interestadual ? aliqInterestadual(ufEmit, ufDest, x.origem) : f.aliqIcms;
    }
    if (x.aliqIcms) {
      // para consumidor final o IPI entra na base do ICMS
      x.vBC = arred(liquido + x.frete + (dest.final ? x.vIPI : 0));
      x.vICMS = arred(x.vBC * x.aliqIcms / 100);
    }
    // PIS e COFINS
    const basePis = Math.max(0, liquido - (f.tiraIcmsPis ? x.vICMS : 0));
    x.pisCst = f.pisCst;
    x.vPIS = arred(basePis * (f.pis || 0) / 100);
    x.vCOFINS = arred(basePis * (f.cofins || 0) / 100);
    for (const k of ['vBC', 'vICMS', 'vIPI', 'vPIS', 'vCOFINS', 'vCredSN']) t[k] = arred(t[k] + x[k]);
  }
  t.vNF = arred(vProd - vDesc + vFrete + t.vIPI);

  return {
    modelo, regime: reg, f, emitente: { nome: cfg.empresa, doc: cfg.documento, uf: ufEmit }, cliente: c, dest,
    interestadual, ufEmit, ufDest, itens, t, fora: arred(fora), serie: f['serie' + modelo], numero: f['proxima' + modelo],
    problemas: conferir(o, modelo, f, c, dest, itens, interestadual, ufEmit, ufDest),
  };
}

// O que impede a emissão (lista vazia = pronta)
function conferir(o, modelo, f, c, dest, itens, interestadual, ufEmit, ufDest) {
  const p = [], cfg = config();
  if (tipoDocumento(cfg.documento) !== 'cnpj') p.push({ onde: 'ajustes', texto: 'CNPJ da marmoraria (Ajustes → Dados da marmoraria)' });
  if (!String(f.ie || '').trim()) p.push({ onde: 'ajustes', texto: 'Inscrição estadual da marmoraria' });
  for (const [k, n] of [['cep', 'CEP'], ['logradouro', 'rua'], ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'cidade'], ['uf', 'estado'], ['ibge', 'código do município (vem pelo CEP)']]) {
    if (!String(f[k] || '').trim()) p.push({ onde: 'ajustes', texto: `Endereço da marmoraria: ${n}` });
  }
  if (!itens.length) p.push({ onde: 'pedido', texto: 'A nota não tem nenhum item' });
  const semNcm = [...new Set(itens.filter(x => soDigitos(x.ncm).length !== 8).map(x => x.desc.split(' em ')[0]))];
  if (semNcm.length) p.push({ onde: 'cadastros', texto: `NCM (8 dígitos) no cadastro: ${semNcm.join(', ')}` });
  if (itens.some(x => !/^\d{4}$/.test(x.cfop))) p.push({ onde: 'cadastros', texto: 'CFOP com 4 dígitos em todos os itens' });
  if (modelo === '55') {
    if (!c) p.push({ onde: 'pedido', texto: 'Cliente do pedido' });
    else {
      const falta = faltaCliente(c);
      if (falta.length) p.push({ onde: 'pedido', texto: `Cadastro do cliente: ${falta.join(', ')}` });
      if (!c.ibge && !falta.includes('CEP')) p.push({ onde: 'pedido', texto: 'Código do município do cliente: digite o CEP de novo para buscar' });
    }
  } else {
    if (c && ufDest && ufDest !== ufEmit) p.push({ onde: 'pedido', texto: 'NFC-e só vale para venda dentro do estado. Use a NF-e (55).' });
    if (!dest.final) p.push({ onde: 'pedido', texto: 'NFC-e é só para consumidor final. Cliente com inscrição estadual: use a NF-e (55).' });
  }
  return p;
}

export const avisosNota = n => {
  const a = [];
  if (n.interestadual && n.dest.final) a.push('Venda para consumidor final de outro estado: pode haver DIFAL (diferença de alíquota) a recolher. Confirme com o contador.');
  if (n.fora > 0) a.push('Parte do pedido fica fora desta nota (serviços ou instalação). Esses valores vão em nota de serviço (NFS-e), da prefeitura.');
  if (n.f.ambiente !== 'producao') a.push('Ambiente de homologação (teste): a nota emitida não tem valor fiscal.');
  return a;
};

// Materiais e produtos sem NCM, para o aviso nos cadastros
export const semNcm = () => [...lista('materiais'), ...lista('catalogo').filter(c => c.tipo === 'produto')].filter(x => soDigitos(x.ncm).length !== 8);
