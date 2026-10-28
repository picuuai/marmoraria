// Sincronização entre aparelhos usando um repositório PRIVADO do GitHub.
// - dados.json      → todos os dados do sistema
// - aparelhos.json  → aparelhos autorizados, com o que cada um pode acessar
// A chave (token) fica só no navegador de cada aparelho. O celular recebe a chave por QR Code.
// Quando dois aparelhos mudam ao mesmo tempo, as alterações são juntadas registro a registro:
// em cada registro vale a versão alterada por último (atualizadoEm).
// O sistema só abre em aparelho conectado. O computador principal vê a lista, define os
// acessos e pode desconectar qualquer aparelho.
import { LOJAS, tudo, substituir, apagarTudo, definirAoMudar } from './db.js';
import { esc, agora, novoId } from './util.js';
import { redesenhar, aviso } from './nucleo.js';
import { atualizarTexturas } from './desenho.js';
import { criarSolicitacao, lerSolicitacao, aprovarSolicitacao, abrirLiberacao, criarCodigoReutilizavel, lerCodigoReutilizavel } from './convite.js';

const CHAVE_PEDIDO = 'marmoraria-pedido-acesso';
let pedidoDono = null, liberacaoDono = '', pedidoPerfil = 'vendedor';
let codigoReutilizavel = '', perfilReutilizavel = 'vendedor';

function painelCodigoReutilizavel() {
  return `<h2>Código reutilizável de acesso</h2><div class="card">
    <p class="dica esq">Gere uma vez e guarde em local privado. Use o mesmo código em outros computadores ou celulares, sem câmera e sem nova solicitação. Cada conexão cria um aparelho secundário na lista.</p>
    <label for="codigo-perfil">Perfil para o código</label>
    <select id="codigo-perfil">${Object.entries(PERFIS).map(([id,p]) => `<option value="${id}" ${perfilReutilizavel === id ? 'selected' : ''}>${p.nome} — ${p.detalhe}</option>`).join('')}</select>
    <button data-acao="codigo-gerar">Gerar código reutilizável</button>
    ${codigoReutilizavel ? `<label for="codigo-reutilizavel">Código para guardar</label>
      <textarea id="codigo-reutilizavel" readonly rows="3">${esc(codigoReutilizavel)}</textarea>
      <button data-acao="pedido-copiar" data-campo="codigo-reutilizavel">Copiar código</button>
      <button data-acao="codigo-baixar">Baixar código para guardar</button>` : ''}
    <p class="nota">Quem tiver este código poderá conectar aparelhos com o perfil escolhido. Ele não vence por tempo; deixa de funcionar se a chave do GitHub for revogada ou trocada. Para invalidá-lo, use Trocar a chave e apague a antiga no GitHub. Desconectar apenas um aparelho não invalida este código.</p>
    <div id="codigo-erro" role="status"></div></div>`;
}

function painelEntrarComCodigo() {
  return `<details class="card"><summary>Já tenho um código de acesso</summary>
    <p class="dica esq">Cole o código MAR-CONEXAO-1 fornecido pelo dono. Pode ser usado em outros computadores.</p>
    <label for="codigo-entrada">Código reutilizável</label>
    <textarea id="codigo-entrada" rows="3" autocomplete="off" spellcheck="false"></textarea>
    <button class="primario" data-acao="codigo-entrar">Conectar com este código</button>
    <div id="codigo-erro" role="status"></div></details>`;
}

function painelSolicitacao() {
  const p = ler(CHAVE_PEDIDO);
  const valido = !!p;
  return `<div class="card">
    <h2>Solicitar acesso ao dono</h2>
    <p class="dica esq">Use em outro computador ou celular, sem precisar de câmera.</p>
    ${valido ? `<p>Solicitação de <b>${esc(p.nome)}</b>. Envie o código ao dono por mensagem. Ele deve abrir <b>Ajustes → Computador e celular → Aprovar solicitação</b>.</p>
      <label for="pedido-codigo">Código da solicitação (sem prazo de validade)</label>
      <textarea id="pedido-codigo" readonly rows="3">${esc(p.pedido)}</textarea>
      <button data-acao="pedido-copiar" data-campo="pedido-codigo">Copiar solicitação</button>
      <p class="nota">Aguarde a resposta do dono e cole abaixo. A troca dos códigos é por mensagem; não há envio automático. Volte a este mesmo navegador.</p>
      <label for="pedido-resposta">Código de liberação recebido do dono</label>
      <textarea id="pedido-resposta" rows="3" autocomplete="off" spellcheck="false"></textarea>
      <button class="primario" data-acao="pedido-entrar">Liberar este aparelho</button>
      <button data-acao="pedido-cancelar">Cancelar solicitação</button>` : `
      <label for="pedido-nome">Seu nome e identificação do aparelho</label>
      <input id="pedido-nome" maxlength="80" placeholder="Ex.: João — computador do escritório" value="${esc(meuAparelho().nome)}">
      <button class="primario" data-acao="pedido-gerar">Gerar solicitação</button>
      <p class="nota">Você enviará o código ao dono e receberá outro código após a aprovação.</p>`}
    <div id="pedido-erro" role="status"></div>
  </div>`;
}

