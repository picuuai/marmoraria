// Relatórios: vendas, materiais, clientes e recebimentos, por período.
// Venda = orçamento aprovado, na data em que foi aprovado.
import { lista } from '../db.js';
import { moeda, m2, pct, esc, hoje, diaBR, diaLocal, somarMeses, somarDias } from '../util.js';
import { redesenhar, imprimir } from '../nucleo.js';
import { totalGeral, resultado, areaPeca, qtdDe, valorPeca } from '../calc.js';
import { nomeCliente } from './orcamento.js';
import { pode } from '../sinc.js';

export const ABAS_REL = { vendas: 'Vendas', materiais: 'Materiais', clientes: 'Clientes', recebimentos: 'Recebimentos' };

const inicioMes = d => d.slice(0, 8) + '01';
const fimMes = d => somarDias(somarMeses(inicioMes(d), 1), -1);
const PERIODOS = {
  mes: { nome: 'Este mês', de: () => inicioMes(hoje()), ate: () => hoje() },
  passado: { nome: 'Mês passado', de: () => somarMeses(inicioMes(hoje()), -1), ate: () => fimMes(somarMeses(inicioMes(hoje()), -1)) },
  ano: { nome: 'Este ano', de: () => hoje().slice(0, 4) + '-01-01', ate: () => hoje() },
  doze: { nome: 'Últimos 12 meses', de: () => somarMeses(inicioMes(hoje()), -11), ate: () => hoje() },
};
const periodo = { tipo: 'mes', de: '', ate: '' };
const intervalo = () => (periodo.tipo === 'livre' ? { de: periodo.de || hoje(), ate: periodo.ate || hoje() } : { de: PERIODOS[periodo.tipo].de(), ate: PERIODOS[periodo.tipo].ate() });

const diaVenda = o => diaLocal(o.statusEm || o.criadoEm);
const vendasEntre = (de, ate) => lista('orcamentos').filter(o => o.status === 'aprovado' && diaVenda(o) >= de && diaVenda(o) <= ate);

// Barras horizontais de uma série só (cor do tema), com o valor escrito ao lado
function barras(linhas, formato) {
  const max = Math.max(...linhas.map(l => l.valor), 0) || 1;
  return `<div class="barras">${linhas.map(l => `
    <div class="barra-l" title="${esc(l.nome)}: ${esc(formato(l.valor))}">
      <span class="barra-n">${esc(l.nome)}${l.det ? `<small>${esc(l.det)}</small>` : ''}</span>
      <span class="barra-t"><i style="width:${Math.max(0.5, l.valor / max * 100)}%"></i></span>
      <b>${formato(l.valor)}</b>
    </div>`).join('')}</div>`;
}

// Colunas por mês (últimos 12 meses), mesma cor, valor no toque/hover
function colunasMeses(valores) {
  const max = Math.max(...valores.map(v => v.valor), 0) || 1;
  return `<div class="colunas" role="img" aria-label="Vendas por mês">${valores.map(v => `
    <div class="coluna" tabindex="0" title="${v.nome}: ${moeda(v.valor)}">
      <span class="coluna-v">${v.valor ? moeda(v.valor).replace(/,\d\d$/, '') : ''}</span>
      <span class="coluna-t"><i style="height:${v.valor ? Math.max(2, v.valor / max * 100) : 0}%"></i></span>
      <small>${v.curto}</small>
    </div>`).join('')}</div>`;
}

