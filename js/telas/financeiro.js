// Financeiro: condições de pagamento do pedido, parcelas e recebimentos
import { lista, achar, gravar, config } from '../db.js';
import { num, moeda, emCampo, esc, novoId, semAcento, hoje, diaBR, somarDias, somarMeses, arred } from '../util.js';
import { redesenhar, aviso, perguntar } from '../nucleo.js';
import { FORMAS } from '../padroes.js';
import { totalGeral } from '../calc.js';
import { nomeCliente } from './orcamento.js';
import { pode } from '../sinc.js';

export const formas = () => config().formas || FORMAS;
const taxaDe = nome => (formas().find(f => f.nome === nome) || {}).taxa || 0;

export const CONDICOES = { avista: 'À vista', entrada: 'Entrada + parcelas', parcelado: 'Parcelado' };
const INTERVALOS = { mensal: 'Mensal', quinzenal: 'A cada 15 dias', semanal: 'Semanal' };

const soma = (l, f = p => p.valor) => arred(l.reduce((s, x) => s + f(x), 0));
const vencimento = (inicio, intervalo, i) =>
  intervalo === 'quinzenal' ? somarDias(inicio, 15 * i) : intervalo === 'semanal' ? somarDias(inicio, 7 * i) : somarMeses(inicio, i);

// Refaz as parcelas em aberto pelas condições escolhidas. As já recebidas ficam como estão.
function gerarParcelas(o) {
  const pg = o.pagamento;
  const pagas = pg.parcelas.filter(p => p.recebidoEm);
  let resta = arred(totalGeral(o) - soma(pagas));
  const novas = [];
  const nova = (valor, venc, entrada = false) => novas.push({ id: novoId(), valor, venc, forma: pg.forma, recebidoEm: '', entrada });
  if (resta > 0) {
    if (pg.condicao === 'avista') nova(resta, pg.primeiroVenc);
    else {
      if (pg.condicao === 'entrada' && !pagas.length && pg.entrada > 0) {
        const e = Math.min(arred(pg.entrada), resta);
        nova(e, hoje(), true);
        resta = arred(resta - e);
      }
      const n = Math.max(1, Math.min(60, Math.round(pg.nParcelas) || 1));
      const base = Math.floor(resta / n * 100) / 100;
      if (resta > 0) for (let i = 0; i < n; i++) nova(i === n - 1 ? arred(resta - base * (n - 1)) : base, vencimento(pg.primeiroVenc, pg.intervalo, i));
    }
  }
  pg.parcelas = [...pagas, ...novas];
}

// Nome da parcela: "Entrada", "2/3", "À vista"; o que sobrou de um recebimento parcial leva " · resto"
function rotulos(o) {
  const ps = o.pagamento.parcelas, n = ps.filter(p => !p.entrada && !p.resto).length;
  let k = 0;
  const r = [];
  ps.forEach((p, i) => r.push(p.resto && i > 0 ? r[i - 1].replace(/ · resto$/, '') + ' · resto'
    : p.entrada ? 'Entrada' : n === 1 && !ps.some(x => x.entrada) ? 'À vista' : `${++k}/${n}`));
  return r;
}

// Situação do pagamento de um pedido (para a lista de orçamentos e o cartão)
export function situacaoPagamento(o) {
  const ps = (o.pagamento && o.pagamento.parcelas) || [];
  if (!ps.length) return { cls: 'st-rascunho', texto: 'Pagamento não definido' };
  const abertas = ps.filter(p => !p.recebidoEm), h = hoje();
  if (!abertas.length) return { cls: 'st-aprovado', texto: 'Quitado' };
  if (abertas.some(p => p.venc < h)) return { cls: 'st-perdido', texto: 'Parcela vencida' };
  return { cls: 'st-enviado', texto: `${moeda(soma(abertas))} a receber` };
}

// ---------- cartão de pagamento dentro do pedido

