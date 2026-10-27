// Moldura do sistema: abre o banco, decide a tela pelo endereço (#/...) e distribui os eventos
import { abrir, config } from './db.js';
import { esc } from './util.js';
import { definirRedesenho, aplicarTema, aviso } from './nucleo.js';
import { atualizarTexturas } from './desenho.js';
import * as orc from './telas/orcamento.js';
import * as folhas from './telas/folhas.js';
import * as gestao from './telas/gestao.js';
import * as fin from './telas/financeiro.js';
import * as nota from './telas/nota.js';
import * as estoque from './telas/estoque.js';
import * as rel from './telas/relatorios.js';
import * as sinc from './sinc.js';
import { logo } from './marca.js';
import { prepararLogoPdf } from './folha-pdf.js';

const modulos = [orc, folhas, gestao, fin, nota, estoque, rel, sinc];
const app = document.getElementById('app');

const icone = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Menu por módulos. Cada submenu exige um acesso (os módulos do aparelho, em Ajustes → Aparelhos).
const MENU = [
  { id: 'inicio', nome: 'Início', hash: '#/', icone: icone('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>') },
  {
    id: 'financeiro', nome: 'Financeiro', icone: icone('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.500 14.500h4"/>'),
    subs: [
      { id: 'orcamentos', nome: 'Orçamentos', hash: '#/orcamentos', modulo: 'orcamentos' },
      { id: 'vendas', nome: 'Vendas', hash: '#/vendas', modulo: 'orcamentos' },
      { id: 'receber', nome: 'Contas a receber', hash: '#/financeiro', modulo: 'financeiro' },
    ],
  },
  {
    id: 'fiscal', nome: 'Fiscal', icone: icone('<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.500h6M9 11h6M9 14.500h4"/>'),
    subs: [
      { id: 'notas', nome: 'Emissor de notas', hash: '#/fiscal', modulo: 'fiscal' },
      { id: 'compras', nome: 'Compras', hash: '#/compras', modulo: 'fiscal' },
      { id: 'estoque', nome: 'Estoque', hash: '#/estoque', modulo: 'fiscal' },
      { id: 'emissao', nome: 'Configurações', hash: '#/fiscal/config', modulo: 'fiscal' },
    ],
  },
  {
    id: 'cadastros', nome: 'Cadastros', icone: icone('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.500l9 5 9-5"/><path d="M3 17l9 5 9-5"/>'),
    subs: [
      { id: 'empresa', nome: 'Empresa', hash: '#/empresa', modulo: 'ajustes' },
      { id: 'clientes', nome: 'Clientes', hash: '#/clientes', modulo: 'clientes' },
      { id: 'fornecedores', nome: 'Fornecedores', hash: '#/fornecedores', modulo: 'fiscal' },
      { id: 'materiais', nome: 'Materiais', hash: '#/cadastros/materiais', modulo: 'cadastros' },
      { id: 'acabamentos', nome: 'Acabamentos', hash: '#/cadastros/acabamentos', modulo: 'cadastros' },
      { id: 'produtos', nome: 'Produtos', hash: '#/cadastros/produtos', modulo: 'cadastros' },
      { id: 'servicos', nome: 'Serviços', hash: '#/cadastros/servicos', modulo: 'cadastros' },
      { id: 'tipos', nome: 'Tipos de peça', hash: '#/cadastros/tipos', modulo: 'cadastros' },
      { id: 'pagamento', nome: 'Formas de pagamento', hash: '#/cadastros/pagamento', modulo: 'cadastros' },
      { id: 'impostos', nome: 'Impostos', hash: '#/cadastros/impostos', modulo: 'fiscal' },
    ],
  },
  {
    id: 'relatorios', nome: 'Relatórios', icone: icone('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
    subs: Object.entries(rel.ABAS_REL).map(([k, n]) => ({ id: 'rel-' + k, nome: n, hash: '#/relatorios/' + k, modulo: 'relatorios' })),
  },
  { id: 'ajustes', nome: 'Ajustes', hash: '#/ajustes', icone: icone('<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>') },
];
const seta = icone('<path d="M9 6l6 6-6 6"/>');

// Módulo que cada tela exige (null = liberada para todo aparelho conectado)
function moduloDaRota(p) {
  if (p[0] === 'orcamentos' || p[0] === 'vendas') return 'orcamentos';
  if (p[0] === 'o') return p[2] === 'interna' ? 'custos' : p[2] === 'nota' ? 'fiscal' : 'orcamentos';
  if (p[0] === 'clientes' || p[0] === 'cliente') return 'clientes';
  if (p[0] === 'cadastros') return p[1] === 'impostos' ? 'fiscal' : 'cadastros';
  if (p[0] === 'financeiro') return 'financeiro';
  if (['fiscal', 'compras', 'compra', 'estoque', 'fornecedores', 'fornecedor'].includes(p[0])) return 'fiscal';
  if (p[0] === 'relatorios') return 'relatorios';
  if (p[0] === 'empresa') return 'ajustes';
  return null;
}
// Grupos abertos no menu lateral (lembrado neste aparelho)
let abertos = new Set();
try { abertos = new Set(JSON.parse(localStorage.getItem('marmoraria-menu') || '[]')); } catch (e) {}
const lembrarMenu = () => { try { localStorage.setItem('marmoraria-menu', JSON.stringify([...abertos])); } catch (e) {} };
const NA_BARRA = ['inicio', 'financeiro', 'fiscal', 'cadastros'];
const iconeMais = icone('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>');
let maisAberto = false;

function rota() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const modulo = moduloDaRota(p);
  if (modulo && !sinc.pode(modulo)) {
    return {
      nav: '', titulo: 'Sem acesso', voltar: '#/',
      corpo: `<div class="card vazio">Este aparelho não tem acesso a <b>${sinc.MODULOS[modulo]}</b>.<br>O acesso é liberado no computador principal, em Ajustes → Aparelhos autorizados.</div>`,
    };
  }
  switch (p[0]) {
    case undefined: return gestao.telaInicio();
    case 'orcamentos': return orc.telaLista();
    case 'vendas': return orc.telaVendas();
    case 'empresa': return gestao.telaEmpresa();
    case 'compras': return estoque.telaCompras();
    case 'compra': return estoque.telaCompra(p[1]);
    case 'estoque': return estoque.telaEstoque();
    case 'fornecedores': return estoque.telaFornecedores();
    case 'fornecedor': return estoque.telaFornecedor(p[1]);
    case 'relatorios': return rel.telaRelatorios(p[1] || 'vendas');
    case 'o':
      switch (p[2]) {
        case undefined: return orc.telaOrcamento(p[1]);
        case 'nova': return orc.telaTipos(p[1]);
        case 'p': return orc.telaPeca(p[1], p[3]);
        case 'item': return orc.telaItens(p[1], p[3]);
        case 'cliente': return folhas.telaCliente(p[1]);
        case 'corte': return folhas.telaCorte(p[1]);
        case 'interna': return folhas.telaInterna(p[1]);
        case 'nota': return nota.telaNota(p[1]);
      }
      return null;
    case 'clientes': return gestao.telaClientes();
    case 'cliente': return gestao.telaCliente(p[1]);
    case 'cadastros': return gestao.telaCadastros(p[1] || 'materiais');
    case 'financeiro': return fin.telaFinanceiro();
    case 'fiscal':
      if (p[1] === 'config') return nota.telaConfigEmissao();
      return nota.telaFiscal();
    case 'ajustes': return gestao.telaAjustes();
  }
  return null;
}