const kpi = (r, v, d, cls = '') => `<div class="card kpi ${cls}"><small>${r}</small><b>${v}</b><span>${d}</span></div>`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function relVendas(de, ate) {
  const vendas = vendasEntre(de, ate).sort((a, b) => diaVenda(b).localeCompare(diaVenda(a)));
  const total = vendas.reduce((s, o) => s + totalGeral(o), 0);
  const lucro = vendas.reduce((s, o) => s + resultado(o).lucro, 0);
  const decididos = lista('orcamentos').filter(o => (o.status === 'aprovado' || o.status === 'perdido') && diaVenda(o) >= de && diaVenda(o) <= ate);
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const ini = somarMeses(inicioMes(hoje()), -i), mes = ini.slice(0, 7);
    meses.push({ nome: `${MESES[+mes.slice(5) - 1]}/${mes.slice(2, 4)}`, curto: MESES[+mes.slice(5) - 1], valor: lista('orcamentos').filter(o => o.status === 'aprovado' && diaVenda(o).slice(0, 7) === mes).reduce((s, o) => s + totalGeral(o), 0) });
  }
  return `
    <div class="kpis">
      ${kpi('Vendido', moeda(total), `${vendas.length} ${vendas.length === 1 ? 'pedido' : 'pedidos'}`)}
      ${kpi('Ticket médio', moeda(vendas.length ? total / vendas.length : 0), 'por pedido')}
      ${pode('custos') ? kpi('Lucro bruto', moeda(lucro), total ? `margem de ${pct(lucro / total * 100)}` : 'sem vendas') : ''}
      ${kpi('Aprovação', decididos.length ? pct(vendas.length / decididos.length * 100) : '—', `${decididos.length} ${decididos.length === 1 ? 'orçamento decidido' : 'orçamentos decididos'}`)}
    </div>
    <h2>Vendas por mês</h2>
    <div class="card">${colunasMeses(meses)}</div>
    <h2>Pedidos do período</h2>
    ${vendas.length ? `<div class="card tabela-nota"><table>
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th class="n">Valor</th>${pode('custos') ? '<th class="n">Lucro</th>' : ''}</tr></thead>
      <tbody>${vendas.map(o => `<tr><td>${diaBR(diaVenda(o))}</td><td><a href="#/o/${o.id}">${esc(o.numero)}</a></td><td>${esc(nomeCliente(o))}</td>
        <td class="n">${moeda(totalGeral(o))}</td>${pode('custos') ? `<td class="n">${moeda(resultado(o).lucro)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<div class="card vazio">Nenhuma venda no período.</div>'}`;
}

function relMateriais(de, ate) {
  const por = new Map();
  for (const o of vendasEntre(de, ate)) {
    for (const p of o.pecas) {
      const k = p.materialId || p.materialNome;
      const x = por.get(k) || { nome: p.materialNome, area: 0, valor: 0, pecas: 0 };
      x.area += areaPeca(p) * qtdDe(p);
      x.valor += valorPeca(p);
      x.pecas += qtdDe(p);
      por.set(k, x);
    }
  }
  const l = [...por.values()].sort((a, b) => b.valor - a.valor);
  const area = l.reduce((s, x) => s + x.area, 0);
  return `
    <div class="kpis">
      ${kpi('Área vendida', m2(area), `${l.reduce((s, x) => s + x.pecas, 0)} peças`)}
      ${kpi('Materiais', l.length, 'diferentes no período')}
    </div>
    <h2>Valor por material</h2>
    ${l.length ? `<div class="card">${barras(l.map(x => ({ nome: x.nome, det: m2(x.area), valor: x.valor })), moeda)}</div>
      <div class="card tabela-nota" style="margin-top:12px"><table>
        <thead><tr><th>Material</th><th class="n">Peças</th><th class="n">Área</th><th class="n">Valor</th><th class="n">R$/m²</th></tr></thead>
        <tbody>${l.map(x => `<tr><td>${esc(x.nome)}</td><td class="n">${x.pecas}</td><td class="n">${m2(x.area)}</td><td class="n">${moeda(x.valor)}</td><td class="n">${moeda(x.area ? x.valor / x.area : 0)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="card vazio">Nenhuma peça vendida no período.</div>'}`;
}

function relClientes(de, ate) {
  const por = new Map();
  for (const o of vendasEntre(de, ate)) {
    const k = o.clienteId || nomeCliente(o);
    const x = por.get(k) || { nome: nomeCliente(o), valor: 0, pedidos: 0 };
    x.valor += totalGeral(o);
    x.pedidos += 1;
    por.set(k, x);
  }
  const l = [...por.values()].sort((a, b) => b.valor - a.valor);
  const top = l.slice(0, 10), resto = l.slice(10);
  if (resto.length) top.push({ nome: `Outros ${resto.length} clientes`, valor: resto.reduce((s, x) => s + x.valor, 0), pedidos: resto.reduce((s, x) => s + x.pedidos, 0) });
  return `
    <div class="kpis">
      ${kpi('Clientes que compraram', l.length, 'no período')}
      ${kpi('Novos clientes', lista('clientes').filter(c => diaLocal(c.criadoEm) >= de && diaLocal(c.criadoEm) <= ate).length, 'cadastrados no período')}
    </div>
    <h2>Maiores clientes</h2>
    ${top.length ? `<div class="card">${barras(top.map(x => ({ nome: x.nome, det: `${x.pedidos} ${x.pedidos === 1 ? 'pedido' : 'pedidos'}`, valor: x.valor })), moeda)}</div>`
      : '<div class="card vazio">Nenhuma venda no período.</div>'}`;
}

function relRecebimentos(de, ate) {
  const parcelas = lista('orcamentos').filter(o => o.status === 'aprovado' && o.pagamento)
    .flatMap(o => o.pagamento.parcelas.map(p => ({ o, p })));
  const recebidas = parcelas.filter(x => x.p.recebidoEm && x.p.recebidoEm >= de && x.p.recebidoEm <= ate);
  const porForma = new Map();
  for (const x of recebidas) porForma.set(x.p.forma || 'Outros', (porForma.get(x.p.forma || 'Outros') || 0) + x.p.valor);
  const abertas = parcelas.filter(x => !x.p.recebidoEm);
  const vencido = abertas.filter(x => x.p.venc < hoje()).reduce((s, x) => s + x.p.valor, 0);
  // previsão: próximos 6 meses
  const prev = [];
  for (let i = 0; i < 6; i++) {
    const mes = somarMeses(inicioMes(hoje()), i).slice(0, 7);
    prev.push({ nome: `${MESES[+mes.slice(5) - 1]}/${mes.slice(2, 4)}`, valor: abertas.filter(x => x.p.venc.slice(0, 7) === mes && x.p.venc >= hoje()).reduce((s, x) => s + x.p.valor, 0) });
  }
  const total = recebidas.reduce((s, x) => s + x.p.valor, 0);
  return `
    <div class="kpis">
      ${kpi('Recebido', moeda(total), `${recebidas.length} ${recebidas.length === 1 ? 'parcela' : 'parcelas'}`)}
      ${kpi('Vencido hoje', moeda(vencido), 'parcelas atrasadas', vencido ? 'alerta-kpi' : '')}
    </div>
    <h2>Recebido por forma de pagamento</h2>
    ${porForma.size ? `<div class="card">${barras([...porForma].sort((a, b) => b[1] - a[1]).map(([nome, valor]) => ({ nome, valor })), moeda)}</div>`
      : '<div class="card vazio">Nada recebido no período.</div>'}
    <h2>A receber nos próximos meses</h2>
    <div class="card">${barras(prev, moeda)}</div>`;
}

export function telaRelatorios(aba) {
  if (!ABAS_REL[aba]) return null;
  const { de, ate } = intervalo();
  const conteudo = { vendas: relVendas, materiais: relMateriais, clientes: relClientes, recebimentos: relRecebimentos }[aba](de, ate);
  return {
    nav: 'rel-' + aba, titulo: `Relatórios · ${ABAS_REL[aba]}`,
    topo: '<button data-acao="rel-imprimir">Imprimir</button>',
    corpo: `
      <div class="filtro-periodo nao-imprime">
        <div class="chips">${Object.keys(PERIODOS).map(k => `<button class="${periodo.tipo === k ? 'ativo' : ''}" data-acao="rel-periodo" data-p="${k}">${PERIODOS[k].nome}</button>`).join('')}
          <button class="${periodo.tipo === 'livre' ? 'ativo' : ''}" data-acao="rel-periodo" data-p="livre">Escolher datas</button></div>
        ${periodo.tipo === 'livre' ? `<div class="linha" style="margin-bottom:12px">
          <div><label for="rel-de">De</label><input id="rel-de" type="date" data-rel="de" value="${de}"></div>
          <div><label for="rel-ate">Até</label><input id="rel-ate" type="date" data-rel="ate" value="${ate}"></div></div>` : ''}
      </div>
      <p class="conta-lista">Período: <b>${diaBR(de)} a ${diaBR(ate)}</b></p>
      ${conteudo}`,
  };
}

export function mudanca(el) {
  if (!el.dataset.rel || !el.value) return;
  periodo[el.dataset.rel] = el.value;
  redesenhar();
}

export const acoes = {
  'rel-periodo': el => {
    const { de, ate } = intervalo();
    periodo.tipo = el.dataset.p;
    if (periodo.tipo === 'livre') Object.assign(periodo, { de, ate });
    redesenhar();
  },
  'rel-imprimir': () => imprimir(),
};