function painelAprovacao() {
  return `<h2>Aprovar solicitação</h2><div class="card">
    <p class="dica esq">Para conectar outro computador ou celular sem câmera, peça à pessoa para gerar uma solicitação na tela inicial e enviar o código. Confira com ela a identidade antes de liberar.</p>
    <label for="dono-pedido">Código da solicitação recebida</label>
    <textarea id="dono-pedido" rows="3" autocomplete="off" spellcheck="false">${esc(pedidoDono?.codigo || '')}</textarea>
    <button data-acao="pedido-conferir">Conferir solicitação</button>
    ${pedidoDono ? `<p>Solicitação de <b>${esc(pedidoDono.nome)}</b>. Confira se é o aparelho que deseja liberar.</p>
      <label for="dono-perfil">Acesso permitido</label><select id="dono-perfil">${Object.entries(PERFIS).map(([id, p]) => `<option value="${id}" ${pedidoPerfil === id ? 'selected' : ''}>${p.nome} — ${p.detalhe}</option>`).join('')}</select>
      <button class="primario" data-acao="pedido-aprovar">Aprovar e gerar liberação</button>` : ''}
    ${liberacaoDono ? `<label for="dono-liberacao">Código de liberação</label><textarea id="dono-liberacao" readonly rows="3">${esc(liberacaoDono)}</textarea>
      <button data-acao="pedido-copiar" data-campo="dono-liberacao">Copiar liberação</button>
      <p class="nota">Envie à pessoa para colar no mesmo navegador que fez a solicitação. Sem prazo de validade. O aparelho aparecerá na lista após conectar.</p>` : ''}
    <div id="pedido-erro" role="status"></div></div>`;
}

async function acaoPedido(el, fn, erroId = 'pedido-erro') {
  el.disabled = true;
  try { await fn(); }
  catch (e) {
    const caixa = document.getElementById(erroId);
    if (caixa) caixa.innerHTML = `<p class="alerta s-erro">${esc(e.message)}</p>`;
  } finally { el.disabled = false; }
}

const CHAVE = 'marmoraria-sinc', CHAVE_APAR = 'marmoraria-aparelho', CHAVE_REVOGADO = 'marmoraria-revogado';
const ARQ_DADOS = 'dados.json', ARQ_APAR = 'aparelhos.json';
const REPO_SUGERIDO = 'marmoraria_dados';

// O que pode ser liberado ou bloqueado em cada aparelho
export const MODULOS = {
  orcamentos: 'Orçamentos',
  clientes: 'Clientes',
  cadastros: 'Cadastros e preços',
  custos: 'Custos e lucro',
  relatorios: 'Relatórios',
  financeiro: 'Financeiro (recebimentos)',
  fiscal: 'Fiscal (notas, compras e estoque)',
  ajustes: 'Ajustes da marmoraria',
};
const TODOS = Object.fromEntries(Object.keys(MODULOS).map(m => [m, true]));
const PERFIS = {
  vendedor: { nome: 'Vendedor', detalhe: 'orçamentos e clientes', acessos: { orcamentos: true, clientes: true } },
  dono: { nome: 'Dono', detalhe: 'acesso total', acessos: TODOS },
};

let cfg = ler(CHAVE);               // { repo, token, ultima, principal, perfil, acessos }
let status = cfg ? 'pendente' : 'off', msg = '';
let relogio = 0, rodando = false, denovo = false, qrAberto = '', qrPerfil = 'vendedor', ultimaVerif = 0;

function ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function gravarCfg() {
  try { if (cfg) localStorage.setItem(CHAVE, JSON.stringify(cfg)); else localStorage.removeItem(CHAVE); } catch (e) {}
}
const aparelho = () => (/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular' : 'computador');
// principal = conectado colando a chave (os outros entram pelo QR Code)
const ehPrincipal = () => !!cfg && cfg.principal !== false;

// Aparelho sem conexão não abre o sistema
export const bloqueado = () => !cfg;
// Este aparelho pode usar o módulo? O principal pode tudo; nos outros vale o que o principal definiu.
// É um controle de tela: quem tem a chave no aparelho tem, tecnicamente, acesso ao repositório inteiro.
// (aparelho conectado antes de existirem os acessos continua com tudo até o principal definir)
export const pode = modulo => !cfg || ehPrincipal() || !cfg.acessos || !!cfg.acessos[modulo];

// ---------- junção das alterações

// Mesma ordem em todos os aparelhos, para o arquivo só mudar quando os dados mudam
export function organizar(dados) {
  const o = {};
  for (const l of LOJAS) o[l] = (dados[l] || []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // armazéns criados por uma versão mais nova do sistema passam adiante sem ser apagados
  for (const l of Object.keys(dados)) if (!(l in o) && Array.isArray(dados[l])) o[l] = dados[l];
  return o;
}

export function juntar(local, remoto) {
  const o = {};
  for (const l of LOJAS) {
    const mapa = new Map((remoto[l] || []).map(r => [r.id, r]));
    for (const r of local[l] || []) {
      const outro = mapa.get(r.id);
      if (!outro || (r.atualizadoEm || '') > (outro.atualizadoEm || '')) mapa.set(r.id, r);
    }
    o[l] = [...mapa.values()];
  }
  for (const l of Object.keys(remoto)) if (!(l in o) && Array.isArray(remoto[l])) o[l] = remoto[l];
  return organizar(o);
}

// Dois orçamentos criados sem internet em aparelhos diferentes podem pegar o mesmo número
export function corrigirNumeros(d) {
  const n = o => parseInt(String(o.numero).replace(/\D/g, ''), 10) || 0;
  const vivos = d.orcamentos.filter(o => !o.excluidoEm).sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || '') || a.id.localeCompare(b.id));
  let maior = Math.max(0, ...d.orcamentos.map(n));
  const vistos = new Set();
  for (const o of vivos) {
    if (vistos.has(o.numero)) { o.numero = 'P-' + String(++maior).padStart(4, '0'); o.atualizadoEm = agora(); }
    vistos.add(o.numero);
  }
  const c = d.config[0];
  if (c && (c.proximoNumero || 1) <= maior) { c.proximoNumero = maior + 1; c.atualizadoEm = agora(); }
}

