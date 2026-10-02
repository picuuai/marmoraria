// Sincronização entre aparelhos usando um repositório PRIVADO do GitHub.
// - dados.json guarda todos os dados do sistema.
// - A chave (token) fica só no navegador de cada aparelho. O celular recebe a chave por QR Code.
// - Quando dois aparelhos mudam ao mesmo tempo, as alterações são juntadas registro a registro:
//   em cada registro vale a versão alterada por último (atualizadoEm).
import { LOJAS, tudo, substituir, definirAoMudar } from './db.js';
import { esc, agora } from './util.js';
import { redesenhar, aviso } from './nucleo.js';
import { atualizarTexturas } from './desenho.js';

const CHAVE = 'marmoraria-sinc';
const ARQUIVO = 'dados.json';
const REPO_SUGERIDO = 'marmoraria_dados';

let cfg = ler();                    // { repo, token, ultima, principal }
let status = cfg ? 'pendente' : 'off', msg = '';
let relogio = 0, rodando = false, denovo = false, qrAberto = '';

function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
function gravarCfg() {
  try { if (cfg) localStorage.setItem(CHAVE, JSON.stringify(cfg)); else localStorage.removeItem(CHAVE); } catch (e) {}
}
const aparelho = () => (/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular' : 'computador');
const ehPrincipal = () => !!cfg && cfg.principal !== false;

// ---------- junção das alterações

// Mesma ordem em todos os aparelhos, para o arquivo só mudar quando os dados mudam
export function organizar(dados) {
  const o = {};
  for (const l of LOJAS) o[l] = (dados[l] || []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
async function lerArquivo(c = cfg) {
  const r = await gh(`/contents/${ARQUIVO}`, {}, c);
  if (r.status === 404) return null;
  if (!r.ok) throw erroGH(r, await r.text());
  const j = await r.json();
  let bytes;
  if (j.encoding === 'base64' && j.content) bytes = b64dec(j.content);
  else { // arquivos acima de 1 MB vêm só pelo modo "raw"
    const r2 = await gh(`/contents/${ARQUIVO}`, { headers: { Accept: 'application/vnd.github.raw+json' } }, c);
    if (!r2.ok) throw erroGH(r2, await r2.text());
    bytes = new Uint8Array(await r2.arrayBuffer());
  }
  return { sha: j.sha, texto: new TextDecoder().decode(bytes) };
}
async function gravarArquivo(texto, sha) {
  const r = await gh(`/contents/${ARQUIVO}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `sync ${aparelho()} ${new Date().toLocaleString('pt-BR')}`, content: b64enc(new TextEncoder().encode(texto)), ...(sha ? { sha } : {}) }),
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
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const localStr = JSON.stringify(organizar(tudo()));
      const rem = await lerArquivo();
      const remoto = rem ? JSON.parse(rem.texto).lojas : null;
      const final = remoto ? juntar(JSON.parse(localStr), remoto) : JSON.parse(localStr);
      corrigirNumeros(final);
      const finalStr = JSON.stringify(final);
      if (!remoto || finalStr !== JSON.stringify(organizar(remoto))) {
        try { await gravarArquivo(JSON.stringify({ sistema: 'marmoraria', versao: 1, lojas: final }), rem ? rem.sha : null); }
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
    definirStatus(navigator.onLine ? 'erro' : 'offline', e.status === 401 ? 'a chave foi apagada ou venceu: desconecte e conecte de novo com uma chave nova' : e.message);
  } finally {
    rodando = false;
    if (denovo) { denovo = false; agendar(1500); }
  }
}

async function conectar(repo, token, principal = true) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('o repositório deve ficar no formato usuario/nome');
  if (!token) throw new Error('cole a chave do GitHub');
  const novo = { repo, token, principal };
  const r = await gh('', {}, novo);
  if (r.status === 404 || r.status === 401) throw new Error(await diagnosticar(novo));
  if (!r.ok) throw erroGH(r, await r.text());
  if (!(await r.json()).private) throw new Error('o repositório precisa ser PRIVADO (os dados da marmoraria ficariam públicos)');
  cfg = novo;
  gravarCfg();
  await sincronizar();
  if (status === 'erro') throw new Error(msg || 'falha ao sincronizar');
}

function desconectar() {
  cfg = null;
  gravarCfg();
  clearTimeout(relogio);
  qrAberto = '';
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
  if (caixa) caixa.innerHTML = caixaHTML();
}

// Selo pequeno na barra do topo (só aparece com a sincronização ligada)
export const selo = () => (cfg ? `<span class="selo-sinc s-${status}" title="${esc(msg || TEXTOS[status])}"><i></i><span>${TEXTOS[status]}</span></span>` : '');

function caixaHTML() {
  return `<div class="alerta s-${status}"><b>${TEXTOS[status]}</b>${msg ? ` — ${esc(msg)}` : ''}<br>
    Repositório <b>${esc(cfg.repo)}</b>${cfg.ultima ? ` · última sincronização ${new Date(cfg.ultima).toLocaleString('pt-BR')}` : ''}</div>`;
}

const emEnderecoPublico = () => !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && location.protocol === 'https:';

// Cartão da tela de ajustes
export function cartao() {
  if (cfg) {
    return `
      <div class="card">
        <div id="sinc-caixa">${caixaHTML()}</div>
        <div class="linha" style="margin-top:12px">
          <button class="primario" data-acao="sinc-agora">Sincronizar agora</button>
          ${ehPrincipal() ? '<button data-acao="sinc-qr">Conectar o celular</button>' : ''}
          <button class="perigo" data-acao="sinc-sair" data-confirma="Tocar de novo para desconectar">Desconectar este aparelho</button>
        </div>
        <div id="sinc-qr">${qrAberto}</div>
        <ul class="lista-notas">
          <li>As alterações são enviadas sozinhas alguns segundos depois de salvar, e o sistema busca novidades a cada minuto.</li>
          <li>Sem internet o sistema continua funcionando e sincroniza quando a conexão voltar.</li>
          <li>Se dois aparelhos mexerem no mesmo orçamento ao mesmo tempo, vale o que foi salvo por último.</li>
          <li>Perdeu um aparelho? No GitHub, em <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">Settings → Personal access tokens</a>, apague a chave e crie outra.</li>
        </ul>
      </div>`;
  }
  return `
    <div class="card">
      <p class="dica esq" style="margin-top:0">Os dados ficam num repositório <b>privado</b> do seu GitHub. Configure <b>no computador</b>; o celular se conecta depois lendo um QR Code.</p>
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
      </ol>
    </div>`;
}

async function mostrarQR() {
  if (!emEnderecoPublico()) {
    qrAberto = '<div class="alerta s-offline" style="margin-top:12px">O QR Code leva o celular para o endereço do sistema na internet. Abra o sistema pelo endereço publicado (GitHub Pages) e toque aqui de novo.</div>';
    return;
  }
  if (!window.qrcode) {
    await new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = ok; s.onerror = erro;
      document.head.appendChild(s);
    });
  }
  const codigo = btoa(JSON.stringify({ r: cfg.repo, t: cfg.token }));
  const qr = window.qrcode(0, 'M');
  qr.addData(`${location.origin}${location.pathname}#conectar=${encodeURIComponent(codigo)}`);
  qr.make();
  qrAberto = `
    <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
    <ol class="passos">
      <li>No celular, abra a câmera, aponte para o código e toque no link.</li>
      <li>No menu do navegador do celular, escolha <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).</li>
    </ol>
    <div class="alerta s-offline">Este código dá acesso aos dados da marmoraria. Não mostre nem envie para outras pessoas.</div>`;
}

export const acoes = {
  'sinc-agora': async () => { await sincronizar(); if (status === 'ok') aviso('Sincronizado.'); },
  'sinc-sair': () => { desconectar(); redesenhar(); },
  'sinc-qr': async () => {
    if (qrAberto) qrAberto = '';
    else { try { await mostrarQR(); } catch (e) { aviso('Não foi possível gerar o QR Code (sem internet?).'); return; } }
    redesenhar();
  },
  'sinc-conectar': async el => {
    el.disabled = true; el.textContent = 'Conectando…';
    try {
      await conectar(document.getElementById('sinc-repo').value, document.getElementById('sinc-token').value);
      aviso('Conectado. Agora conecte o celular pelo QR Code.');
      redesenhar();
    } catch (e) {
      // a mensagem fica na tela (o aviso rápido some antes de dar para ler)
      if (cfg && status === 'erro') desconectar();
      document.getElementById('sinc-erro').innerHTML = `<div class="alerta s-erro" style="margin-top:12px"><b>Não foi possível conectar:</b> ${esc(e.message)}</div>`;
      el.disabled = false; el.textContent = 'Conectar';
    }
  },
};

// Chamado uma vez ao abrir o sistema
export function iniciar() {
  definirAoMudar(() => {
    if (!cfg) return;
    if (status !== 'sincronizando') definirStatus('pendente');
    agendar();
  });
  // celular chegando pelo QR Code: #conectar=<código>
  const m = location.hash.match(/^#conectar=(.+)$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search + '#/ajustes');   // tira a chave da barra de endereço
    try {
      const { r, t } = JSON.parse(atob(decodeURIComponent(m[1])));
      conectar(r, t, false)
        .then(() => { aviso('Aparelho conectado. Os dados foram baixados.'); redesenhar(false); })
        .catch(e => aviso('Não foi possível conectar: ' + e.message));
    } catch (e) {
      aviso('Código de conexão inválido.');
    }
  }
  setInterval(() => { if (cfg && document.visibilityState === 'visible') agendar(0); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(0); });
  addEventListener('online', () => agendar(0));
  addEventListener('offline', () => cfg && definirStatus('offline'));
  if (cfg && !m) agendar(300);
}
