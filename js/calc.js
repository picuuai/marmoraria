// Regras de cálculo do orçamento. Tudo em centímetros nas medidas e m² nas áreas.
import { lista } from './db.js';

export const LADOS = { fundo: 'Fundo', frente: 'Frente', esquerda: 'Esquerda', direita: 'Direita' };
export const TIPOS_BORDA = { nenhum: 'Sem acabamento', espelho: 'Espelho', saia: 'Saia', acabamento: 'Acabamento' };
export const GRUPOS = { produto: { um: 'produto', varios: 'Produtos' }, servico: { um: 'serviço', varios: 'Serviços' } };
export const ESQUADRIA = 'Meia esquadria'; // a saia é sempre em meia esquadria
export const RETO = 'Reto simples';        // acabamento normal do espelho

export const temFaixa = b => b.tipo === 'espelho' || b.tipo === 'saia';
export const compBorda = (p, lado) => (lado === 'fundo' || lado === 'frente' ? p.comp : p.larg);

// --- áreas e material
export const areaTampo = p => (p.comp * p.larg) / 10000;
export const areaBordas = p => Object.keys(LADOS).reduce((s, l) =>
  s + (temFaixa(p.bordas[l]) ? (compBorda(p, l) * p.bordas[l].altura) / 10000 : 0), 0);
export const areaPeca = p => areaTampo(p) + areaBordas(p);
export const valorMaterial = p => areaPeca(p) * p.precoM2;

// --- acabamentos
// A peça guarda o percentual do dia em p.percs; o que não estiver lá vem do cadastro.
export function percAcab(nome, p) {
  if (p && p.percs && nome in p.percs) return p.percs[nome];
  const a = lista('acabamentos').find(x => x.nome === nome);
  return a ? a.perc || 0 : 0;
}

// Acabamento de uma borda. O espelho é reto, a não ser que a peça tenha outro
// acabamento (boleado, chanfrado, duplo...): aí o espelho acompanha.
export function acabDaBorda(p, lado) {
  const b = p.bordas[lado];
  if (b.tipo === 'nenhum') return '';
  if (b.tipo === 'saia') return ESQUADRIA;
  if (b.tipo === 'acabamento') return b.acab;
  let nome = RETO;
  for (const l of Object.keys(LADOS)) {
    const o = p.bordas[l];
    if (o.tipo === 'acabamento' && o.acab !== RETO && (nome === RETO || percAcab(o.acab, p) > percAcab(nome, p))) nome = o.acab;
  }
  return nome;
}

// Acabamento que define a mão de obra da peça: o de maior % entre as bordas
export function acabamentoMaior(p) {
  let maior = { perc: 0, nome: '' };
  for (const l of Object.keys(LADOS)) {
    if (p.bordas[l].tipo === 'nenhum') continue;
    const nome = acabDaBorda(p, l), perc = percAcab(nome, p);
    if (perc > maior.perc) maior = { perc, nome };
  }
  return maior;
}

// Guarda na peça os percentuais usados, para o orçamento não mudar se o cadastro mudar depois
export function fixarPercentuais(p) {
  const percs = { ...(p.percs || {}) };
  for (const nome of [RETO, ESQUADRIA, ...Object.keys(LADOS).map(l => p.bordas[l].acab)]) {
    if (nome && !(nome in percs)) percs[nome] = percAcab(nome, null);
  }
  p.percs = percs;
}

// --- mão de obra
export const maoObraCalc = p => valorMaterial(p) * acabamentoMaior(p).perc / 100;
// moFator guarda o ajuste feito à mão neste orçamento (valor digitado ÷ valor calculado),
// assim o valor continua acompanhando qualquer mudança na peça
export const fatorMaoObra = p => (p.moFator == null ? 1 : p.moFator);
export function maoObraDe(p) {
  const calc = maoObraCalc(p);
  return calc > 0 ? calc * fatorMaoObra(p) : valorMaterial(p) * (p.moPercSem || 0) / 100;
}
export const percMaoObra = p => { const mat = valorMaterial(p); return mat > 0 ? maoObraDe(p) / mat * 100 : 0; };
export const maoObraAlterada = p => (maoObraCalc(p) > 0 ? Math.abs(fatorMaoObra(p) - 1) > 1e-9 : !!p.moPercSem);

// --- valores da peça e do orçamento
export const qtdDe = p => p.qtd || 1;
export const valorPeca = p => (valorMaterial(p) + maoObraDe(p)) * qtdDe(p);
export const custoPedra = p => areaPeca(p) * (p.custoM2 || 0) * qtdDe(p);

export const totalPecas = o => o.pecas.reduce((s, p) => s + valorPeca(p), 0);
export const totalItens = (o, tipo) => o.itens.reduce((s, it) => s + (!tipo || it.tipo === tipo ? it.preco * it.qtd : 0), 0);
export const custoItens = (o, tipo) => o.itens.reduce((s, it) => s + (!tipo || it.tipo === tipo ? (it.custo || 0) * it.qtd : 0), 0);
export const totalGeral = o => Math.max(0, totalPecas(o) + totalItens(o) + (o.frete || 0) - (o.desconto || 0));

// Resultado para a folha interna
export function resultado(o) {
  const custoPedras = o.pecas.reduce((s, p) => s + custoPedra(p), 0);
  const vendaPedras = o.pecas.reduce((s, p) => s + valorMaterial(p) * qtdDe(p), 0);
  const maoObra = o.pecas.reduce((s, p) => s + maoObraDe(p) * qtdDe(p), 0);
  const custos = custoPedras + custoItens(o);
  const total = totalGeral(o);
  return { custoPedras, vendaPedras, maoObra, custos, total, lucro: total - custos, margem: total > 0 ? (total - custos) / total * 100 : 0 };
}

export function descBordas(p) {
  return Object.keys(LADOS).filter(l => p.bordas[l].tipo !== 'nenhum').map(l => {
    const b = p.bordas[l];
    return temFaixa(b)
      ? `${LADOS[l]}: ${b.tipo} de ${b.altura} cm (${acabDaBorda(p, l).toLowerCase()})`
      : `${LADOS[l]}: acabamento ${b.acab.toLowerCase()}`;
  });
}

// Partes a cortar de uma peça: o tampo e cada espelho ou saia
export function partesDaPeca(p) {
  const partes = [{ nome: 'Tampo', w: p.comp, h: p.larg, tampo: true }];
  for (const l of Object.keys(LADOS)) {
    const b = p.bordas[l];
    if (temFaixa(b)) {
      partes.push({
        nome: `${TIPOS_BORDA[b.tipo]} · ${LADOS[l].toLowerCase()} (${acabDaBorda(p, l).toLowerCase()})`,
        titulo: `${TIPOS_BORDA[b.tipo]} · ${LADOS[l].toLowerCase()}`,
        w: compBorda(p, l), h: b.altura, tipo: b.tipo, lado: l,
      });
    }
  }
  return partes.filter(x => x.w > 0 && x.h > 0);
}
