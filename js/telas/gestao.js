// Início, clientes, cadastros e ajustes
import { lista, achar, gravar, excluir, config, exportar, importar } from '../db.js';
import { num, moeda, pct, emCampo, esc, novoId, agora, semAcento, tipoDocumento } from '../util.js';
import { redesenhar, ir, aviso, aplicarTema, temaSalvo, salvarTema, fundoSalvo, salvarFundo, instalacao, jaInstalado } from '../nucleo.js';
import { logo, prepararLogo } from '../marca.js';
import { amostra, atualizarTexturas } from '../desenho.js';
import { LADOS, TIPOS_BORDA, RETO, ESQUADRIA, totalGeral, resultado } from '../calc.js';
import { criarOrcamento, linhaOrcamento, atualizarRascunhos } from './orcamento.js';
import { cartao as cartaoSinc, carregarAparelhos, pode } from '../sinc.js';
import { camposCliente, resumoFalta, aoAlterarCliente, consultarCep, UFS } from '../cliente.js';
import { REGIMES, CODIGOS_ICMS, ORIGENS, fiscal } from '../fiscal.js';
import { numerosFinanceiro, formas } from './financeiro.js';
import { FORMAS } from '../padroes.js';

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
      ${instalacao.evento && !jaInstalado() ? `<div class="card instalar">
        <div><b>Instalar o aplicativo</b><span>Abre direto da tela inicial, em tela cheia.</span></div>
        <button class="primario" data-acao="instalar">Instalar</button></div>` : ''}
      ${pode('orcamentos') ? '' : '<div class="card vazio">Este aparelho não tem acesso aos orçamentos.</div>'}
      <div class="kpis" ${pode('orcamentos') ? '' : 'hidden'}>
        ${kpi('Em aberto', moeda(soma(abertos, totalGeral)), `${abertos.length} ${abertos.length === 1 ? 'orçamento' : 'orçamentos'} aguardando`)}
        ${kpi('Aprovado no mês', moeda(soma(aprovadosMes, totalGeral)), `${aprovadosMes.length} ${aprovadosMes.length === 1 ? 'orçamento' : 'orçamentos'}`)}
        ${pode('custos') ? kpi('Lucro bruto no mês', moeda(soma(aprovadosMes, o => resultado(o).lucro)), 'dos orçamentos aprovados') : ''}
        ${pode('financeiro') ? (() => {
          const n = numerosFinanceiro(), s = l => l.reduce((t, x) => t + x.p.valor, 0);
          return kpi('A receber', moeda(s(n.abertas)), n.vencidas.length ? `${moeda(s(n.vencidas))} vencido` : 'nenhuma parcela vencida');
        })() : ''}
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
      ${novo ? '<p class="dica">Depois de salvar aparecem os dados completos: CPF ou CNPJ e endereço de cobrança.</p>' : `
        <h2>Dados completos</h2>
        <div class="card">
          <div class="ped-t"><span class="nota" style="margin:0">Usados nos pedidos aprovados e na nota fiscal.</span><span id="falta-${c.id}" class="falta-box">${resumoFalta(c)}</span></div>
          ${camposCliente(c)}
        </div>`}
      ${novo ? '' : `
        <h2>Orçamentos deste cliente</h2>
        ${orcs.map(linhaOrcamento).join('') || '<div class="card vazio">Nenhum orçamento para este cliente.</div>'}
        <button class="largo tracejado" data-acao="novo-orc-cliente" data-id="${c.id}">+ Novo orçamento para este cliente</button>
        <h2>Este cliente</h2>
        <button class="perigo" data-acao="excluir-cliente" data-id="${c.id}" data-confirma="Tocar de novo para excluir">Excluir cliente</button>`}`,
  };
}

// ---------- cadastros

const ABAS = { materiais: 'Materiais', acabamentos: 'Acabamentos', produtos: 'Produtos', servicos: 'Serviços', tipos: 'Tipos de peça', pagamento: 'Formas de pagamento' };
const attrs = (loja, id, prop, numero) => `data-cad="${loja}" data-id="${id}" data-prop="${prop}"${numero ? ' data-num' : ''}`;
const botaoExcluir = (loja, r) => `<button class="perigo" data-acao="cad-excluir" data-loja="${loja}" data-id="${r.id}" data-confirma="Excluir?" aria-label="Excluir ${esc(r.nome)}">✕</button>`;

// Dados da nota fiscal de um material, produto ou serviço (dobrados, para não pesar no cartão)
function camposFiscais(loja, r, servico) {
  const regime = REGIMES[fiscal().regime] || REGIMES.simples;
  const codigos = regime.csosn ? CODIGOS_ICMS.csosn : CODIGOS_ICMS.cst;
  const sel = (prop, opcoes, atual) => `<select ${attrs(loja, r.id, prop)}>${Object.entries(opcoes).map(([v, n]) => `<option value="${v}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const naNota = r.naNota || (servico ? 'somar' : 'item');
  const itemProprio = !servico || naNota === 'item';
  const cfopPadrao = loja === 'materiais' || servico ? '5101' : '5102';
  return `<details class="fiscal-cad">
    <summary>Nota fiscal${itemProprio && !r.ncm ? ' <span class="chip st-enviado">sem NCM</span>' : ''}</summary>
    ${servico ? `<label>Como entra na nota</label>${sel('naNota', { somar: 'Somado ao valor das peças (furo, recorte)', item: 'Item próprio na nota', fora: 'Fora da NF-e (nota de serviço, ex.: instalação)' }, naNota)}` : ''}
    ${itemProprio ? `<div class="linha" style="margin-top:8px">
      <div><label>NCM</label><input inputmode="numeric" ${attrs(loja, r.id, 'ncm')} value="${esc(r.ncm || '')}" placeholder="8 dígitos"></div>
      <div><label>CFOP</label><input inputmode="numeric" ${attrs(loja, r.id, 'cfop')} value="${esc(r.cfop || '')}" placeholder="${cfopPadrao}"></div>
      <div><label>Origem</label>${sel('origem', ORIGENS, r.origem ?? '0')}</div>
    </div>
    <div class="linha">
      <div style="flex:2 1 220px"><label>${regime.csosn ? 'CSOSN' : 'CST do ICMS'}</label>${sel('icmsCod', { '': 'Padrão da empresa', ...codigos }, r.icmsCod || '')}</div>
      ${fiscal().ipi ? `<div><label>IPI (%)</label><input inputmode="decimal" ${attrs(loja, r.id, 'ipi', 1)} value="${r.ipi || ''}" placeholder="0"></div>` : ''}
    </div>
    <p class="nota">CFOP 5101 = produção própria (peças); 5102 = revenda (cubas, torneiras). Para outro estado o sistema troca para 6xxx sozinho. Confirme os códigos com o contador.</p>` : ''}
  </details>`;
}

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
    ${camposFiscais('materiais', m)}
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
    ${camposFiscais('catalogo', c, c.tipo === 'servico')}
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

function cartaoForma(f) {
  return `<div class="card cad">
    <div class="cad-topo">
      <input aria-label="Nome da forma de pagamento" data-forma="${f.id}" data-prop="nome" value="${esc(f.nome)}" placeholder="Nome">
      <button class="perigo" data-acao="forma-excluir" data-id="${f.id}" data-confirma="Excluir?" aria-label="Excluir ${esc(f.nome)}">✕</button>
    </div>
    <div class="linha">
      <div><label>Taxa descontada (%)</label><input inputmode="decimal" data-forma="${f.id}" data-prop="taxa" value="${f.taxa ? String(f.taxa).replace('.', ',') : ''}" placeholder="0"></div>
      <div></div>
    </div>
  </div>`;
}

// As formas ficam nos ajustes da marmoraria; quem ainda não tem a lista recebe a padrão ao editar
function formasEditaveis() {
  const c = config();
  if (!c.formas) c.formas = FORMAS.map(f => ({ ...f }));
  return c;
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
    pagamento: () => '<p class="dica esq">Aparecem no pagamento do pedido. A taxa é o que a maquininha ou o banco desconta; o Financeiro mostra o valor líquido.</p>' +
      formas().map(cartaoForma).join('') + '<button class="largo tracejado" data-acao="forma-nova">+ Nova forma de pagamento</button>',
  }[aba]();
  return {
    nav: 'cadastros', titulo: 'Cadastros',
    corpo: `
      <div class="chips">${Object.keys(ABAS).map(a => `<a class="${a === aba ? 'ativo' : ''}" href="#/cadastros/${a}">${ABAS[a]}</a>`).join('')}</div>
      ${aba === 'pagamento' ? '' : '<p class="dica esq">Mudanças aqui valem para os próximos orçamentos e para os que estão em rascunho. Os já enviados ou aprovados guardam os preços do dia em que foram feitos.</p>'}
      ${conteudo}`,
    depois: () => {
      if (!focar) return;
      const el = document.querySelector(`[data-id="${focar}"][data-prop="nome"], [data-forma="${focar}"][data-prop="nome"]`);
      focar = null;
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    },
  };
}

// ---------- ajustes

function cartaoInstalar() {
  if (jaInstalado()) return '<p class="dica esq" style="margin:0">O aplicativo já está instalado neste aparelho.</p>';
  if (instalacao.evento) return '<div class="instalar"><div><b>Instalar o aplicativo</b><span>Abre direto da tela inicial, em tela cheia.</span></div><button class="primario" data-acao="instalar">Instalar</button></div>';
  const ua = navigator.userAgent;
  const passo = /iPhone|iPad/.test(ua)
    ? 'No <b>Safari</b>, toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima) e depois em <b>Adicionar à Tela de Início</b>. No iPhone a instalação só funciona pelo Safari.'
    : /Android/.test(ua)
      ? 'No <b>Chrome</b>, toque nos <b>três pontinhos</b> no canto de cima e depois em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.'
      : 'No <b>Chrome</b> ou no <b>Edge</b>, clique no ícone de instalar no fim da barra de endereço, ou abra o menu e escolha <b>Instalar</b>.';
  return `<p class="dica esq" style="margin:0">${passo}</p>
    <p class="nota">O botão de instalar aparece aqui sozinho quando o navegador permite. Ele só funciona no endereço da internet (não em <code>localhost</code> aberto por outro aparelho).</p>`;
}

// Dados da empresa para a nota fiscal. Trocar o regime aplica os códigos e percentuais padrão dele.
export function cartaoFiscal() {
  const f = fiscal(), reg = REGIMES[f.regime] || REGIMES.simples;
  const at = (prop, extra = '') => `id="fi-${prop}" data-fiscal="${prop}" value="${esc(f[prop] ?? '')}" ${extra}`;
  const campo = (prop, rotulo, extra = '', estilo = '') => `<div ${estilo}><label for="fi-${prop}">${rotulo}</label><input ${at(prop, extra)}></div>`;
  const doc = tipoDocumento(config().documento);
  const codigos = reg.csosn ? CODIGOS_ICMS.csosn : CODIGOS_ICMS.cst;
  return `<div class="card">
    <label>Regime tributário</label>
    <div class="regimes">${Object.keys(REGIMES).map(k => `<button class="${f.regime === k ? 'ativo' : ''}" data-acao="fiscal-regime" data-r="${k}">${REGIMES[k].nome}</button>`).join('')}</div>
    <p class="nota">CNPJ: ${doc === 'cnpj' ? '✓ válido' : 'preencha o CNPJ em Dados da marmoraria'}. Ao trocar o regime, os códigos e percentuais abaixo voltam ao padrão dele.</p>
    <div class="linha" style="margin-top:10px">
      ${campo('ie', 'Inscrição estadual')}${campo('im', 'Inscrição municipal')}${campo('cnae', 'CNAE', 'inputmode="numeric"')}
    </div>
    <h3 class="sub">Endereço da empresa</h3>
    <div class="linha">
      ${campo('cep', 'CEP', 'inputmode="numeric" placeholder="00000-000"')}${campo('logradouro', 'Rua / avenida', '', 'style="flex:3 1 220px"')}
    </div>
    <div class="linha">
      ${campo('numero', 'Número')}${campo('complemento', 'Complemento')}${campo('bairro', 'Bairro', '', 'style="flex:2 1 160px"')}
    </div>
    <div class="linha">
      ${campo('cidade', 'Cidade', '', 'style="flex:3 1 200px"')}
      <div><label for="fi-uf">Estado</label><select id="fi-uf" data-fiscal="uf"><option value=""></option>${UFS.map(u => `<option ${f.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    </div>
    <h3 class="sub">Impostos padrão</h3>
    <div class="linha">
      <div style="flex:2 1 240px"><label for="fi-icmsCod">${reg.csosn ? 'CSOSN' : 'CST do ICMS'}</label>
        <select id="fi-icmsCod" data-fiscal="icmsCod">${Object.entries(codigos).map(([v, n]) => `<option value="${v}" ${String(f.icmsCod) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      ${campo('aliqIcms', 'ICMS interno (%)', 'inputmode="decimal"')}
      ${reg.csosn ? campo('pCredSN', 'Crédito de ICMS do Simples (%)', 'inputmode="decimal"') : ''}
    </div>
    <div class="linha">
      ${campo('pisCst', 'CST do PIS/COFINS', 'inputmode="numeric"')}${campo('pis', 'PIS (%)', 'inputmode="decimal"')}${campo('cofins', 'COFINS (%)', 'inputmode="decimal"')}
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" data-fiscal="ipi" ${f.ipi ? 'checked' : ''}> Contribuinte de IPI (indústria): mostra o IPI nos cadastros e na nota</label>
    ${reg.csosn ? '' : `<label class="check"><input type="checkbox" data-fiscal="tiraIcmsPis" ${f.tiraIcmsPis ? 'checked' : ''}> Tirar o ICMS da base do PIS e da COFINS</label>`}
    <label for="fi-natureza" style="margin-top:10px">Natureza da operação</label>
    <input ${at('natureza')}>
    <h3 class="sub">Numeração</h3>
    <div class="linha">
      ${campo('serie55', 'Série NF-e', 'inputmode="numeric"')}${campo('proxima55', 'Próxima NF-e', 'inputmode="numeric"')}
      ${campo('serie65', 'Série NFC-e', 'inputmode="numeric"')}${campo('proxima65', 'Próxima NFC-e', 'inputmode="numeric"')}
    </div>
    <label style="margin-top:10px">Ambiente</label>
    <div class="seg">${[['homologacao', 'Homologação (teste)'], ['producao', 'Produção (vale de verdade)']].map(([v, n]) => `<button class="${f.ambiente === v ? 'ativo' : ''}" data-acao="fiscal-ambiente" data-v="${v}">${n}</button>`).join('')}</div>
    <p class="nota">Os percentuais e códigos são o padrão de cada regime. Confirme com o contador: alíquotas de ICMS mudam por estado e por produto.</p>
  </div>`;
}

const fiscalGravado = () => { const c = config(); if (!c.fiscal) c.fiscal = { ...fiscal() }; return c; };
const NUMEROS_FISCAIS = ['aliqIcms', 'pCredSN', 'pis', 'cofins', 'serie55', 'proxima55', 'serie65', 'proxima65'];

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
      <h2>Instalar no aparelho</h2>
      <div class="card">${cartaoInstalar()}</div>
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
    // preço ou percentual alterado: os orçamentos em rascunho passam a usar o valor novo
    if (el.dataset.cad === 'materiais' || el.dataset.cad === 'acabamentos') atualizarRascunhos();
    if (el.dataset.cad === 'clientes') aoAlterarCliente(reg, el.dataset.prop);
  } else if (el.dataset.fiscal && el.type !== 'checkbox') {
    const c = fiscalGravado(), k = el.dataset.fiscal;
    c.fiscal[k] = NUMEROS_FISCAIS.includes(k) ? num(el.value) : el.value;
    if (k === 'cidade' || k === 'uf') c.fiscal.ibge = '';
    gravar('config', c);
    if (k === 'cep') consultarCep(el.value).then(e => {
      if (!e) return;
      Object.assign(c.fiscal, e);
      gravar('config', c);
      for (const p of ['cep', 'logradouro', 'bairro', 'cidade', 'uf']) { const x = document.getElementById('fi-' + p); if (x && x !== document.activeElement) x.value = c.fiscal[p]; }
      const n = document.getElementById('fi-numero'); if (n && !c.fiscal.numero) n.focus();
    });
  } else if (el.dataset.forma) {
    const c = formasEditaveis(), f = c.formas.find(x => x.id === el.dataset.forma);
    if (!f) return;
    f[el.dataset.prop] = el.dataset.prop === 'taxa' ? num(el.value) : el.value;
    gravar('config', c);
  } else if (el.dataset.cfg) {
    const c = config();
    c[el.dataset.cfg] = 'num' in el.dataset ? num(el.value) : el.value;
    gravar('config', c);
    if (el.dataset.cfg === 'empresa') document.querySelector('.lateral .marca b').textContent = el.value;
  }
}

export function mudanca(el) {
  if (el.dataset.fiscal && el.type === 'checkbox') {
    const c = fiscalGravado();
    c.fiscal[el.dataset.fiscal] = el.checked;
    gravar('config', c);
    if (el.dataset.fiscal === 'ipi') redesenhar();
    return;
  }
  // serviço trocado entre "somar", "item" e "fora": mostra ou esconde NCM e CFOP
  if (el.dataset.cad === 'catalogo' && el.dataset.prop === 'naNota') { redesenhar(); return; }
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
  'forma-nova': () => {
    const c = formasEditaveis(), f = { id: novoId(), nome: '', taxa: 0 };
    c.formas.push(f);
    gravar('config', c);
    focar = f.id;
    redesenhar();
  },
  'forma-excluir': el => {
    const c = formasEditaveis();
    c.formas = c.formas.filter(f => f.id !== el.dataset.id);
    gravar('config', c);
    redesenhar();
  },
  'fiscal-regime': el => {
    const c = fiscalGravado();
    c.fiscal.regime = el.dataset.r;
    Object.assign(c.fiscal, REGIMES[el.dataset.r].padrao);
    gravar('config', c);
    aviso(`Regime: ${REGIMES[el.dataset.r].nome}. Códigos e percentuais ajustados.`);
    redesenhar();
  },
  'fiscal-ambiente': el => {
    const c = fiscalGravado();
    c.fiscal.ambiente = el.dataset.v;
    gravar('config', c);
    redesenhar();
  },
  'cad-excluir': el => {
    excluir(el.dataset.loja, el.dataset.id);
    redesenhar();
  },

  'instalar': async () => {
    if (!instalacao.evento) return;
    instalacao.evento.prompt();
    await instalacao.evento.userChoice.catch(() => {});
    instalacao.evento = null;
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