// ---------- GitHub

const b64enc = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64dec = str => Uint8Array.from(atob(str.replace(/\s/g, '')), c => c.charCodeAt(0));

function gh(caminho, op = {}, c = cfg) {
  return fetch(`https://api.github.com/repos/${c.repo}${caminho}`, {
    cache: 'no-store', ...op,
    headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(op.headers || {}) },
  });
}
function erroGH(r, t = '') {
  const e = new Error(
    r.status === 401 ? 'a chave do GitHub é inválida ou venceu'
      : r.status === 403 ? (/rate limit/i.test(t) ? 'limite do GitHub atingido, tente em alguns minutos' : 'a chave não tem permissão de escrita neste repositório')
        : r.status === 404 ? 'repositório não encontrado (confira o nome e se a chave tem acesso a ele)'
          : `o GitHub respondeu ${r.status}`);
  e.status = r.status;
  return e;
}
async function lerArquivo(caminho, c = cfg) {
  const r = await gh(`/contents/${caminho}`, {}, c);
  if (r.status === 404) return null;
  if (!r.ok) throw erroGH(r, await r.text());
  const j = await r.json();
  let bytes;
  if (j.encoding === 'base64' && j.content) bytes = b64dec(j.content);
  else { // arquivos acima de 1 MB vêm só pelo modo "raw"
    const r2 = await gh(`/contents/${caminho}`, { headers: { Accept: 'application/vnd.github.raw+json' } }, c);
    if (!r2.ok) throw erroGH(r2, await r2.text());
    bytes = new Uint8Array(await r2.arrayBuffer());
  }
  return { sha: j.sha, texto: new TextDecoder().decode(bytes) };
}
async function gravarArquivo(caminho, texto, sha, mensagem) {
  const r = await gh(`/contents/${caminho}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensagem, content: b64enc(new TextEncoder().encode(texto)), ...(sha ? { sha } : {}) }),
  });
  if (r.status === 409 || r.status === 422) { const e = new Error('conflito'); e.conflito = true; throw e; }
  if (!r.ok) throw erroGH(r, await r.text());
}

// Descobre por que o repositório não aparece: chave inválida, dono diferente ou repositório não liberado na chave
async function diagnosticar(c) {
  const api = p => fetch('https://api.github.com' + p, { cache: 'no-store', headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  try {
    const u = await api('/user');
    if (u.status === 401) return 'a chave foi recusada pelo GitHub (copiada pela metade, apagada ou vencida). Gere uma nova e cole de novo.';
    const login = u.ok ? (await u.json()).login : '';
    const dono = c.repo.split('/')[0];
    if (login && login.toLowerCase() !== dono.toLowerCase()) return `a chave é da conta "${login}", mas o repositório informado é de "${dono}".`;
    return `a chave não enxerga o repositório ${c.repo}. Crie a chave marcando esse repositório em "Only select repositories" (ele precisa existir antes).`;
  } catch (e) {
    return 'repositório não encontrado (confira o nome e se a chave tem acesso a ele)';
  }
}

// ---------- aparelhos autorizados (aparelhos.json no repositório)

function nomePadrao() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Celular Android' : /Windows/.test(ua) ? 'Computador Windows' : /Mac/.test(ua) ? 'Mac' : 'Aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return nav ? `${so} · ${nav}` : so;
}
function meuAparelho() {
  let d = ler(CHAVE_APAR);
  if (!d) { d = { id: novoId(), nome: nomePadrao() }; try { localStorage.setItem(CHAVE_APAR, JSON.stringify(d)); } catch (e) {} }
  return d;
}
const acessosPadrao = () => ({ ...(PERFIS[cfg.perfil] || PERFIS.dono).acessos });

async function lerAparelhos() {
  const a = await lerArquivo(ARQ_APAR);
  return a ? { sha: a.sha, lista: JSON.parse(a.texto) } : { sha: null, lista: {} };
}
async function alterarAparelhos(fn) {
  for (let t = 0; t < 4; t++) {
    const { sha, lista } = await lerAparelhos();
    const nova = fn(lista);
    try { await gravarArquivo(ARQ_APAR, JSON.stringify(nova, null, 1), sha, 'aparelhos conectados'); return nova; }
    catch (e) { if (!e.conflito) throw e; }
  }
  throw new Error('não foi possível atualizar a lista de aparelhos');
}

// Registra este aparelho, busca os acessos dele e confere se o principal mandou desconectar
async function verificarAparelho(forcar = false) {
  if (!forcar && Date.now() - ultimaVerif < 5 * 60e3) return true;
  ultimaVerif = Date.now();
  const eu = meuAparelho(), { lista } = await lerAparelhos(), reg = lista[eu.id];
  if (reg && reg.revogado) { await apagarEsteAparelho('revogado'); return false; }
  const quando = agora();
  if (!reg || reg.principal !== ehPrincipal() || Date.now() - Date.parse(reg.ultimoAcesso || 0) > 15 * 60e3) {
    await alterarAparelhos(l => {
      l[eu.id] = { nome: eu.nome, conectadoEm: quando, acessos: acessosPadrao(), ...(l[eu.id] || {}), tipo: aparelho(), principal: ehPrincipal(), ultimoAcesso: quando };
      return l;
    });
  }
  if (!ehPrincipal()) {
    const acessos = (reg && reg.acessos) || acessosPadrao();
    if (JSON.stringify(acessos) !== JSON.stringify(cfg.acessos)) { cfg.acessos = acessos; gravarCfg(); redesenhar(); }
  }
  return true;
}

// motivo: 'revogado' (desconectado pelo principal), 'chave' (chave trocada) ou 'saiu' (desconectou por conta própria)
async function apagarEsteAparelho(motivo = 'revogado') {
  const eu = meuAparelho();
  // sai da lista de aparelhos (ao ser desconectado, o registro some)
  if (motivo !== 'chave') try { await alterarAparelhos(l => { delete l[eu.id]; return l; }); } catch (e) {}
  cfg = null;
  gravarCfg();
  clearTimeout(relogio);
  await apagarTudo();
  try { if (motivo !== 'saiu') localStorage.setItem(CHAVE_REVOGADO, motivo); } catch (e) {}
  location.hash = '#/';
  location.reload();
}

const haQuanto = iso => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`;
};

// Lista de aparelhos na tela de ajustes (só no computador principal)
export async function carregarAparelhos() {
  const caixa = document.getElementById('sinc-aparelhos');
  if (!caixa || !cfg) return;
  try {
    const { lista } = await lerAparelhos();
    const eu = meuAparelho().id;
    const ordem = Object.entries(lista).sort((a, b) => (b[1].ultimoAcesso || '').localeCompare(a[1].ultimoAcesso || ''));
    caixa.innerHTML = ordem.map(([id, d]) => {
      const acessos = d.acessos || {};
      const marcas = d.principal ? '<div class="nota">Computador principal: acesso total.</div>' : `
        <div class="acessos">${Object.keys(MODULOS).map(m =>
          `<label class="check"><input type="checkbox" data-apar-acesso="${id}" data-modulo="${m}" ${acessos[m] ? 'checked' : ''}> ${MODULOS[m]}</label>`).join('')}</div>`;
      let estado, botoes = '';
      if (d.revogado) {
        estado = 'Desconexão pendente: sai quando abrir o sistema com internet.';
        botoes = `<button class="pequeno" data-acao="apar-remover" data-id="${id}">Tirar da lista</button>`;
      } else {
        estado = `Último acesso ${haQuanto(d.ultimoAcesso)} · conectado em ${d.conectadoEm ? new Date(d.conectadoEm).toLocaleDateString('pt-BR') : '—'}`;
        if (id !== eu) botoes = `<button class="pequeno perigo" data-acao="apar-revogar" data-id="${id}" data-confirma="Tocar de novo para desconectar">Desconectar</button>`;
      }
      return `<div class="aparelho">
        <div class="aparelho-t">
          <input aria-label="Nome do aparelho" data-apar-nome="${id}" value="${esc(d.nome || 'Aparelho')}">
          ${id === eu ? '<span class="chip">este aparelho</span>' : ''}${d.principal ? '<span class="chip st-aprovado">principal</span>' : ''}
          ${botoes}
        </div>
        <div class="nota">${estado}</div>
        ${d.revogado ? '' : marcas}
      </div>`;
    }).join('') || '<div class="nota">Nenhum aparelho registrado ainda.</div>';
  } catch (e) {
    caixa.innerHTML = `<div class="alerta s-erro">Não foi possível carregar a lista: ${esc(e.message)}</div>`;
  }
}

async function trocarChave(token) {
  token = token.trim();
  if (!token) throw new Error('cole a chave nova');
  const teste = { repo: cfg.repo, token };
  const r = await gh('', {}, teste);
  if (!r.ok) throw new Error(await diagnosticar(teste));
  cfg.token = token;
  codigoReutilizavel = ''; liberacaoDono = ''; pedidoDono = null;
  gravarCfg();
  // os outros aparelhos ficam com a chave antiga (inválida): saem da lista e precisam ler o QR de novo
  await alterarAparelhos(l => { for (const id of Object.keys(l)) if (id !== meuAparelho().id) delete l[id]; return l; });
}

// ---------- sincronização

const editando = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName) || /\/p\//.test(location.hash);