const opcoesForma = atual => {
  const nomes = formas().map(f => f.nome);
  if (atual && !nomes.includes(atual)) nomes.unshift(atual);
  return nomes.map(n => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
};

function listaParcelas(o) {
  const pg = o.pagamento, r = rotulos(o), h = hoje();
  const linhas = pg.parcelas.map((p, i) => {
    const pago = !!p.recebidoEm, dis = pago ? 'disabled' : '';
    const atraso = !pago && p.venc < h;
    return `<div class="parcela ${pago ? 'paga' : atraso ? 'atrasada' : ''}">
      <b class="rot">${r[i]}</b>
      <input type="date" aria-label="Vencimento" data-parc="${p.id}" data-prop="venc" value="${p.venc}" ${dis}>
      <input inputmode="decimal" aria-label="Valor" data-parc="${p.id}" data-prop="valor" value="${emCampo(p.valor)}" ${dis}>
      <select aria-label="Forma de pagamento" data-parc="${p.id}" data-prop="forma" ${dis}>${opcoesForma(p.forma)}</select>
      ${pago
        ? `<span class="recebido">Recebido ${diaBR(p.recebidoEm)} <button class="link" data-acao="pag-desfazer" data-o="${o.id}" data-p="${p.id}" data-confirma="Desfazer?">desfazer</button></span>`
        : `<button class="primario pequeno" data-acao="pag-receber" data-o="${o.id}" data-p="${p.id}">Receber</button>`}
    </div>`;
  }).join('');
  return `${linhas}<div id="parc-resumo">${resumoParcelas(o)}</div>`;
}

function resumoParcelas(o) {
  const pg = o.pagamento, total = totalGeral(o);
  const diferenca = arred(total - soma(pg.parcelas));
  return `
    <div class="resumo" style="margin-top:12px">
      <div><span>Total do pedido</span><span>${moeda(total)}</span></div>
      <div><span>Recebido</span><span>${moeda(soma(pg.parcelas.filter(p => p.recebidoEm)))}</span></div>
      <div class="forte"><span>A receber</span><span>${moeda(soma(pg.parcelas.filter(p => !p.recebidoEm)))}</span></div>
    </div>
    ${Math.abs(diferenca) >= 0.01 ? `<div class="alerta s-pendente" style="margin-top:10px">A soma das parcelas está ${diferenca > 0 ? 'faltando' : 'passando'} ${moeda(Math.abs(diferenca))} do total do pedido.
      <button class="link" data-acao="pag-refazer">Refazer as parcelas em aberto</button></div>` : ''}`;
}

export function cartaoPagamento(o) {
  if (!pode('financeiro')) return '';
  const pg = o.pagamento, s = situacaoPagamento(o);
  const campo = (prop, rotulo, html) => `<div><label for="pg-${prop}">${rotulo}</label>${html}</div>`;
  return `<div class="card" id="pagamento">
    <div class="ped-t"><b>Pagamento</b><span class="chip ${s.cls}" id="pag-chip">${s.texto}</span></div>
    <label>Condição</label>
    <div class="seg tres">${Object.keys(CONDICOES).map(c => `<button class="${pg && pg.condicao === c ? 'ativo' : ''}" data-acao="pag-condicao" data-c="${c}">${CONDICOES[c]}</button>`).join('')}</div>
    ${!pg ? '<p class="nota">Escolha a condição combinada com o cliente para gerar as parcelas.</p>' : `
    <div class="linha" style="margin-top:12px">
      ${campo('forma', 'Forma de pagamento', `<select id="pg-forma" data-pag="forma">${opcoesForma(pg.forma)}</select>`)}
      ${pg.condicao === 'entrada' ? campo('entrada', 'Entrada (R$)', `<input id="pg-entrada" inputmode="decimal" data-pag="entrada" value="${emCampo(pg.entrada)}">`) : ''}
      ${pg.condicao !== 'avista' ? campo('nParcelas', 'Parcelas', `<input id="pg-nParcelas" inputmode="numeric" data-pag="nParcelas" value="${pg.nParcelas || ''}">`) : ''}
      ${campo('primeiroVenc', pg.condicao === 'avista' ? 'Vencimento' : '1º vencimento', `<input id="pg-primeiroVenc" type="date" data-pag="primeiroVenc" value="${pg.primeiroVenc}">`)}
      ${pg.condicao !== 'avista' ? campo('intervalo', 'Intervalo', `<select id="pg-intervalo" data-pag="intervalo">${Object.keys(INTERVALOS).map(k => `<option value="${k}" ${pg.intervalo === k ? 'selected' : ''}>${INTERVALOS[k]}</option>`).join('')}</select>`) : ''}
    </div>
    <label for="pg-obs" style="margin-top:10px">Observação do pagamento</label>
    <input id="pg-obs" data-pag="obs" value="${esc(pg.obs || '')}" placeholder="Ex.: entrada no Pix, restante na entrega">
    <h3 class="sub">Parcelas</h3>
    <div id="parcelas">${listaParcelas(o)}</div>`}
  </div>`;
}

// ---------- tela Financeiro

const filtro = { grupo: 'abertas', texto: '' };
const GRUPOS = {
  abertas: { nome: 'A receber', tem: x => !x.p.recebidoEm },
  vencidas: { nome: 'Vencidas', tem: x => !x.p.recebidoEm && x.p.venc < hoje() },
  recebidas: { nome: 'Recebidas', tem: x => !!x.p.recebidoEm },
  todas: { nome: 'Todas', tem: () => true },
};

// Todas as parcelas dos pedidos aprovados
function todasParcelas() {
  return lista('orcamentos').filter(o => o.status === 'aprovado' && o.pagamento)
    .flatMap(o => { const r = rotulos(o); return o.pagamento.parcelas.map((p, i) => ({ o, p, rotulo: r[i] })); });
}

export function numerosFinanceiro() {
  const ps = todasParcelas(), h = hoje(), mes = h.slice(0, 7), ate = somarDias(h, 30);
  const abertas = ps.filter(x => !x.p.recebidoEm);
  const recebidasMes = ps.filter(x => (x.p.recebidoEm || '').slice(0, 7) === mes);
  return {
    abertas, vencidas: abertas.filter(x => x.p.venc < h),
    proximas: abertas.filter(x => x.p.venc >= h && x.p.venc <= ate),
    recebidasMes, liquidoMes: soma(recebidasMes, x => x.p.valor * (1 - taxaDe(x.p.forma) / 100)),
  };
}

const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function linhaParcela({ o, p, rotulo }) {
  const h = hoje(), pago = !!p.recebidoEm, atraso = !pago && p.venc < h;
  const quando = pago ? `Recebido em ${diaBR(p.recebidoEm)}`
    : atraso ? `Venceu em ${diaBR(p.venc)} · ${diasEntre(p.venc, h)} ${diasEntre(p.venc, h) === 1 ? 'dia' : 'dias'}`
      : p.venc === h ? 'Vence hoje' : `Vence em ${diaBR(p.venc)}`;
  const taxa = taxaDe(p.forma);
  return `<div class="card parc ${pago ? 'paga' : atraso ? 'atrasada' : ''}">
    <a class="info" href="#/o/${o.id}">
      <div class="nome">${esc(nomeCliente(o))}</div>
      <div class="det">${esc(o.numero)} · ${rotulo} · ${esc(p.forma || '')}${taxa ? ` · taxa ${String(taxa).replace('.', ',')}%` : ''}</div>
      <div class="quando">${quando}</div>
    </a>
    <div class="valor">${moeda(p.valor)}</div>
    ${pago ? '' : `<button class="primario pequeno" data-acao="pag-receber" data-o="${o.id}" data-p="${p.id}">Receber</button>`}
  </div>`;
}

function listaFinanceiro() {
  const t = semAcento(filtro.texto), g = GRUPOS[filtro.grupo];
  const itens = todasParcelas().filter(g.tem)
    .filter(x => !t || semAcento(nomeCliente(x.o) + ' ' + x.o.numero).includes(t))
    .sort((a, b) => (filtro.grupo === 'recebidas' ? b.p.recebidoEm.localeCompare(a.p.recebidoEm) : a.p.venc.localeCompare(b.p.venc)));
  if (!itens.length) return `<div class="card vazio">Nenhuma parcela em “${g.nome}”${t ? ' com essa busca' : ''}.</div>`;
  return `<p class="conta-lista">${itens.length} ${itens.length === 1 ? 'parcela' : 'parcelas'} · <b>${moeda(soma(itens, x => x.p.valor))}</b></p>` +
    itens.map(linhaParcela).join('');
}

export function telaFinanceiro() {
  const n = numerosFinanceiro(), todas = todasParcelas();
  const semPagamento = lista('orcamentos').filter(o => o.status === 'aprovado' && !(o.pagamento && o.pagamento.parcelas.length))
    .sort((a, b) => (b.statusEm || '').localeCompare(a.statusEm || ''));
  const kpi = (rotulo, valor, detalhe, cls = '') => `<div class="card kpi ${cls}"><small>${rotulo}</small><b>${valor}</b><span>${detalhe}</span></div>`;
  const qtd = (l, um, varios) => `${l.length} ${l.length === 1 ? um : varios}`;
  return {
    nav: 'receber', titulo: 'Contas a receber',
    corpo: `
      <div class="kpis">
        ${kpi('A receber', moeda(soma(n.abertas, x => x.p.valor)), qtd(n.abertas, 'parcela em aberto', 'parcelas em aberto'))}
        ${kpi('Vencido', moeda(soma(n.vencidas, x => x.p.valor)), qtd(n.vencidas, 'parcela atrasada', 'parcelas atrasadas'), n.vencidas.length ? 'alerta-kpi' : '')}
        ${kpi('Próximos 30 dias', moeda(soma(n.proximas, x => x.p.valor)), qtd(n.proximas, 'parcela', 'parcelas'))}
        ${kpi('Recebido no mês', moeda(soma(n.recebidasMes, x => x.p.valor)), `líquido de taxas ${moeda(n.liquidoMes)}`)}
      </div>
      ${semPagamento.length ? `<h2>Pedidos sem pagamento definido</h2>
        ${semPagamento.map(o => `<a class="card linha-orc" href="#/o/${o.id}">
          <div class="info"><div class="nome">${esc(nomeCliente(o))}</div><div class="det">${esc(o.numero)} · aprovado em ${diaBR(o.statusEm || o.criadoEm)}</div></div>
          <div class="valor">${moeda(totalGeral(o))}</div></a>`).join('')}` : ''}
      <h2>Parcelas</h2>
      <div class="chips">${Object.keys(GRUPOS).map(k => `<button class="${filtro.grupo === k ? 'ativo' : ''}" data-acao="fin-grupo" data-g="${k}">${GRUPOS[k].nome} <small>${todas.filter(GRUPOS[k].tem).length}</small></button>`).join('')}</div>
      <input class="busca" type="search" data-busca="fin" value="${esc(filtro.texto)}" placeholder="Buscar por cliente ou número" aria-label="Buscar parcela">
      <div id="lista-fin">${listaFinanceiro()}</div>`,
  };
}

// ---------- eventos

const pedidoDaTela = () => achar('orcamentos', location.hash.split('/')[2]);

// Atualiza a soma e o selo sem recriar os campos (não perde o foco)
function atualizarCartao(o) {
  const resumo = document.getElementById('parc-resumo'), chip = document.getElementById('pag-chip');
  if (resumo) resumo.innerHTML = resumoParcelas(o);
  if (chip) { const s = situacaoPagamento(o); chip.className = `chip ${s.cls}`; chip.textContent = s.texto; }
}

export function entrada(el) {
  if (el.dataset.busca === 'fin') {
    filtro.texto = el.value;
    document.getElementById('lista-fin').innerHTML = listaFinanceiro();
    return;
  }
  if (!el.dataset.pag && !el.dataset.parc) return;
  const o = pedidoDaTela();
  if (!o || !o.pagamento) return;
  const pg = o.pagamento;
  if (el.dataset.pag) {
    const k = el.dataset.pag;
    pg[k] = k === 'entrada' || k === 'nParcelas' ? num(el.value) : el.value;
    if (k === 'primeiroVenc' && !el.value) return;   // data sendo digitada
    // trocar a forma muda também as parcelas em aberto
    if (k === 'forma') pg.parcelas.forEach(p => { if (!p.recebidoEm) p.forma = el.value; });
    else if (k !== 'obs') gerarParcelas(o);
    gravar('orcamentos', o);
    if (k !== 'obs') { document.getElementById('parcelas').innerHTML = listaParcelas(o); atualizarCartao(o); }
    return;
  }
  const p = pg.parcelas.find(x => x.id === el.dataset.parc);
  if (!p || p.recebidoEm) return;
  if (el.dataset.prop === 'valor') p.valor = arred(num(el.value));
  else if (el.dataset.prop === 'venc') { if (!el.value) return; p.venc = el.value; }
  else p.forma = el.value;
  gravar('orcamentos', o);
  atualizarCartao(o);
}

export const acoes = {
  'fin-grupo': el => { filtro.grupo = el.dataset.g; redesenhar(); },
  'pag-condicao': el => {
    const o = pedidoDaTela();
    if (!o) return;
    const c = el.dataset.c;
    if (!o.pagamento) o.pagamento = { forma: formas()[0] ? formas()[0].nome : 'Pix', entrada: 0, nParcelas: 1, primeiroVenc: hoje(), intervalo: 'mensal', obs: '', parcelas: [] };
    const pg = o.pagamento;
    if (pg.condicao === c && pg.parcelas.length) return;
    pg.condicao = c;
    if (c === 'avista') pg.primeiroVenc = pg.primeiroVenc || hoje();
    if (c !== 'avista' && pg.nParcelas < 2) pg.nParcelas = c === 'entrada' ? 2 : 3;
    if (c !== 'avista' && pg.primeiroVenc <= hoje()) pg.primeiroVenc = somarMeses(hoje(), 1);
    if (c === 'entrada' && !pg.entrada) pg.entrada = arred(totalGeral(o) / 2);
    gerarParcelas(o);
    gravar('orcamentos', o);
    redesenhar();
  },
  'pag-refazer': () => {
    const o = pedidoDaTela();
    gerarParcelas(o);
    gravar('orcamentos', o);
    aviso('Parcelas em aberto refeitas pelo total do pedido.');
    redesenhar();
  },
  'pag-receber': async el => {
    const o = achar('orcamentos', el.dataset.o);
    const p = o && o.pagamento && o.pagamento.parcelas.find(x => x.id === el.dataset.p);
    if (!p || p.recebidoEm) return;
    const rotulo = rotulos(o)[o.pagamento.parcelas.indexOf(p)];
    const r = await perguntar({
      titulo: 'Receber parcela',
      corpo: `<p>${esc(nomeCliente(o))} · ${esc(o.numero)} · ${rotulo} · vence ${diaBR(p.venc)}</p>
        <div class="linha">
          <div><label for="rc-data">Data do recebimento</label><input id="rc-data" type="date" value="${hoje()}"></div>
          <div><label for="rc-valor">Valor recebido (R$)</label><input id="rc-valor" inputmode="decimal" value="${emCampo(p.valor)}"></div>
        </div>
        <label for="rc-forma" style="margin-top:10px">Forma</label>
        <select id="rc-forma">${opcoesForma(p.forma)}</select>
        <p class="nota" style="margin-top:8px">Se o valor for menor que a parcela, o que faltar vira uma parcela nova com o mesmo vencimento.</p>`,
      sim: 'Confirmar recebimento', nao: 'Cancelar',
      ler: d => ({ data: d.querySelector('#rc-data').value || hoje(), valor: arred(num(d.querySelector('#rc-valor').value)), forma: d.querySelector('#rc-forma').value }),
    });
    if (!r) return;
    if (r.valor <= 0) { aviso('Digite o valor recebido.'); return; }
    const falta = arred(p.valor - r.valor);
    if (falta > 0) {
      const i = o.pagamento.parcelas.indexOf(p);
      o.pagamento.parcelas.splice(i + 1, 0, { id: novoId(), valor: falta, venc: p.venc, forma: p.forma, recebidoEm: '', entrada: p.entrada, resto: true });
    }
    Object.assign(p, { valor: r.valor, recebidoEm: r.data, forma: r.forma });
    gravar('orcamentos', o);
    aviso(falta > 0 ? `Recebido ${moeda(r.valor)}. Ficou ${moeda(falta)} em aberto.` : 'Recebimento registrado.');
    redesenhar();
  },
  'pag-desfazer': el => {
    const o = achar('orcamentos', el.dataset.o);
    const p = o && o.pagamento.parcelas.find(x => x.id === el.dataset.p);
    if (!p) return;
    p.recebidoEm = '';
    gravar('orcamentos', o);
    aviso('Recebimento desfeito.');
    redesenhar();
  },
};