function desenhar(manter) {
  if (!config()) return;   // dados sendo apagados (aparelho desconectado): a página recarrega em seguida
  aplicarTema(config().corTema || 'esmeralda');
  prepararLogoPdf();
  // aparelho não autorizado: só a tela de bloqueio, sem menu e sem dados
  if (sinc.bloqueado()) {
    app.innerHTML = sinc.telaBloqueio();
    document.body.classList.remove('com-rodape');
    return;
  }
  const pedido = location.hash;
  const t = rota();
  // sem tela: volta ao início, a não ser que a própria rota tenha mandado para outro endereço
  if (!t) { if (location.hash === pedido) location.hash = '#/'; return; }
  // só o que este aparelho pode acessar
  const menu = MENU.map(g => (g.subs ? { ...g, subs: g.subs.filter(x => sinc.pode(x.modulo)) } : g)).filter(g => !g.subs || g.subs.length);
  const atual = menu.find(g => g.id === t.nav || (g.subs && g.subs.some(x => x.id === t.nav)));
  const destino = g => (g.subs ? g.subs[0].hash : g.hash);
  const link = (n, cls = '') => `<a href="${n.hash}" class="${cls} ${n.id === t.nav ? 'ativo' : ''}" ${n.id === t.nav ? 'aria-current="page"' : ''}>${n.icone || ''}<span>${n.nome}</span></a>`;
  // lateral: o módulo atual fica aberto; os outros abrem e fecham no toque
  const lateral = menu.map(g => {
    if (!g.subs) return link(g);
    const aberto = g === atual || abertos.has(g.id);
    return `<button class="grupo ${g === atual ? 'atual' : ''} ${aberto ? 'aberto' : ''}" data-acao="menu-grupo" data-g="${g.id}" aria-expanded="${aberto}">${g.icone}<span>${g.nome}</span><i>${seta}</i></button>
      ${aberto ? `<div class="subs">${g.subs.map(x => link(x, 'sub')).join('')}</div>` : ''}`;
  }).join('');
  // celular: módulos na barra de baixo (o resto em "Mais") e os submenus em abas no topo da tela
  const barraLink = g => `<a href="${destino(g)}" class="${g === atual ? 'ativo' : ''}">${g.icone}<span>${g.nome}</span></a>`;
  const naBarra = menu.length <= 5 ? menu : menu.filter(g => NA_BARRA.includes(g.id));
  const noMais = menu.filter(g => !naBarra.includes(g));
  const maisAtivo = noMais.includes(atual);
  const barra = naBarra.map(barraLink).join('') + (noMais.length ? `<button class="${maisAtivo ? 'ativo' : ''}" data-acao="menu-mais" aria-expanded="${maisAberto}">${iconeMais}<span>Mais</span></button>` : '');
  const subAbas = atual && atual.subs && atual.subs.length > 1
    ? `<nav class="sub-abas nao-imprime" aria-label="${atual.nome}">${atual.subs.map(x => `<a href="${x.hash}" class="${x.id === t.nav ? 'ativo' : ''}">${x.nome}</a>`).join('')}</nav>` : '';
  const rolagem = window.scrollY;
  app.innerHTML = `
    <nav class="lateral nao-imprime" aria-label="Menu">
      <a class="marca" href="#/empresa" title="Dados da empresa">${logo()}<b>${esc(config().empresa)}</b></a>
      ${lateral}
    </nav>
    <div class="conteudo">
      <header class="barra nao-imprime">
        ${t.voltar ? `<a class="voltar" href="${t.voltar}" aria-label="Voltar">${icone('<path d="M15 5l-7 7 7 7"/>')}</a>` : ''}
        <h1>${t.titulo}</h1>
        ${sinc.selo()}
        <div class="barra-acoes">${t.topo || ''}</div>
      </header>
      <main class="${t.classe || ''}">${subAbas}${t.corpo}</main>
      ${t.rodape ? `<div class="rodape nao-imprime"><div class="dentro">${t.rodape}</div></div>` : ''}
    </div>
    <nav class="abas nao-imprime" aria-label="Menu">${barra}</nav>
    ${maisAberto && noMais.length ? `<div class="mais-fundo nao-imprime" data-acao="menu-mais"></div>
      <div class="mais-menu nao-imprime">${noMais.map(barraLink).join('')}</div>` : ''}`;
  document.body.classList.toggle('com-rodape', !!t.rodape);
  window.scrollTo(0, manter ? rolagem : 0);
  // no celular, a aba do submenu atual fica visível na faixa de abas
  const abaAtual = document.querySelector('.sub-abas .ativo');
  if (abaAtual) abaAtual.parentElement.scrollLeft = abaAtual.offsetLeft - 16;
  if (t.depois) t.depois();
}