function agendar(ms = 2500) {
  if (!cfg) return;
  clearTimeout(relogio);
  relogio = setTimeout(sincronizar, ms);
}

export async function sincronizar() {
  if (!cfg) return;
  if (rodando) { denovo = true; return; }
  if (!navigator.onLine) { definirStatus('offline'); return; }
  rodando = true;
  definirStatus('sincronizando');
  try {
    if (!(await verificarAparelho())) return;   // foi desconectado pelo computador principal
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const localStr = JSON.stringify(organizar(tudo()));
      const rem = await lerArquivo(ARQ_DADOS);
      const remoto = rem ? JSON.parse(rem.texto).lojas : null;
      const final = remoto ? juntar(JSON.parse(localStr), remoto) : JSON.parse(localStr);
      corrigirNumeros(final);
      const finalStr = JSON.stringify(final);
      if (!remoto || finalStr !== JSON.stringify(organizar(remoto))) {
        try { await gravarArquivo(ARQ_DADOS, JSON.stringify({ sistema: 'marmoraria', versao: 1, lojas: final }), rem ? rem.sha : null, `sync ${aparelho()} ${new Date().toLocaleString('pt-BR')}`); }
        catch (e) { if (e.conflito) continue; throw e; }   // outro aparelho gravou antes: junta de novo
      }
      if (finalStr !== localStr) {
        // se algo mudou aqui durante a sincronização, preserva e sincroniza de novo
        const agoraStr = JSON.stringify(organizar(tudo()));
        if (agoraStr !== localStr) { substituir(juntar(JSON.parse(agoraStr), final)); denovo = true; }
        else substituir(final);
        atualizarTexturas();
        if (!editando()) redesenhar();
      }
      break;
    }
    cfg.ultima = agora();
    gravarCfg();
    definirStatus('ok');
  } catch (e) {
    console.warn(e);
    // chave trocada ou apagada: um aparelho que não é o principal fica bloqueado e apaga os dados
    if (e.status === 401 && !ehPrincipal()) { rodando = false; return apagarEsteAparelho('chave'); }
    definirStatus(navigator.onLine ? 'erro' : 'offline', e.status === 401 ? 'a chave foi apagada ou venceu: cole uma nova em “Trocar a chave”' : e.message);
  } finally {
    rodando = false;
    if (denovo) { denovo = false; agendar(1500); }
  }
}

