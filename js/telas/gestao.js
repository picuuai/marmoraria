// Início, clientes, cadastros e ajustes
import { lista, achar, gravar, excluir, config, exportar, importar } from '../db.js';
import { num, moeda, pct, emCampo, esc, novoId, agora, semAcento } from '../util.js';
import { redesenhar, ir, aviso, aplicarTema, temaSalvo, salvarTema, fundoSalvo, salvarFundo } from '../nucleo.js';
import { logo, prepararLogo } from '../marca.js';
import { amostra, atualizarTexturas } from '../desenho.js';
import { LADOS, TIPOS_BORDA, RETO, ESQUADRIA, totalGeral, resultado } from '../calc.js';
import { criarOrcamento, linhaOrcamento } from './orcamento.js';
import { cartao as cartaoSinc, carregarAparelhos, pode } from '../sinc.js';

let buscaCliente = '';
let focar = null;   // id do registro recém-criado, para pôr o cursor no nome

// ---------- início

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export function telaInicio() {
  const orcs = lista('orcamentos');
  const mes = new Date().toISOString().slice(0, 7);
  const abertos = orcs.filter(o => o.status === 'rascunho' || o.status === 'enviado');
  const aprovadosMes = orcs.filter(o => o.status === 'aprovado' && (o.statusEm || o.criadoEm).slice(0, 7) === mes);
  const decididos = orcs.filter(o => o.status === 'aprovado' || o.status === 'perdido');
  const soma = (l, f) => l.reduce((s, o) => s + f(o), 0);
  const kpi = (rotulo, valor, detalhe) => `<div class="card kpi"><small>${rotulo}</small><b>${valor}</b><span>${detalhe}</span></div>`;
  const recentes = orcs.slice().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).slice(0, 5);
  return {
    nav: 'inicio', titulo: 'Início',
    topo: pode('orcamentos') ? '<button class="primario" data-acao="novo-orc">+ Novo orçamento</button>' : '',
    corpo: `
      <div class="heroi">
        ${logo('grande')}
        <div>
          <small>${saudacao()}</small>
          <b>${esc(config().empresa)}</b>
          <span>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
      </div>
      ${pode('orcamentos') ? '' : '<div class="card vazio">Este aparelho não tem acesso aos orçamentos.</div>'}
      <div class="kpis" ${pode('orcamentos') ? '' : 'hidden'}>
        ${kpi('Em aberto', moeda(soma(abertos, totalGeral)), `${abertos.length} ${abertos.length === 1 ? 'orçamento' : 'orçamentos'} aguardando`)}
        ${kpi('Aprovado no mês', moeda(soma(aprovadosMes, totalGeral)), `${aprovadosMes.length} ${aprovadosMes.length === 1 ? 'orçamento' : 'orçamentos'}`)}
        ${pode('custos') ? kpi('Lucro bruto no mês', moeda(soma(aprovadosMes, o => resultado(o).lucro)), 'dos orçamentos aprovados') : ''}
        ${kpi('Taxa de aprovação', decididos.length ? pct(decididos.filter(o => o.status === 'aprovado').length / decididos.length * 100) : '—', `${decididos.length} ${decididos.length === 1 ? 'orçamento decidido' : 'orçamentos decididos'}`)}
      </div>
      ${pode('orcamentos') ? `<h2>Últimos orçamentos</h2>
      ${recentes.map(linhaOrcamento).join('') || '<div class="card vazio">Nenhum orçamento ainda.<br>Toque em “Novo orçamento” para começar.</div>'}
      ${orcs.length > 5 ? '<a class="botao largo" href="#/orcamentos">Ver todos</a>' : ''}` : ''}`,
  };
}

// ---------- clientes

function listaClientes() {
  const t = semAcento(buscaCliente);
  const orcs = lista('orcamentos');
  const itens = lista('clientes')
    .filter(c => !t || semAcento(c.nome + ' ' + (c.telefone || '')).includes(t))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return itens.map(c => {
    const n = orcs.filter(o => o.clienteId === c.id).length;
    return `<a class="card linha-orc" href="#/cliente/${c.id}">
      <div class="avatar">${esc((c.nome || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="info"><div class="nome">${esc(c.nome)}</div><div class="det">${esc(c.telefone || 'sem telefone')}</div></div>
      <div class="det">${n} ${n === 1 ? 'orçamento' : 'orçamentos'}</div>
    </a>`;
  }).join('') || `<div class="card vazio">${lista('clientes').length ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente cadastrado.'}</div>`;
}

