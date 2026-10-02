// Moldura do sistema: abre o banco, decide a tela pelo endereço (#/...) e distribui os eventos
import { abrir, config } from './db.js';
import { esc } from './util.js';
import { definirRedesenho, aplicarTema, aviso } from './nucleo.js';
import { atualizarTexturas } from './desenho.js';
import * as orc from './telas/orcamento.js';
import * as folhas from './telas/folhas.js';
import * as gestao from './telas/gestao.js';
import * as sinc from './sinc.js';
import { logo } from './marca.js';

const modulos = [orc, folhas, gestao, sinc];
const app = document.getElementById('app');

const icone = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NAV = [
  { id: 'inicio', hash: '#/', nome: 'Início', icone: icone('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>') },
  { id: 'orcamentos', hash: '#/orcamentos', nome: 'Orçamentos', icone: icone('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 12h6M10 16h6"/>') },
  { id: 'clientes', hash: '#/clientes', nome: 'Clientes', icone: icone('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.200-5.500 6.500-5.500s5.900 1.900 6.500 5.500"/><path d="M16 4.800a3.500 3.500 0 010 6.400M18.500 14.800c1.700.8 2.700 2.500 3 5.200"/>') },
  { id: 'cadastros', hash: '#/cadastros/materiais', nome: 'Cadastros', icone: icone('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.500l9 5 9-5"/><path d="M3 17l9 5 9-5"/>') },
  { id: 'ajustes', hash: '#/ajustes', nome: 'Ajustes', icone: icone('<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>') },
];

// Módulo que cada tela exige (null = liberada para todo aparelho conectado)
function moduloDaRota(p) {
  if (p[0] === 'orcamentos') return 'orcamentos';
  if (p[0] === 'o') return p[2] === 'interna' ? 'custos' : 'orcamentos';
  if (p[0] === 'clientes' || p[0] === 'cliente') return 'clientes';
  if (p[0] === 'cadastros') return 'cadastros';
  return null;
}
const MODULO_DO_MENU = { orcamentos: 'orcamentos', clientes: 'clientes', cadastros: 'cadastros' };

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
    case 'o':
      switch (p[2]) {
        case undefined: return orc.telaOrcamento(p[1]);
        case 'nova': return orc.telaTipos(p[1]);
        case 'p': return orc.telaPeca(p[1], p[3]);
        case 'item': return orc.telaItens(p[1], p[3]);
        case 'cliente': return folhas.telaCliente(p[1]);
        case 'corte': return folhas.telaCorte(p[1]);
        case 'interna': return folhas.telaInterna(p[1]);
      }
      return null;
    case 'clientes': return gestao.telaClientes();
    case 'cliente': return gestao.telaCliente(p[1]);
    case 'cadastros': return gestao.telaCadastros(p[1] || 'materiais');
    case 'ajustes': return gestao.telaAjustes();
  }
  return null;
}

function desenhar(manter) {
  if (!config()) return;   // dados sendo apagados (aparelho desconectado): a página recarrega em seguida
  aplicarTema(config().corTema || 'esmeralda');
  // aparelho não autorizado: só a tela de bloqueio, sem menu e sem dados
  if (sinc.bloqueado()) {
    app.innerHTML = sinc.telaBloqueio();
    document.body.classList.remove('com-rodape');
    return;
  }
  const t = rota();
  if (!t) { location.hash = '#/'; return; }
  const links = NAV.filter(n => !MODULO_DO_MENU[n.id] || sinc.pode(MODULO_DO_MENU[n.id])).map(n => `<a href="${n.hash}" class="${n.id === t.nav ? 'ativo' : ''}" ${n.id === t.nav ? 'aria-current="page"' : ''}>${n.icone}<span>${n.nome}</span></a>`).join('');
  const rolagem = window.scrollY;
  app.innerHTML = `
    <nav class="lateral nao-imprime" aria-label="Menu">
      <div class="marca">${logo()}<b>${esc(config().empresa)}</b></div>
      ${links}
    </nav>
    <div class="conteudo">
      <header class="barra nao-imprime">
        ${t.voltar ? `<a class="voltar" href="${t.voltar}" aria-label="Voltar">${icone('<path d="M15 5l-7 7 7 7"/>')}</a>` : ''}
        <h1>${t.titulo}</h1>
        ${sinc.selo()}
        <div class="barra-acoes">${t.topo || ''}</div>
      </header>
      <main class="${t.classe || ''}">${t.corpo}</main>
      ${t.rodape ? `<div class="rodape nao-imprime"><div class="dentro">${t.rodape}</div></div>` : ''}
    </div>
    <nav class="abas nao-imprime" aria-label="Menu">${links}</nav>`;
  document.body.classList.toggle('com-rodape', !!t.rodape);
  window.scrollTo(0, manter ? rolagem : 0);
  if (t.depois) t.depois();
}

app.addEventListener('click', e => {
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
window.addEventListener('hashchange', () => { if (!sinc.conectarPeloLink()) desenhar(false); });
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