async function conectar(repo, token, principal = true, perfil = 'dono') {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('o repositório deve ficar no formato usuario/nome');
  if (!token) throw new Error('cole a chave do GitHub');
  const novo = { repo, token, principal, perfil };
  const r = await gh('', {}, novo);
  if (r.status === 404 || r.status === 401) throw new Error(await diagnosticar(novo));
  if (!r.ok) throw erroGH(r, await r.text());
  if (!(await r.json()).private) throw new Error('o repositório precisa ser PRIVADO (os dados da marmoraria ficariam públicos)');
  cfg = { ...novo, acessos: principal ? TODOS : { ...(PERFIS[perfil] || PERFIS.vendedor).acessos } };
  gravarCfg();
  // cada conexão é um registro novo: um aparelho desconectado antes pode ser liberado de novo pelo QR
  try { localStorage.setItem(CHAVE_APAR, JSON.stringify({ id: novoId(), nome: meuAparelho().nome })); } catch (e) {}
  ultimaVerif = 0;
  await sincronizar();
  if (cfg && status === 'erro') { const m = msg; cfg = null; gravarCfg(); definirStatus('off'); throw new Error(m || 'falha ao sincronizar'); }
}

async function desconectar() {
  if (!ehPrincipal()) return apagarEsteAparelho('saiu');   // celular: sai e não deixa dados para trás
  const eu = meuAparelho().id;
  try { await alterarAparelhos(l => { delete l[eu]; return l; }); } catch (e) {}
  cfg = null;
  gravarCfg();
  clearTimeout(relogio);
  qrAberto = '';
  codigoReutilizavel = ''; pedidoDono = null; liberacaoDono = '';
  definirStatus('off');
}

// ---------- aparência

const TEXTOS = {
  off: 'Só neste aparelho', pendente: 'Alterações a enviar', sincronizando: 'Sincronizando…',
  ok: 'Sincronizado', offline: 'Sem internet', erro: 'Erro ao sincronizar',
};
function definirStatus(s, m = '') { status = s; msg = m; pintar(); }
function pintar() {
  for (const el of document.querySelectorAll('.selo-sinc')) el.outerHTML = selo();
  const caixa = document.getElementById('sinc-caixa');
  if (caixa && cfg) caixa.innerHTML = caixaHTML();
}

// Selo pequeno na barra do topo
export const selo = () => (cfg ? `<span class="selo-sinc s-${status}" title="${esc(msg || TEXTOS[status])}"><i></i><span>${TEXTOS[status]}</span></span>` : '');

function caixaHTML() {
  return `<div class="alerta s-${status}"><b>${TEXTOS[status]}</b>${msg ? ` — ${esc(msg)}` : ''}<br>
    Repositório <b>${esc(cfg.repo)}</b>${cfg.ultima ? ` · última sincronização ${new Date(cfg.ultima).toLocaleString('pt-BR')}` : ''}</div>`;
}

const emEnderecoPublico = () => !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && location.protocol === 'https:';

function formularioConexao() {
  return `
    <p class="dica esq" style="margin-top:0">Os dados ficam num repositório <b>privado</b> do seu GitHub. Configure <b>no computador principal</b>; os outros aparelhos entram por solicitação de acesso ou QR Code.</p>
    <ol class="passos">
      <li><b>Crie o repositório privado</b> dos dados:
        <a class="botao pequeno" href="https://github.com/new?name=${REPO_SUGERIDO}&visibility=private" target="_blank" rel="noopener">Abrir no GitHub</a>
        <div class="nota">Nome <code>${REPO_SUGERIDO}</code>, marque <b>Private</b> e clique em <b>Create repository</b>.</div></li>
      <li><b>Crie a chave de acesso</b>:
        <a class="botao pequeno" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Abrir no GitHub</a>
        <div class="nota">Token name: <code>App Marmoraria</code> · Expiration: a mais longa · Repository access: <b>Only select repositories</b> → <code>${REPO_SUGERIDO}</code> ·
        Permissions → Repository permissions → <b>Contents: Read and write</b> · clique em <b>Generate token</b> e copie.</div></li>
      <li><b>Cole aqui</b> e conecte:
        <div class="linha" style="margin-top:8px">
          <div><label for="sinc-repo">Repositório (usuario/nome)</label><input id="sinc-repo" autocomplete="off" placeholder="seu_usuario/${REPO_SUGERIDO}"></div>
          <div><label for="sinc-token">Chave (token)</label><input id="sinc-token" type="password" autocomplete="off" placeholder="github_pat_…"></div>
        </div>
        <button class="primario" style="margin-top:10px" data-acao="sinc-conectar">Conectar</button>
        <div id="sinc-erro"></div></li>
    </ol>`;
}

