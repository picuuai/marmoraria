// Orçamentos: lista, tela do orçamento, escolha do tipo de peça, editor da peça e itens
import { lista, achar, gravar, excluir, config } from '../db.js';
import { num, moeda, m2, pct, emCampo, esc, novoId, agora, dataBR, semAcento } from '../util.js';
import { redesenhar, ir, aviso } from '../nucleo.js';
import { desenho, amostra } from '../desenho.js';
import { pode } from '../sinc.js';
import {
  LADOS, TIPOS_BORDA, GRUPOS, RETO, temFaixa, compBorda, areaTampo, areaBordas, areaPeca, valorMaterial,
  acabDaBorda, acabamentoMaior, fixarPercentuais, percAcab, maoObraCalc, maoObraDe, percMaoObra, maoObraAlterada,
  fatorMaoObra, valorPeca, qtdDe, totalGeral, orcDesatualizado, atualizarOrcamento, atualizarPeca, pecaDesatualizada,
} from '../calc.js';

export const STATUS = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', perdido: 'Não aprovado' };
export const chipStatus = s => `<span class="chip st-${s}">${STATUS[s] || s}</span>`;

// Grupos da lista: a tela abre nos aprovados
const GRUPOS_LISTA = {
  aprovado: { nome: 'Aprovados', tem: o => o.status === 'aprovado' },
  aberto: { nome: 'Em aberto', tem: o => o.status === 'rascunho' || o.status === 'enviado' },
  perdido: { nome: 'Não aprovados', tem: o => o.status === 'perdido' },
  todos: { nome: 'Todos', tem: () => true },
};
const filtro = { texto: '', status: 'aprovado' };
let rascunho = null;   // peça em edição (cópia; só entra no orçamento ao salvar)
let bordaSel = null;   // borda com a janela aberta no editor
let popPos = { x: 0, y: 0 };
let recalculada = false;   // a peça aberta mudou de valor por causa do cadastro

const orcDaTela = () => achar('orcamentos', location.hash.split('/')[2]);
const material = id => achar('materiais', id) || lista('materiais')[0] || { id: '', nome: 'Material removido', preco: 0, custo: 0, cor: '#b9b6b1' };

export function criarOrcamento(clienteId) {
  const cfg = config();
  const c = clienteId ? achar('clientes', clienteId) : null;
  const o = gravar('orcamentos', {
    id: novoId(), numero: 'P-' + String(cfg.proximoNumero).padStart(4, '0'), status: 'rascunho',
    clienteId: c ? c.id : null, clienteNome: c ? c.nome : '', criadoEm: agora(), validadeDias: cfg.validadeDias,
    obs: '', pecas: [], itens: [], frete: 0, desconto: 0, modoCliente: 'detalhado', imprimirResumo: true,
  });
  cfg.proximoNumero += 1;
  gravar('config', cfg);
  return o;
}

// Rascunhos acompanham o cadastro: se um preço ou percentual mudou, eles passam a usar o valor novo
export function atualizarRascunhos() {
  for (const o of lista('orcamentos')) {
    if (o.status === 'rascunho' && o.pecas.length && orcDesatualizado(o)) { atualizarOrcamento(o); gravar('orcamentos', o); }
  }
}

// ---------- lista de orçamentos

export const nomeCliente = o => (o.clienteId && achar('clientes', o.clienteId) ? achar('clientes', o.clienteId).nome : o.clienteNome) || 'Sem cliente';