app.addEventListener('click', e => {
  const mais = e.target.closest('[data-acao="menu-mais"]');
  if (mais) { maisAberto = !maisAberto; desenhar(true); return; }
  const grupo = e.target.closest('[data-acao="menu-grupo"]');
  if (grupo) {
    const id = grupo.dataset.g;
    if (abertos.has(id)) abertos.delete(id); else abertos.add(id);
    lembrarMenu();
    desenhar(true);
    return;
  }
  for (const m of modulos) if (m.aoClicar) m.aoClicar(e);
  const el = e.target.closest('[data-acao]');
  if (!el) return;
  // ações perigosas pedem um segundo toque no mesmo botão
  if (el.dataset.confirma !== undefined && !el.dataset.ok) {
    el.dataset.ok = '1';
    el.textContent = el.dataset.confirma || 'Confirmar?';
    return;
  }
  for (const m of modulos) {
    const f = m.acoes && m.acoes[el.dataset.acao];
    if (f) { f(el, e); return; }
  }
});
app.addEventListener('input', e => { for (const m of modulos) if (m.entrada) m.entrada(e.target, e); });
app.addEventListener('change', e => { for (const m of modulos) if (m.mudanca) m.mudanca(e.target, e); });
app.addEventListener('keydown', e => { for (const m of modulos) if (m.tecla) m.tecla(e); });
window.addEventListener('hashchange', () => { maisAberto = false; if (!sinc.conectarPeloLink()) desenhar(false); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema());

const guardou = await abrir();
definirRedesenho(desenhar);
aplicarTema(config().corTema || 'esmeralda');
atualizarTexturas();
sinc.iniciar();
desenhar(false);
if (!guardou) aviso('Este navegador não deixou guardar os dados. Nada será salvo.');

// Funcionamento offline: guarda os arquivos do sistema no aparelho
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Sem modo offline', e));
}