// Cartões da tela de ajustes
export function cartao() {
  if (!cfg) return `<div class="card">${formularioConexao()}</div>`;
  const principal = ehPrincipal();
  return `
    <div class="card">
      <div id="sinc-caixa">${caixaHTML()}</div>
      <label for="sinc-nome" style="margin-top:12px">Nome deste aparelho (é como ele aparece na lista de aparelhos autorizados)</label>
      <input id="sinc-nome" data-apar-nome="${meuAparelho().id}" value="${esc(meuAparelho().nome)}" placeholder="Ex.: Celular do João" autocomplete="off">
      <div class="linha" style="margin-top:12px">
        <button class="primario" data-acao="sinc-agora">Sincronizar agora</button>
        ${principal ? '<button data-acao="sinc-qr">Conectar outro aparelho</button>' : ''}
        <button class="perigo" data-acao="sinc-sair" data-confirma="Tocar de novo para desconectar">Desconectar este aparelho</button>
      </div>
      <div id="sinc-qr">${qrAberto}</div>
      ${principal ? '' : '<p class="nota">Ao desconectar, os dados da marmoraria são apagados deste aparelho (continuam na nuvem).</p>'}
    </div>
    ${principal ? `
    ${painelCodigoReutilizavel()}
    ${painelAprovacao()}
    <h2>Aparelhos autorizados</h2>
    <div class="card">
      <p class="dica esq" style="margin-top:0">Toque no nome de um aparelho para renomear (por exemplo, “Celular do João”). Marque o que cada aparelho pode acessar. “Desconectar” tira o aparelho da sincronização e apaga dele os dados da marmoraria na próxima vez que ele abrir o sistema com internet. As mudanças chegam ao aparelho em até 5 minutos.</p>
      <div id="sinc-aparelhos"><div class="nota">Carregando…</div></div>
      <button class="link" data-acao="apar-atualizar">Atualizar a lista</button>
    </div>
    <h2>Trocar a chave</h2>
    <div class="card">
      <p class="dica esq" style="margin-top:0">Use se um aparelho foi <b>perdido ou roubado</b>: o acesso dele cai na hora. Crie uma chave nova no GitHub (igual à primeira), cole aqui e depois <b>apague a chave antiga</b> no GitHub. Os outros aparelhos precisarão ler o QR Code de novo.</p>
      <div class="linha" style="align-items:flex-end">
        <div style="flex:3"><label for="sinc-nova">Chave nova</label><input id="sinc-nova" type="password" autocomplete="off" placeholder="github_pat_…"></div>
        <button data-acao="sinc-trocar">Trocar a chave</button>
      </div>
    </div>` : ''}`;
}

// Tela mostrada em aparelho não autorizado: não dá acesso a nada do sistema
export function telaBloqueio() {
  const motivo = (() => { try { const m = localStorage.getItem(CHAVE_REVOGADO); localStorage.removeItem(CHAVE_REVOGADO); return m; } catch (e) { return null; } })();
  return `
    <div class="bloqueio">
      <div class="bloqueio-icone"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6z"/><path d="M9.500 12l2 2 3.500-4"/></svg></div>
      <h1>Aparelho não autorizado</h1>
      <p>Este sistema só abre em aparelhos liberados pelo computador principal.</p>
      ${motivo ? `<div class="alerta s-offline">${motivo === 'chave' ? 'A chave de acesso foi trocada no computador principal' : 'Este aparelho foi desconectado pelo computador principal'} e os dados da marmoraria foram apagados dele.</div>` : ''}
      ${painelSolicitacao()}
      ${painelEntrarComCodigo()}
      <details class="card">
        <summary>Conectar pela câmera do celular</summary>
        <ol class="passos" style="margin-top:8px">
          <li>No computador principal, abra <b>Ajustes → Computador e celular</b>.</li>
          <li>Clique em <b>Conectar outro aparelho</b> e escolha o perfil.</li>
          <li>Aponte a câmera deste aparelho para o QR Code e toque no link.</li>
        </ol>
      </details>
      <details class="card">
        <summary>Sou o dono e quero configurar este aparelho como computador principal</summary>
        <div style="margin-top:14px">${formularioConexao()}</div>
      </details>
    </div>`;
}

// Endereço do sistema na internet, para onde o QR Code leva o aparelho. Aberto pelo
// computador em localhost, usa o GitHub Pages da mesma conta do repositório dos dados.
const enderecoPublicado = () => (emEnderecoPublico()
  ? location.origin + location.pathname
  : `https://${cfg.repo.split('/')[0].toLowerCase()}.github.io/marmoraria/`);