const ic = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES = {
  enviar: ic('<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>'),
  imprimir: ic('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  corte: ic('<path d="M3 17L17 3l4 4L7 21z"/><path d="M14 6l2 2M11 9l2 2M8 12l2 2"/>'),
  financeiro: ic('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
};

// Atalhos do orçamento, sem precisar abrir: enviar, imprimir, corte e financeiro.
// O financeiro só aparece no aparelho com acesso a custos e lucro.
export const atalhosOrcamento = o => `
  <button data-acao="enviar-orc" data-id="${o.id}">${ICONES.enviar}Enviar</button>
  <button data-acao="imprimir-orc" data-id="${o.id}">${ICONES.imprimir}Imprimir</button>
  <a class="botao" href="#/o/${o.id}/corte">${ICONES.corte}Corte</a>
  ${pode('custos') ? `<a class="botao" href="#/o/${o.id}/interna">${ICONES.financeiro}Financeiro</a>` : ''}`;

export function linhaOrcamento(o) {
  return `<div class="card orc">
    <a class="linha-orc" href="#/o/${o.id}">
      <div class="info"><div class="nome">${esc(nomeCliente(o))}</div>
        <div class="det">${esc(o.numero)} · ${dataBR(o.criadoEm)} · ${o.pecas.length} ${o.pecas.length === 1 ? 'pedra' : 'pedras'}</div></div>
      ${chipStatus(o.status)}
      <div class="valor">${moeda(totalGeral(o))}</div>
    </a>
    <div class="acoes-orc">${atalhosOrcamento(o)}</div>
  </div>`;
}

function listaFiltrada() {
  const t = semAcento(filtro.texto);
  const g = GRUPOS_LISTA[filtro.status];
  const itens = lista('orcamentos')
    .filter(g.tem)
    .filter(o => !t || semAcento(nomeCliente(o) + ' ' + o.numero).includes(t))
    .sort((a, b) => (b.statusEm || b.criadoEm).localeCompare(a.statusEm || a.criadoEm));
  if (!itens.length) {
    return `<div class="card vazio">${lista('orcamentos').length
      ? `Nenhum orçamento em “${g.nome}”${t ? ' com essa busca' : ''}.`
      : 'Nenhum orçamento ainda.<br>Toque em “Novo orçamento” para começar.'}</div>`;
  }
  const soma = itens.reduce((s, o) => s + totalGeral(o), 0);
  return `<p class="conta-lista">${itens.length} ${itens.length === 1 ? 'orçamento' : 'orçamentos'} · <b>${moeda(soma)}</b></p>` +
    itens.map(linhaOrcamento).join('');
}

export function telaLista() {
  const todos = lista('orcamentos');
  return {
    nav: 'orcamentos', titulo: 'Orçamentos',
    topo: '<button class="primario" data-acao="novo-orc">+ Novo orçamento</button>',
    corpo: `
      <div class="chips">
        ${Object.keys(GRUPOS_LISTA).map(s =>
          `<button class="${filtro.status === s ? 'ativo' : ''}" data-acao="filtro-status" data-status="${s}">${GRUPOS_LISTA[s].nome} <small>${todos.filter(GRUPOS_LISTA[s].tem).length}</small></button>`).join('')}
      </div>
      <input class="busca" type="search" data-busca="orc" value="${esc(filtro.texto)}" placeholder="Buscar por cliente ou número" aria-label="Buscar orçamento">
      <div id="lista-orc">${listaFiltrada()}</div>`,
  };
}

// Situação do orçamento: o que aconteceu e os botões do próximo passo
function cartaoSituacao(o) {
  const quando = o.statusEm ? ` em ${dataBR(o.statusEm)}` : '';
  const botao = (status, rotulo, cls = '') => `<button class="${cls}" data-acao="situacao" data-status="${status}">${rotulo}</button>`;
  const textos = {
    rascunho: 'Ainda não foi enviado ao cliente.',
    enviado: `Enviado ao cliente${quando}. Aguardando resposta.`,
    aprovado: `Aprovado pelo cliente${quando}. Orçamento aprovado não pode ser alterado.`,
    perdido: `Não aprovado${quando}.`,
  };
  const botoes = {
    rascunho: botao('enviado', 'Marcar como enviado') + botao('aprovado', 'Aprovar', 'primario') + botao('perdido', 'Não aprovado', 'perigo'),
    enviado: botao('aprovado', 'Aprovar', 'primario') + botao('perdido', 'Não aprovado', 'perigo'),
    aprovado: '<button data-acao="situacao" data-status="enviado" data-confirma="Tocar de novo para reabrir">Reabrir para alterar</button>',
    perdido: botao('aprovado', 'Aprovar', 'primario') + botao('enviado', 'Reabrir'),
  };
  return `<div class="card situacao st-${o.status}">
    <div class="situacao-t">${chipStatus(o.status)}<span>${textos[o.status]}</span></div>
    <div class="linha">${botoes[o.status]}</div>
  </div>`;
}

// ---------- tela do orçamento

// Orçamento aprovado fica travado: nada nele pode ser alterado até ser reaberto
export const travado = o => o.status === 'aprovado';

function secaoItens(o, tipo) {
  const g = GRUPOS[tipo], fixo = travado(o), dis = fixo ? 'disabled' : '';
  const linhas = o.itens.map((it, i) => it.tipo !== tipo ? '' : `
    <div class="item-linha">
      <input class="nome-item" aria-label="Nome do ${g.um}" data-item="${i}" data-prop="nome" value="${esc(it.nome)}" placeholder="Nome do ${g.um}" ${dis}>
      <input aria-label="Quantidade" inputmode="numeric" data-item="${i}" data-prop="qtd" value="${it.qtd || ''}" ${dis}>
      <span>×</span>
      <input aria-label="Preço unitário em reais" inputmode="decimal" data-item="${i}" data-prop="preco" value="${emCampo(it.preco)}" placeholder="0,00" ${dis}>
      <b id="sub-${i}">${moeda(it.preco * it.qtd)}</b>
      ${fixo ? '<span></span>' : `<button class="perigo" aria-label="Remover ${esc(it.nome)}" data-acao="rem-item" data-i="${i}">✕</button>`}
    </div>`).join('');
  if (fixo && !linhas) return '';
  return `
    <h2>${g.varios}</h2>
    ${linhas ? `<div class="card">${linhas}</div>` : ''}
    ${fixo ? '' : `<a class="botao largo tracejado" href="#/o/${o.id}/item/${tipo}">+ Adicionar ${g.um}</a>`}`;
}

export function telaOrcamento(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  rascunho = null; bordaSel = null;
  // rascunho acompanha o cadastro; depois de enviado, os preços só mudam se o usuário pedir
  const mudou = o.pecas.length > 0 && orcDesatualizado(o);
  if (mudou && o.status === 'rascunho') { atualizarOrcamento(o); gravar('orcamentos', o); }
  const avisoPrecos = mudou && o.status === 'enviado' ? `
    <div class="card aviso-precos">
      <div><b>Os preços do cadastro mudaram</b><span>Este orçamento já foi enviado e continua com os valores do dia em que foi feito.</span></div>
      <button data-acao="atualizar-precos" data-confirma="Tocar de novo para atualizar">Atualizar preços</button>
    </div>` : '';
  const clientes = lista('clientes').sort((a, b) => a.nome.localeCompare(b.nome));
  const fixo = travado(o), dis = fixo ? 'disabled' : '';
  const pecas = o.pecas.map(p => `
    <${fixo ? 'div' : `a href="#/o/${o.id}/p/${p.id}"`} class="card peca">
      <div class="mini">${desenho(p, { largura: 96, simples: true })}</div>
      <div class="info">
        <div class="nome">${qtdDe(p) > 1 ? qtdDe(p) + ' × ' : ''}${esc(p.nome)}</div>
        <div class="det">${esc(p.materialNome)} · ${m2(areaPeca(p) * qtdDe(p))}</div>
      </div>
      <div class="valor">${moeda(valorPeca(p))}</div>
    </${fixo ? 'div' : 'a'}>`).join('');
  return {
    nav: 'orcamentos', titulo: `Orçamento ${esc(o.numero)}`, voltar: '#/orcamentos',
    corpo: `
      ${cartaoSituacao(o)}
      ${avisoPrecos}
      <div class="card">
        <label for="cliente">Cliente</label>
        <select id="cliente" data-campo="clienteId" ${dis}>
          <option value="">— sem cliente —</option>
          ${clientes.map(c => `<option value="${c.id}" ${c.id === o.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
        <details class="novo-cliente" ${fixo ? 'hidden' : ''}>
          <summary>Cadastrar cliente novo</summary>
          <div class="linha">
            <div><label for="nc-nome">Nome</label><input id="nc-nome" autocomplete="off"></div>
            <div><label for="nc-fone">Telefone</label><input id="nc-fone" inputmode="tel" autocomplete="off"></div>
          </div>
          <button class="primario" style="margin-top:10px" data-acao="cliente-rapido">Salvar e usar neste orçamento</button>
        </details>
      </div>
      <h2>Pedras</h2>
      ${pecas || '<div class="card vazio">Nenhuma peça ainda.</div>'}
      ${fixo ? '' : `<a class="botao largo tracejado" href="#/o/${o.id}/nova">+ Adicionar peça</a>`}
      ${secaoItens(o, 'produto')}
      ${secaoItens(o, 'servico')}
      <h2>Extras</h2>
      <div class="card">
        <div class="linha">
          <div><label for="frete">Frete / instalação (R$)</label>
            <input id="frete" inputmode="decimal" data-campo="frete" data-num value="${emCampo(o.frete)}" placeholder="0,00" ${dis}></div>
          <div><label for="desconto">Desconto (R$)</label>
            <input id="desconto" inputmode="decimal" data-campo="desconto" data-num value="${emCampo(o.desconto)}" placeholder="0,00" ${dis}></div>
          <div><label for="validade">Validade (dias)</label>
            <input id="validade" inputmode="numeric" data-campo="validadeDias" data-num value="${o.validadeDias || ''}" ${dis}></div>
        </div>
        <label for="obs" style="margin-top:10px">Observações (aparecem no orçamento do cliente)</label>
        <textarea id="obs" rows="2" data-campo="obs" ${dis}>${esc(o.obs)}</textarea>
      </div>
      <h2>Folhas</h2>
      <div class="grade-botoes">
        <button class="botao" data-acao="enviar-orc" data-id="${o.id}"><b>Enviar ao cliente</b><small>PDF pelo WhatsApp</small></button>
        <a class="botao" href="#/o/${o.id}/cliente"><b>Orçamento do cliente</b><small>Ver, imprimir ou PDF</small></a>
        <a class="botao" href="#/o/${o.id}/corte"><b>Folha de corte</b><small>Desenhos e medidas</small></a>
        ${pode('custos') ? `<a class="botao" href="#/o/${o.id}/interna"><b>Financeiro</b><small>Custos e lucro</small></a>` : ''}
      </div>
      <h2>Este orçamento</h2>
      <div class="linha">
        <button data-acao="duplicar-orc">Duplicar</button>
        ${fixo ? '' : '<button class="perigo" data-acao="excluir-orc" data-confirma="Tocar de novo para excluir">Excluir</button>'}
      </div>`,
    rodape: `<div class="total"><small>Total do orçamento</small><b id="total">${moeda(totalGeral(o))}</b></div>
      <a class="botao primario" href="#/o/${o.id}/cliente">Ver orçamento</a>`,
  };
}

// ---------- escolha do tipo de peça

function novaPeca(o, t) {
  const cfg = config();
  const anterior = o.pecas[o.pecas.length - 1];
  const m = material(anterior ? anterior.materialId : '');
  const acabPadrao = lista('acabamentos').some(a => a.nome === RETO) ? RETO : (lista('acabamentos')[0] || { nome: RETO }).nome;
  const bordas = {};
  for (const l of Object.keys(LADOS)) {
    const b = (t.bordas && t.bordas[l]) || { tipo: 'nenhum', altura: 0 };
    const padrao = b.tipo === 'espelho' ? cfg.alturaEspelho : b.tipo === 'saia' ? cfg.alturaSaia : 0;
    bordas[l] = { tipo: b.tipo, altura: b.altura || padrao, acab: acabPadrao };
  }
  return {
    id: novoId(), tipoId: t.id, nome: t.nome, qtd: 1,
    materialId: m.id, materialNome: m.nome, precoM2: m.preco, custoM2: m.custo, cor: m.cor,
    moFator: null, moPercSem: 0, comp: t.comp, larg: t.larg, bordas,
  };
}

export function telaTipos(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  if (travado(o)) return telaOrcamento(id);
  const tipos = lista('tipos').sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return {
    nav: 'orcamentos', titulo: 'Que peça é?', voltar: `#/o/${id}`,
    corpo: `<div class="tipos">
      ${tipos.map(t => `<button data-acao="criar-peca" data-tipo="${t.id}">
        <span class="mini">${desenho(novaPeca(o, t), { largura: 110, simples: true })}</span>
        <b>${esc(t.nome)}</b>
        <small>${['Tampo', ...Object.values(t.bordas || {}).filter(b => b.tipo !== 'nenhum').map(b => b.tipo)].join(' + ')}</small></button>`).join('')}
      </div>`,
  };
}

// ---------- editor da peça

const amostras = p => lista('materiais').map(m => `
  <button class="${m.id === p.materialId ? 'ativo' : ''}" data-acao="material" data-id="${m.id}">
    ${amostra(m)}${esc(m.nome)}<small>${moeda(m.preco)}/m²</small>
  </button>`).join('');

// Janela que abre ao lado da borda tocada
function janelaBorda(p) {
  if (!bordaSel) return '';
  const b = p.bordas[bordaSel];
  let campo = '';
  if (temFaixa(b)) {
    campo = `<label for="altura">Altura ${b.tipo === 'espelho' ? 'do espelho' : 'da saia'} (cm)</label>
      <input id="altura" inputmode="decimal" data-borda="altura" value="${b.altura || ''}">
      <div class="nota">${b.tipo === 'saia' ? 'Junção em meia esquadria' : `Acabamento: ${esc(acabDaBorda(p, bordaSel).toLowerCase())} (acompanha o da peça)`}</div>`;
  } else if (b.tipo === 'acabamento') {
    const nomes = lista('acabamentos').map(a => a.nome);
    if (b.acab && !nomes.includes(b.acab)) nomes.unshift(b.acab);
    campo = `<label for="acab">Tipo de acabamento</label>
      <select id="acab" data-borda="acab">
        ${nomes.map(n => `<option value="${esc(n)}" ${n === b.acab ? 'selected' : ''}>${esc(n)} — ${pct(percAcab(n, p))}</option>`).join('')}
      </select>`;
  }
  return `
    <div class="pop" id="pop" role="dialog" aria-label="Borda ${LADOS[bordaSel]}" style="left:${popPos.x}px;top:${popPos.y}px">
      <div class="pop-t"><b>${LADOS[bordaSel]}</b> · ${compBorda(p, bordaSel)} cm</div>
      <div class="menu">
        ${Object.keys(TIPOS_BORDA).map(t =>
          `<button class="${b.tipo === t ? 'ativo' : ''}" data-acao="tipo-borda" data-tipo="${t}"><span class="bola"></span>${TIPOS_BORDA[t]}</button>`).join('')}
      </div>
      ${campo}
      <button class="primario largo" data-acao="fechar-borda">OK</button>
    </div>`;
}

function notaMaoObra(p) {
  const calc = maoObraCalc(p), maior = acabamentoMaior(p);
  if (maoObraAlterada(p)) {
    return `Alterado neste orçamento: ${pct(percMaoObra(p))} sobre o material.
      <button class="link" data-acao="mo-auto">Voltar ao calculado (${moeda(calc)})</button>`;
  }
  return calc > 0
    ? `${pct(maior.perc)} sobre o material, pelo acabamento ${esc(maior.nome.toLowerCase())}.`
    : 'Peça sem acabamento: sem mão de obra calculada. Digite o valor se houver.';
}

function resumoPeca(p) {
  const q = qtdDe(p);
  return `
    <div><span>Tampo (${p.comp} × ${p.larg} cm)</span><span>${m2(areaTampo(p))}</span></div>
    <div><span>Espelhos e saias</span><span>${m2(areaBordas(p))}</span></div>
    <div><span>Área total</span><span><b>${m2(areaPeca(p))}</b></span></div>
    <div><span>Material (× ${moeda(p.precoM2)}/m²)</span><span>${moeda(valorMaterial(p))}</span></div>
    <div><span>Mão de obra (${pct(percMaoObra(p))})</span><span>${moeda(maoObraDe(p))}</span></div>
    ${q > 1 ? `<div><span>Quantidade</span><span>× ${q}</span></div>` : ''}
    <div class="forte"><span>Valor ${q > 1 ? 'das peças' : 'da peça'}</span><span>${moeda(valorPeca(p))}</span></div>`;
}

export function telaPeca(id, pid) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  if (travado(o)) return telaOrcamento(id);
  if (!rascunho || rascunho.id !== pid) {
    const salva = o.pecas.find(p => p.id === pid);
    if (!salva) return null;
    rascunho = JSON.parse(JSON.stringify(salva));
    bordaSel = null;
    // editar uma peça é recalcular com os preços de hoje: material e percentuais vêm do cadastro atual
    recalculada = pecaDesatualizada(rascunho);
    atualizarPeca(rascunho);
  }
  const p = rascunho;
  const existe = o.pecas.some(x => x.id === p.id);
  return {
    nav: 'orcamentos', titulo: existe ? 'Editar peça' : 'Nova peça', voltar: `#/o/${id}`,
    corpo: `
      <div class="card">
        <label for="nome">Nome da peça</label>
        <input id="nome" data-peca="nome" value="${esc(p.nome)}">
        <div class="linha">
          <div><label for="comp">Comprimento (cm)</label>
            <input id="comp" inputmode="decimal" data-peca="comp" value="${p.comp || ''}"></div>
          <div><label for="larg">Largura (cm)</label>
            <input id="larg" inputmode="decimal" data-peca="larg" value="${p.larg || ''}"></div>
          <div><label for="qtd">Quantidade</label>
            <input id="qtd" inputmode="numeric" data-peca="qtd" value="${p.qtd || ''}"></div>
        </div>
      </div>
      <h2>Material</h2>
      <div class="mats" id="mats">${amostras(p)}</div>
      <h2>Bordas</h2>
      <div class="card">
        <div id="area">
          <div id="desenho">${desenho(p, { interativo: true, sel: bordaSel })}</div>
          <div id="popbox">${janelaBorda(p)}</div>
        </div>
        <p class="dica">Toque em uma borda do desenho para escolher espelho, saia ou acabamento.</p>
      </div>
      <h2>Valor</h2>
      <div class="card">
        <label for="mo">Mão de obra desta peça (R$)</label>
        <input id="mo" inputmode="decimal" data-peca="maoObra" value="${emCampo(maoObraDe(p)) || '0,00'}">
        <div class="nota" id="mo-nota">${notaMaoObra(p)}</div>
        ${existe && recalculada ? '<div class="alerta s-pendente" style="margin-top:10px">Os preços do cadastro mudaram depois que esta peça foi salva. Os valores abaixo já usam os preços atuais e passam a valer quando você salvar a peça.</div>' : ''}
        <div class="resumo" id="resumo" style="margin-top:12px">${resumoPeca(p)}</div>
      </div>
      <div class="linha">
        ${existe ? '<button class="perigo" data-acao="excluir-peca" data-confirma="Tocar de novo para excluir">Excluir peça</button>' : ''}
        <button class="primario" data-acao="salvar-peca">Salvar peça</button>
      </div>`,
  };
}

// Atualiza só o desenho e os valores, sem recriar os campos (não perde o foco)
function atualizarEditor(comJanela) {
  document.getElementById('desenho').innerHTML = desenho(rascunho, { interativo: true, sel: bordaSel });
  document.getElementById('resumo').innerHTML = resumoPeca(rascunho);
  // o valor da mão de obra acompanha as medidas e o acabamento, menos enquanto é digitado
  const mo = document.getElementById('mo');
  if (document.activeElement !== mo) mo.value = emCampo(maoObraDe(rascunho)) || '0,00';
  document.getElementById('mo-nota').innerHTML = notaMaoObra(rascunho);
  if (comJanela) {
    document.getElementById('popbox').innerHTML = janelaBorda(rascunho);
    const altura = document.getElementById('altura'), pop = document.getElementById('pop');
    if (altura) { altura.focus({ preventScroll: true }); altura.select(); }
    if (pop) pop.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function fecharBorda() {
  bordaSel = null;
  atualizarEditor(true);
}

// ---------- escolha de produto ou serviço

export function telaItens(id, tipo) {
  const o = achar('orcamentos', id);
  if (!o || !GRUPOS[tipo]) return null;
  if (travado(o)) return telaOrcamento(id);
  return {
    nav: 'orcamentos', titulo: `Adicionar ${GRUPOS[tipo].um}`, voltar: `#/o/${id}`,
    corpo: `<div class="tipos">
        ${lista('catalogo').filter(c => c.tipo === tipo).map(c => `
          <button data-acao="add-item" data-tipo="${tipo}" data-id="${c.id}"><b>${esc(c.nome)}</b><small>${moeda(c.preco)}</small></button>`).join('')}
        <button data-acao="add-item" data-tipo="${tipo}" data-id=""><b>Outro</b><small>Digitar nome e preço</small></button>
      </div>
      <p class="dica">Os itens desta lista vêm do <a href="#/cadastros/${tipo === 'produto' ? 'produtos' : 'servicos'}">cadastro de ${GRUPOS[tipo].varios.toLowerCase()}</a>.</p>`,
  };
}

// ---------- eventos

export function aoClicar(e) {
  // tocar fora da janela da borda fecha a janela
  const el = e.target.closest('[data-acao]');
  if (rascunho && bordaSel && !(el && el.dataset.acao === 'borda') && !e.target.closest('#pop') && document.getElementById('popbox')) fecharBorda();
}

export function tecla(e) {
  if (!rascunho || !bordaSel) return;
  if (e.key === 'Escape' || (e.key === 'Enter' && e.target.id === 'altura')) fecharBorda();
}

export function entrada(el) {
  if (el.dataset.busca === 'orc') {
    filtro.texto = el.value;
    document.getElementById('lista-orc').innerHTML = listaFiltrada();
    return;
  }
  const o = orcDaTela();
  if (!o || travado(o)) return;
  if (el.dataset.campo) {
    const c = el.dataset.campo;
    o[c] = 'num' in el.dataset ? num(el.value) : el.value;
    if (c === 'clienteId') { o.clienteId = el.value || null; o.clienteNome = el.value ? achar('clientes', el.value).nome : ''; }
    gravar('orcamentos', o);
    document.getElementById('total').textContent = moeda(totalGeral(o));
  } else if (el.dataset.item) {
    const it = o.itens[+el.dataset.item], prop = el.dataset.prop;
    it[prop] = prop === 'nome' ? el.value : num(el.value);
    gravar('orcamentos', o);
    document.getElementById('sub-' + el.dataset.item).textContent = moeda(it.preco * it.qtd);
    document.getElementById('total').textContent = moeda(totalGeral(o));
  } else if (el.dataset.peca && rascunho) {
    const c = el.dataset.peca;
    if (c === 'maoObra') {
      // valor digitado vira o ajuste desta peça neste orçamento
      const mat = valorMaterial(rascunho), calc = maoObraCalc(rascunho);
      if (calc > 0) rascunho.moFator = num(el.value) / calc;
      else rascunho.moPercSem = mat > 0 ? num(el.value) / mat * 100 : 0;
    } else {
      rascunho[c] = c === 'nome' ? el.value : num(el.value);
    }
    atualizarEditor();
  } else if (el.dataset.borda && rascunho && bordaSel) {
    const b = rascunho.bordas[bordaSel];
    if (el.dataset.borda === 'altura') b.altura = num(el.value); else b.acab = el.value;
    atualizarEditor();
  }
}

export const acoes = {
  'novo-orc': () => ir('#/o/' + criarOrcamento().id),
  'filtro-status': el => { filtro.status = el.dataset.status; redesenhar(); },
  'atualizar-precos': () => {
    const o = orcDaTela();
    atualizarOrcamento(o);
    gravar('orcamentos', o);
    aviso('Preços atualizados pelo cadastro.');
    redesenhar();
  },
  'situacao': el => {
    const o = orcDaTela();
    o.status = el.dataset.status;
    o.statusEm = agora();   // data usada na lista e nos números do mês
    gravar('orcamentos', o);
    aviso({ enviado: 'Marcado como enviado.', aprovado: 'Orçamento aprovado.', perdido: 'Marcado como não aprovado.' }[o.status]);
    redesenhar();
  },

  'cliente-rapido': () => {
    const o = orcDaTela(), nome = document.getElementById('nc-nome').value.trim();
    if (!nome) { aviso('Digite o nome do cliente.'); return; }
    const c = gravar('clientes', { id: novoId(), nome, telefone: document.getElementById('nc-fone').value.trim(), endereco: '', obs: '', criadoEm: agora() });
    o.clienteId = c.id; o.clienteNome = c.nome;
    gravar('orcamentos', o);
    aviso('Cliente cadastrado.');
    redesenhar();
  },
  'duplicar-orc': () => {
    const o = orcDaTela(), novo = criarOrcamento(o.clienteId);
    Object.assign(novo, JSON.parse(JSON.stringify({
      clienteNome: o.clienteNome, validadeDias: o.validadeDias, obs: o.obs, frete: o.frete, desconto: o.desconto,
      modoCliente: o.modoCliente, imprimirResumo: o.imprimirResumo,
      pecas: o.pecas.map(p => ({ ...p, id: novoId() })), itens: o.itens.map(it => ({ ...it, id: novoId() })),
    })));
    gravar('orcamentos', novo);
    aviso(`Cópia criada: ${novo.numero}.`);
    ir('#/o/' + novo.id);
  },
  'excluir-orc': () => { excluir('orcamentos', orcDaTela().id); aviso('Orçamento excluído.'); ir('#/orcamentos'); },

  'criar-peca': el => {
    const o = orcDaTela();
    // a peça nova só entra no orçamento ao salvar; até lá vive no rascunho
    rascunho = novaPeca(o, achar('tipos', el.dataset.tipo));
    bordaSel = null;
    ir(`#/o/${o.id}/p/${rascunho.id}`);
  },
  'material': el => {
    const m = material(el.dataset.id);
    Object.assign(rascunho, { materialId: m.id, materialNome: m.nome, precoM2: m.preco, custoM2: m.custo, cor: m.cor });
    document.getElementById('mats').innerHTML = amostras(rascunho);
    atualizarEditor();
  },
  'borda': el => {
    const area = document.getElementById('area').getBoundingClientRect(), r = el.getBoundingClientRect();
    popPos = {
      x: Math.round(Math.min(Math.max(r.left + r.width / 2 - area.left - 125, 0), Math.max(area.width - 250, 0))),
      y: Math.round(r.bottom - area.top + 8),
    };
    bordaSel = el.dataset.lado;
    atualizarEditor(true);
  },
  'tipo-borda': el => {
    const b = rascunho.bordas[bordaSel], t = el.dataset.tipo, cfg = config();
    if (t !== b.tipo && t === 'espelho') b.altura = cfg.alturaEspelho;
    if (t !== b.tipo && t === 'saia') b.altura = cfg.alturaSaia;
    const nomes = lista('acabamentos').map(a => a.nome);
    if (t === 'acabamento' && !nomes.includes(b.acab) && nomes.length) b.acab = nomes[0];
    b.tipo = t;
    if (t === 'nenhum') fecharBorda(); else atualizarEditor(true);
  },
  'fechar-borda': () => fecharBorda(),
  'mo-auto': () => { rascunho.moFator = null; rascunho.moPercSem = 0; atualizarEditor(); },
  'salvar-peca': () => {
    const o = orcDaTela();
    if (!rascunho.qtd) rascunho.qtd = 1;
    fixarPercentuais(rascunho);
    const i = o.pecas.findIndex(p => p.id === rascunho.id);
    if (i >= 0) o.pecas[i] = rascunho; else o.pecas.push(rascunho);
    gravar('orcamentos', o);
    rascunho = null; bordaSel = null;
    ir('#/o/' + o.id);
  },
  'excluir-peca': () => {
    const o = orcDaTela();
    o.pecas = o.pecas.filter(p => p.id !== rascunho.id);
    gravar('orcamentos', o);
    rascunho = null; bordaSel = null;
    ir('#/o/' + o.id);
  },

  'add-item': el => {
    // o orçamento guarda nome, preço e custo do dia; repetir o mesmo item soma a quantidade
    const o = orcDaTela(), c = achar('catalogo', el.dataset.id);
    const ja = c && o.itens.find(it => it.catId === c.id);
    if (ja) ja.qtd += 1;
    else if (c) o.itens.push({ id: novoId(), catId: c.id, tipo: c.tipo, nome: c.nome, preco: c.preco, custo: c.custo || 0, qtd: 1 });
    else o.itens.push({ id: novoId(), catId: null, tipo: el.dataset.tipo, nome: '', preco: 0, custo: 0, qtd: 1 });
    gravar('orcamentos', o);
    ir('#/o/' + o.id);
  },
  'rem-item': el => {
    const o = orcDaTela();
    o.itens.splice(+el.dataset.i, 1);
    gravar('orcamentos', o);
    redesenhar();
  },
};

// Nenhuma destas ações vale em orçamento aprovado (os botões somem da tela; isto é a segunda trava)
for (const nome of ['atualizar-precos', 'cliente-rapido', 'excluir-orc', 'criar-peca', 'salvar-peca', 'excluir-peca', 'add-item', 'rem-item']) {
  const acao = acoes[nome];
  acoes[nome] = (...args) => {
    const o = orcDaTela();
    if (o && travado(o)) { aviso('Orçamento aprovado não pode ser alterado. Reabra para alterar.'); return; }
    return acao(...args);
  };
}