export function telaClientes() {
  return {
    nav: 'clientes', titulo: 'Clientes',
    topo: '<a class="botao primario" href="#/cliente/novo">+ Novo cliente</a>',
    corpo: `
      <input class="busca" type="search" data-busca="cli" value="${esc(buscaCliente)}" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente">
      <div id="lista-cli">${listaClientes()}</div>`,
  };
}

export function telaCliente(id) {
  const novo = id === 'novo';
  const c = novo ? { id: '', nome: '', telefone: '', endereco: '', obs: '' } : achar('clientes', id);
  if (!c) return null;
  const orcs = novo ? [] : lista('orcamentos').filter(o => o.clienteId === c.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const campo = (prop, rotulo, extra = '') => `<label for="c-${prop}">${rotulo}</label>
    <input id="c-${prop}" ${novo ? '' : `data-cad="clientes" data-id="${c.id}" data-prop="${prop}"`} value="${esc(c[prop])}" ${extra}>`;
  return {
    nav: 'clientes', titulo: novo ? 'Novo cliente' : esc(c.nome) || 'Cliente', voltar: '#/clientes',
    corpo: `
      <div class="card campos">
        ${campo('nome', 'Nome', 'autocomplete="off"')}
        ${campo('telefone', 'Telefone / WhatsApp', 'inputmode="tel" autocomplete="off"')}
        ${campo('endereco', 'Endereço da obra', 'autocomplete="off"')}
        ${campo('obs', 'Observações')}
        ${novo ? '<button class="primario largo" style="margin-top:14px" data-acao="salvar-cliente">Salvar cliente</button>' : ''}
      </div>
      ${novo ? '' : `
        <h2>Orçamentos deste cliente</h2>
        ${orcs.map(linhaOrcamento).join('') || '<div class="card vazio">Nenhum orçamento para este cliente.</div>'}
        <button class="largo tracejado" data-acao="novo-orc-cliente" data-id="${c.id}">+ Novo orçamento para este cliente</button>
        <h2>Este cliente</h2>
        <button class="perigo" data-acao="excluir-cliente" data-id="${c.id}" data-confirma="Tocar de novo para excluir">Excluir cliente</button>`}`,
  };
}

// ---------- cadastros

const ABAS = { materiais: 'Materiais', acabamentos: 'Acabamentos', produtos: 'Produtos', servicos: 'Serviços', tipos: 'Tipos de peça' };
const attrs = (loja, id, prop, numero) => `data-cad="${loja}" data-id="${id}" data-prop="${prop}"${numero ? ' data-num' : ''}`;
const botaoExcluir = (loja, r) => `<button class="perigo" data-acao="cad-excluir" data-loja="${loja}" data-id="${r.id}" data-confirma="Excluir?" aria-label="Excluir ${esc(r.nome)}">✕</button>`;

function cartaoMaterial(m) {
  return `<div class="card cad">
    <div class="cad-topo">
      <div class="amostra">${amostra(m)}</div>
      <input aria-label="Nome do material" ${attrs('materiais', m.id, 'nome')} value="${esc(m.nome)}" placeholder="Nome do material">
      ${botaoExcluir('materiais', m)}
    </div>
    <div class="linha">
      <div><label>Custo por m² (R$)</label><input inputmode="decimal" ${attrs('materiais', m.id, 'custo', 1)} value="${emCampo(m.custo)}" placeholder="0,00"></div>
      <div><label>Venda por m² (R$)</label><input inputmode="decimal" ${attrs('materiais', m.id, 'preco', 1)} value="${emCampo(m.preco)}" placeholder="0,00"></div>
      <div><label>Cor</label><input type="color" ${attrs('materiais', m.id, 'cor')} value="${esc(m.cor || '#b9b6b1')}"></div>
      <div><label>Aparência</label>
        <select ${attrs('materiais', m.id, 'textura')}>
          ${[['granulado', 'Granulado'], ['veios', 'Com veios'], ['liso', 'Liso']].map(([v, n]) => `<option value="${v}" ${m.textura === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select></div>
    </div>
  </div>`;
}

function cartaoAcabamento(a) {
  // estes dois nomes são usados pelas regras do espelho e da saia
  const fixo = a.nome === RETO || a.nome === ESQUADRIA;
  return `<div class="card cad">
    <div class="cad-topo">
      <input aria-label="Nome do acabamento" ${attrs('acabamentos', a.id, 'nome')} value="${esc(a.nome)}" placeholder="Nome do acabamento" ${fixo ? 'disabled' : ''}>
      ${fixo ? '' : botaoExcluir('acabamentos', a)}
    </div>
    <div class="linha">
      <div style="flex:3"><label>Descrição</label><input ${attrs('acabamentos', a.id, 'desc')} value="${esc(a.desc || '')}"></div>
      <div><label>Mão de obra (%)</label><input inputmode="decimal" ${attrs('acabamentos', a.id, 'perc', 1)} value="${a.perc || ''}" placeholder="0"></div>
    </div>
    ${fixo ? `<div class="nota">${a.nome === RETO ? 'Acabamento padrão do espelho e da borda de baixo da saia.' : 'Usada em toda saia.'} O nome não pode ser alterado.</div>` : ''}
  </div>`;
}

function cartaoItem(c) {
  return `<div class="card cad">
    <div class="cad-topo">
      <input aria-label="Nome" ${attrs('catalogo', c.id, 'nome')} value="${esc(c.nome)}" placeholder="Nome">
      ${botaoExcluir('catalogo', c)}
    </div>
    <div class="linha">
      <div><label>Custo (R$)</label><input inputmode="decimal" ${attrs('catalogo', c.id, 'custo', 1)} value="${emCampo(c.custo)}" placeholder="0,00"></div>
      <div><label>Venda (R$)</label><input inputmode="decimal" ${attrs('catalogo', c.id, 'preco', 1)} value="${emCampo(c.preco)}" placeholder="0,00"></div>
    </div>
  </div>`;
}

function cartaoTipo(t) {
  return `<div class="card cad">
    <div class="cad-topo">
      <input aria-label="Nome do tipo de peça" ${attrs('tipos', t.id, 'nome')} value="${esc(t.nome)}" placeholder="Nome do tipo de peça">
      ${botaoExcluir('tipos', t)}
    </div>
    <div class="linha">
      <div><label>Comprimento padrão (cm)</label><input inputmode="decimal" ${attrs('tipos', t.id, 'comp', 1)} value="${t.comp || ''}"></div>
      <div><label>Largura padrão (cm)</label><input inputmode="decimal" ${attrs('tipos', t.id, 'larg', 1)} value="${t.larg || ''}"></div>
    </div>
    <label style="margin-top:10px">Bordas que já vêm marcadas (altura vazia usa a padrão dos ajustes)</label>
    ${Object.keys(LADOS).map(l => `
      <div class="linha lado-tipo">
        <span>${LADOS[l]}</span>
        <select aria-label="Borda ${LADOS[l]}" ${attrs('tipos', t.id, `bordas.${l}.tipo`)}>
          ${Object.keys(TIPOS_BORDA).map(b => `<option value="${b}" ${t.bordas[l].tipo === b ? 'selected' : ''}>${TIPOS_BORDA[b]}</option>`).join('')}
        </select>
        <input aria-label="Altura em cm" inputmode="decimal" ${attrs('tipos', t.id, `bordas.${l}.altura`, 1)} value="${t.bordas[l].altura || ''}" placeholder="cm">
      </div>`).join('')}
  </div>`;
}

export function telaCadastros(aba) {
  if (!ABAS[aba]) return null;
  const novo = (rotulo, loja, tipo = '') => `<button class="largo tracejado" data-acao="cad-novo" data-loja="${loja}" data-tipo="${tipo}">+ ${rotulo}</button>`;
  const conteudo = {
    materiais: () => lista('materiais').map(cartaoMaterial).join('') + novo('Novo material', 'materiais'),
    acabamentos: () => '<p class="dica esq">O percentual é a mão de obra sobre o valor do material da peça. Se a peça tiver mais de um acabamento, vale o maior.</p>' +
      lista('acabamentos').map(cartaoAcabamento).join('') + novo('Novo acabamento', 'acabamentos'),
    produtos: () => lista('catalogo').filter(c => c.tipo === 'produto').map(cartaoItem).join('') + novo('Novo produto', 'catalogo', 'produto'),
    servicos: () => lista('catalogo').filter(c => c.tipo === 'servico').map(cartaoItem).join('') + novo('Novo serviço', 'catalogo', 'servico'),
    tipos: () => lista('tipos').sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(cartaoTipo).join('') + novo('Novo tipo de peça', 'tipos'),
  }[aba]();
  return {
    nav: 'cadastros', titulo: 'Cadastros',
    corpo: `
      <div class="chips">${Object.keys(ABAS).map(a => `<a class="${a === aba ? 'ativo' : ''}" href="#/cadastros/${a}">${ABAS[a]}</a>`).join('')}</div>
      <p class="dica esq">Mudanças aqui valem para os próximos orçamentos. Os que já existem guardam os preços do dia em que foram feitos.</p>
      ${conteudo}`,
    depois: () => {
      if (!focar) return;
      const el = document.querySelector(`[data-id="${focar}"][data-prop="nome"]`);
      focar = null;
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    },
  };
}

// ---------- ajustes

const CORES = [['esmeralda', 'Esmeralda'], ['oceano', 'Oceano'], ['grafite', 'Grafite'], ['vinho', 'Vinho'], ['ametista', 'Ametista'], ['cobre', 'Cobre']];

export function telaAjustes() {
  const c = config();
  const campo = (prop, rotulo, extra = '', numero = false) => `<div><label for="a-${prop}">${rotulo}</label>
    <input id="a-${prop}" data-cfg="${prop}"${numero ? ' data-num' : ''} value="${esc(c[prop] ?? '')}" ${extra}></div>`;
  const completo = pode('ajustes');   // sem esse acesso, o aparelho só ajusta a própria aparência e a conexão
  return {
    nav: 'ajustes', titulo: 'Ajustes',
    depois: carregarAparelhos,
    corpo: `
      ${completo ? `
      <h2>Dados da marmoraria</h2>
      <div class="card campos">
        <div class="logo-ajuste">
          ${logo('grande')}
          <div>
            <b>Logo</b>
            <p class="nota" style="margin:2px 0 8px">Aparece no menu, na tela inicial e no topo das folhas. De preferência com fundo transparente (PNG).</p>
            <label class="botao pequeno" style="margin:0" for="arq-logo">${config().logo ? 'Trocar a logo' : 'Enviar a logo'}</label>
            ${config().logo ? '<button class="pequeno perigo" data-acao="remover-logo">Remover</button>' : ''}
            <input id="arq-logo" type="file" accept="image/*" data-logo hidden>
          </div>
        </div>
        ${campo('empresa', 'Nome (aparece no orçamento)')}
        <div class="linha">${campo('telefone', 'Telefone / WhatsApp', 'inputmode="tel"')}${campo('documento', 'CNPJ ou CPF')}</div>
        ${campo('endereco', 'Endereço')}
      </div>
      <h2>Padrões do orçamento</h2>
      <div class="card">
        <div class="linha">
          ${campo('validadeDias', 'Validade (dias)', 'inputmode="numeric"', true)}
          ${campo('alturaEspelho', 'Altura do espelho (cm)', 'inputmode="decimal"', true)}
          ${campo('alturaSaia', 'Altura da saia (cm)', 'inputmode="decimal"', true)}
        </div>
      </div>` : ''}
      <h2>Aparência</h2>
      <div class="card">
        ${completo ? `<label>Cor da marmoraria (vale para todos os aparelhos e para as folhas)</label>
        <div class="cores" style="margin-bottom:14px">
          ${CORES.map(([v, n]) => `<button class="${(c.corTema || 'esmeralda') === v ? 'ativo' : ''}" data-acao="cor-tema" data-cor="${v}" aria-label="${n}" title="${n}"><i data-cor="${v}"></i><span>${n}</span></button>`).join('')}
        </div>` : ''}
        <label>Claro ou escuro (neste aparelho)</label>
        <div class="seg tres">
          ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, n]) =>
            `<button class="${temaSalvo() === v ? 'ativo' : ''}" data-acao="tema" data-tema="${v}">${n}</button>`).join('')}
        </div>
        <label style="margin-top:14px">Fundo (neste aparelho)</label>
        <div class="seg quatro">
          ${[['liso', 'Liso'], ['aurora', 'Degradê'], ['marmore', 'Mármore'], ['granito', 'Granito']].map(([v, n]) =>
            `<button class="${fundoSalvo() === v ? 'ativo' : ''}" data-acao="fundo" data-fundo="${v}">${n}</button>`).join('')}
        </div>
      </div>
      <h2>Computador e celular</h2>
      ${cartaoSinc()}
      ${completo ? `
      <h2>Cópia de segurança</h2>
      <div class="card">
        <p class="dica esq" style="margin-top:0">Baixe uma cópia de vez em quando, mesmo com a sincronização ligada.</p>
        <div class="linha">
          <button data-acao="baixar-copia">Baixar cópia</button>
          <label class="botao" for="arq-copia">Restaurar cópia</label>
        </div>
        <input id="arq-copia" type="file" accept=".json,application/json" data-importar hidden>
      </div>` : ''}`,
  };
}

// ---------- eventos

function porCaminho(obj, caminho, valor) {
  const partes = caminho.split('.');
  const ultimo = partes.pop();
  partes.reduce((o, k) => o[k], obj)[ultimo] = valor;
}

export function entrada(el) {
  if (el.dataset.busca === 'cli') {
    buscaCliente = el.value;
    document.getElementById('lista-cli').innerHTML = listaClientes();
  } else if (el.dataset.cad) {
    const reg = achar(el.dataset.cad, el.dataset.id);
    if (!reg) return;
    porCaminho(reg, el.dataset.prop, 'num' in el.dataset ? num(el.value) : el.value);
    gravar(el.dataset.cad, reg);
    if (el.dataset.cad === 'materiais' && (el.dataset.prop === 'cor' || el.dataset.prop === 'textura')) atualizarTexturas();
  } else if (el.dataset.cfg) {
    const c = config();
    c[el.dataset.cfg] = 'num' in el.dataset ? num(el.value) : el.value;
    gravar('config', c);
    if (el.dataset.cfg === 'empresa') document.querySelector('.lateral .marca b').textContent = el.value;
  }
}

export function mudanca(el) {
  if ('logo' in el.dataset && el.files[0]) {
    prepararLogo(el.files[0]).then(dados => {
      const c = config();
      c.logo = dados;
      gravar('config', c);
      aviso('Logo atualizada.');
      redesenhar();
    }).catch(e => aviso(e.message || 'Não foi possível usar esta imagem.'));
    return;
  }
  if (!('importar' in el.dataset) || !el.files[0]) return;
  el.files[0].text().then(texto => {
    importar(texto);
    aviso('Cópia restaurada.');
    setTimeout(() => location.reload(), 600);
  }).catch(e => aviso(e.message || 'Não foi possível ler o arquivo.'));
}

const NOVOS = {
  materiais: () => ({ nome: '', preco: 0, custo: 0, cor: '#b9b6b1', textura: 'granulado' }),
  acabamentos: () => ({ nome: '', desc: '', perc: 0 }),
  catalogo: tipo => ({ tipo, nome: '', custo: 0, preco: 0 }),
  tipos: () => ({
    nome: '', comp: 100, larg: 50, ordem: lista('tipos').length,
    bordas: Object.fromEntries(Object.keys(LADOS).map(l => [l, { tipo: 'nenhum', altura: 0 }])),
  }),
};

export const acoes = {
  'salvar-cliente': () => {
    const v = prop => document.getElementById('c-' + prop).value.trim();
    if (!v('nome')) { aviso('Digite o nome do cliente.'); return; }
    const c = gravar('clientes', { id: novoId(), nome: v('nome'), telefone: v('telefone'), endereco: v('endereco'), obs: v('obs'), criadoEm: agora() });
    aviso('Cliente cadastrado.');
    ir('#/cliente/' + c.id);
  },
  'novo-orc-cliente': el => ir('#/o/' + criarOrcamento(el.dataset.id).id),
  'excluir-cliente': el => { excluir('clientes', el.dataset.id); aviso('Cliente excluído.'); ir('#/clientes'); },

  'cad-novo': el => {
    const reg = gravar(el.dataset.loja, { id: novoId(), ...NOVOS[el.dataset.loja](el.dataset.tipo) });
    focar = reg.id;
    if (el.dataset.loja === 'materiais') atualizarTexturas();
    redesenhar();
  },
  'cad-excluir': el => {
    excluir(el.dataset.loja, el.dataset.id);
    redesenhar();
  },

  'tema': el => { salvarTema(el.dataset.tema); redesenhar(); },
  'fundo': el => { salvarFundo(el.dataset.fundo); redesenhar(); },
  'cor-tema': el => {
    const c = config();
    c.corTema = el.dataset.cor;
    gravar('config', c);
    redesenhar();
  },
  'remover-logo': () => {
    const c = config();
    c.logo = '';
    gravar('config', c);
    redesenhar();
  },
  'baixar-copia': () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportar()], { type: 'application/json' }));
    a.download = `marmoraria-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