async function mostrarQR() {
  const endereco = enderecoPublicado();
  if (!emEnderecoPublico()) {
    const noAr = await fetch(endereco + 'manifest.webmanifest', { cache: 'no-store' }).then(r => r.ok, () => false);
    if (!noAr) {
      qrAberto = `<div class="alerta s-offline" style="margin-top:12px">O aparelho precisa abrir o sistema pela internet, e ele ainda não foi encontrado em <b>${esc(endereco)}</b>. Publique a pasta do sistema no GitHub Pages (veja o arquivo PUBLICAR.md) e toque aqui de novo.</div>`;
      return;
    }
  }
  if (!window.qrcode) {
    await new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = ok; s.onerror = erro;
      document.head.appendChild(s);
    });
  }
  const codigo = btoa(JSON.stringify({ r: cfg.repo, t: cfg.token, p: qrPerfil }));
  const qr = window.qrcode(0, 'M');
  qr.addData(`${endereco}#conectar=${encodeURIComponent(codigo)}`);
  qr.make();
  qrAberto = `
    <label style="margin-top:14px">Quem vai usar o aparelho</label>
    <div class="seg">
      ${Object.keys(PERFIS).map(p => `<button class="${qrPerfil === p ? 'ativo' : ''}" data-acao="sinc-perfil" data-perfil="${p}">${PERFIS[p].nome} <small>(${PERFIS[p].detalhe})</small></button>`).join('')}
    </div>
    <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
    <p class="dica">O aparelho vai abrir <b>${esc(endereco)}</b></p>
    <ol class="passos">
      <li>No celular, abra a câmera, aponte para o código e toque no link.</li>
      <li>No menu do navegador do celular, escolha <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).</li>
    </ol>
    <div class="alerta s-offline">Este código dá acesso aos dados da marmoraria. Não mostre nem envie para outras pessoas. Depois de conectado, os acessos do aparelho podem ser ajustados em “Aparelhos autorizados”.</div>`;
}

async function abrirQR() {
  try { await mostrarQR(); } catch (e) { aviso('Não foi possível gerar o QR Code (sem internet?).'); return; }
  redesenhar();
}

export const acoes = {
  'codigo-baixar': el => acaoPedido(el, async () => {
    if (!ehPrincipal() || !codigoReutilizavel) throw new Error('Gere o código no computador principal.');
    const texto = `Marmoraria — código reutilizável de acesso\nPerfil: ${PERFIS[perfilReutilizavel].nome}\nGuarde em local privado. Quem tiver este código pode conectar aparelhos.\nNo aparelho novo, escolha Já tenho um código de acesso e cole a linha abaixo.\n\n${codigoReutilizavel}\n`;
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'marmoraria-codigo-acesso.txt';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'codigo-erro'),
  'codigo-gerar': el => acaoPedido(el, async () => {
    if (!ehPrincipal()) throw new Error('Somente o computador principal pode gerar códigos.');
    perfilReutilizavel = document.getElementById('codigo-perfil').value;
    codigoReutilizavel = criarCodigoReutilizavel(cfg, perfilReutilizavel);
    redesenhar();
  }, 'codigo-erro'),
  'codigo-entrar': el => acaoPedido(el, async () => {
    if (cfg) throw new Error('Este aparelho já está conectado.');
    const d = lerCodigoReutilizavel(document.getElementById('codigo-entrada').value);
    await conectar(d.r, d.t, false, d.p);
    localStorage.removeItem(CHAVE_PEDIDO);
    aviso('Aparelho conectado. Guarde o código em local privado para usar novamente.');
    redesenhar(false);
  }, 'codigo-erro'),
  'pedido-gerar': el => acaoPedido(el, async () => {
    if (cfg) throw new Error('Este aparelho já está conectado.');
    const p = await criarSolicitacao(document.getElementById('pedido-nome').value);
    localStorage.setItem(CHAVE_PEDIDO, JSON.stringify(p));
    redesenhar();
  }),
  'pedido-cancelar': () => { localStorage.removeItem(CHAVE_PEDIDO); redesenhar(); },
  'pedido-copiar': el => acaoPedido(el, async () => {
    const campo = document.getElementById(el.dataset.campo);
    try { await navigator.clipboard.writeText(campo.value); aviso('Código copiado.'); }
    catch { campo.focus(); campo.select(); aviso('Código selecionado. Use Copiar do navegador ou Ctrl+C.'); }
  }),
  'pedido-conferir': el => acaoPedido(el, async () => {
    if (!ehPrincipal()) throw new Error('Somente o computador principal pode aprovar.');
    pedidoDono = null; liberacaoDono = ''; pedidoPerfil = 'vendedor';
    const codigo = document.getElementById('dono-pedido').value;
    const p = lerSolicitacao(codigo);
    pedidoDono = { ...p, codigo };
    redesenhar();
  }),
  'pedido-aprovar': el => acaoPedido(el, async () => {
    if (!ehPrincipal() || !pedidoDono) throw new Error('Confira a solicitação no computador principal.');
    // Usa exclusivamente o pedido já conferido, não um texto trocado depois no campo.
    pedidoPerfil = document.getElementById('dono-perfil').value;
    liberacaoDono = await aprovarSolicitacao(pedidoDono.codigo, cfg, pedidoPerfil);
    redesenhar();
  }),
  'pedido-entrar': el => acaoPedido(el, async () => {
    if (cfg) throw new Error('Este aparelho já está conectado.');
    const pendente = ler(CHAVE_PEDIDO);
    const d = await abrirLiberacao(document.getElementById('pedido-resposta').value, pendente);
    localStorage.setItem(CHAVE_APAR, JSON.stringify({ id: novoId(), nome: pendente.nome }));
    await conectar(d.r, d.t, false, d.p);
    localStorage.removeItem(CHAVE_PEDIDO);
    aviso('Aparelho liberado. Os dados foram baixados.');
    redesenhar(false);
  }),
  'sinc-agora': async () => { ultimaVerif = 0; await sincronizar(); if (status === 'ok') aviso('Sincronizado.'); carregarAparelhos(); },
  'sinc-sair': async () => { await desconectar(); redesenhar(false); },
  'sinc-qr': async () => { if (qrAberto) { qrAberto = ''; redesenhar(); } else await abrirQR(); },
  'sinc-perfil': async el => { qrPerfil = el.dataset.perfil; await abrirQR(); },
  'sinc-conectar': async el => {
    el.disabled = true; el.textContent = 'Conectando…';
    try {
      await conectar(document.getElementById('sinc-repo').value, document.getElementById('sinc-token').value);
      aviso('Conectado. Agora conecte os outros aparelhos pelo QR Code.');
      redesenhar(false);
    } catch (e) {
      // a mensagem fica na tela (o aviso rápido some antes de dar para ler)
      document.getElementById('sinc-erro').innerHTML = `<div class="alerta s-erro" style="margin-top:12px"><b>Não foi possível conectar:</b> ${esc(e.message)}</div>`;
      el.disabled = false; el.textContent = 'Conectar';
    }
  },
  'sinc-trocar': async el => {
    el.disabled = true;
    try {
      await trocarChave(document.getElementById('sinc-nova').value);
      aviso('Chave trocada. Apague a antiga no GitHub e reconecte os outros aparelhos.');
      ultimaVerif = 0;
      await sincronizar();
      redesenhar();
    } catch (e) {
      aviso('Não foi possível trocar: ' + e.message);
      el.disabled = false;
    }
  },
  'apar-atualizar': () => carregarAparelhos(),
  'apar-revogar': async el => {
    try {
      await alterarAparelhos(l => { if (l[el.dataset.id]) { l[el.dataset.id].revogado = true; l[el.dataset.id].revogadoEm = agora(); } return l; });
      aviso('O aparelho será desconectado.');
    } catch (e) { aviso('Erro: ' + e.message); }
    carregarAparelhos();
  },
  'apar-remover': async el => {
    try { await alterarAparelhos(l => { delete l[el.dataset.id]; return l; }); } catch (e) { aviso('Erro: ' + e.message); }
    carregarAparelhos();
  },
};

// Acessos marcados ou desmarcados na lista de aparelhos
export function entrada(el) {
  if (!el.dataset.aparAcesso) return;
  const id = el.dataset.aparAcesso, modulo = el.dataset.modulo, marcado = el.checked;
  alterarAparelhos(l => { if (l[id]) l[id].acessos = { ...(l[id].acessos || {}), [modulo]: marcado }; return l; })
    .then(() => aviso('Acesso atualizado.'))
    .catch(e => { aviso('Erro: ' + e.message); carregarAparelhos(); });
}

// Nome do aparelho alterado na lista
export function mudanca(el) {
  if (!el.dataset.aparNome) return;
  const id = el.dataset.aparNome, nome = el.value.trim();
  if (!nome) return;
  alterarAparelhos(l => { if (l[id]) l[id].nome = nome; return l; })
    .then(() => {
      if (id === meuAparelho().id) { try { localStorage.setItem(CHAVE_APAR, JSON.stringify({ id, nome })); } catch (e) {} }
      // o mesmo nome pode estar em dois campos da tela (o deste aparelho e o da lista)
      for (const campo of document.querySelectorAll(`[data-apar-nome="${id}"]`)) if (campo !== el) campo.value = nome;
      aviso('Nome atualizado.');
    })
    .catch(e => aviso('Erro: ' + e.message));
}

// Aparelho chegando pelo QR Code: #conectar=<código>. Vale ao abrir o sistema e também
// quando ele já estava aberto e o link do QR só trocou o endereço.
export function conectarPeloLink() {
  const m = location.hash.match(/^#conectar=(.+)$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search + '#/');   // tira a chave da barra de endereço
  try {
    const { r, t, p } = JSON.parse(atob(decodeURIComponent(m[1])));
    conectar(r, t, false, p || 'dono')
      .then(() => { aviso('Aparelho conectado. Os dados foram baixados.'); redesenhar(false); })
      .catch(e => { aviso('Não foi possível conectar: ' + e.message); redesenhar(false); });
  } catch (e) {
    aviso('Código de conexão inválido.');
  }
  return true;
}

// Chamado uma vez ao abrir o sistema
export function iniciar() {
  definirAoMudar(() => {
    if (!cfg) return;
    if (status !== 'sincronizando') definirStatus('pendente');
    agendar();
  });
  const veioPeloLink = conectarPeloLink();
  setInterval(() => { if (cfg && document.visibilityState === 'visible') agendar(0); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(0); });
  addEventListener('online', () => agendar(0));
  addEventListener('offline', () => cfg && definirStatus('offline'));
  if (cfg && !veioPeloLink) agendar(300);
}
