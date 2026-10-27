// Ligação entre as telas e a moldura do sistema, sem que uma precise importar a outra

let redesenho = () => {};
export const definirRedesenho = f => { redesenho = f; };

// Redesenha a tela atual. manter = true preserva a posição de rolagem.
export const redesenhar = (manter = true) => redesenho(manter);

// Vai para outra tela
export function ir(hash) {
  if (location.hash === hash) redesenho(false);
  else location.hash = hash;
}

// Janela de pergunta no meio da tela. Devolve true (botão principal) ou false (o outro, Esc ou fora).
// Com ler(janela), o botão principal devolve o que ler retornar (para janelas com campos).
let janelaAberta = false;
export function perguntar({ titulo, corpo, sim = 'Confirmar', nao = 'Cancelar', ler }) {
  if (janelaAberta) return Promise.resolve(false);
  janelaAberta = true;
  return new Promise(resolver => {
    const d = document.createElement('dialog');
    d.className = 'janela';
    d.innerHTML = `<h2>${titulo}</h2><div class="janela-corpo">${corpo}</div>
      <div class="linha"><button value="nao">${nao}</button><button class="primario" value="sim">${sim}</button></div>`;
    const fechar = resposta => {
      const valor = resposta && ler ? ler(d) : resposta;
      janelaAberta = false; d.remove(); resolver(valor);
    };
    d.addEventListener('click', e => {
      const r = d.getBoundingClientRect();
      const fora = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (e.target === d && fora) fechar(false);                           // tocou fora da janela
      else if (e.target.closest('button')) fechar(e.target.closest('button').value === 'sim');
    });
    d.addEventListener('cancel', e => { e.preventDefault(); fechar(false); });   // tecla Esc
    document.body.appendChild(d);
    d.showModal();
    const campo = d.querySelector('.janela-corpo input');
    if (campo) campo.focus();
  });
}

// Aviso rápido no rodapé da tela
let relogio = null;
export function aviso(texto) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(relogio);
  relogio = setTimeout(() => el.classList.remove('visivel'), 2600);
}

// Instalação como aplicativo: o navegador avisa quando dá para instalar (Chrome, Edge, Samsung)
export const instalacao = { evento: null };
export const jaInstalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalacao.evento = e; redesenho(true); });
addEventListener('appinstalled', () => { instalacao.evento = null; redesenho(true); });

// O tema é uma preferência de cada aparelho: fica fora dos dados sincronizados
export const temaSalvo = () => { try { return localStorage.getItem('marmoraria-tema') || 'auto'; } catch (e) { return 'auto'; } };
export const salvarTema = t => { try { localStorage.setItem('marmoraria-tema', t); } catch (e) {} };

// Impressão: a folha sai sempre no tema claro. Troca o tema antes de imprimir e devolve depois,
// porque alguns celulares levam o modo escuro para o PDF.
let temaAntes = null;
function prepararImpressao() {
  const raiz = document.documentElement;
  if (temaAntes === null) temaAntes = { tema: raiz.dataset.tema, fundo: raiz.dataset.fundo };
  raiz.dataset.tema = 'claro';
  raiz.dataset.fundo = 'liso';
}
function terminarImpressao() {
  if (temaAntes === null) return;
  const raiz = document.documentElement;
  raiz.dataset.tema = temaAntes.tema;
  raiz.dataset.fundo = temaAntes.fundo;
  temaAntes = null;
}
addEventListener('beforeprint', prepararImpressao);
// no celular o aviso de "impressão terminou" chega antes de o PDF ser gerado: lá o tema só volta no próximo toque
const emCelular = () => matchMedia('(pointer: coarse)').matches;
addEventListener('afterprint', () => { if (!emCelular()) terminarImpressao(); else setTimeout(() => addEventListener('pointerdown', terminarImpressao, { once: true }), 1000); });
export function imprimir() {
  prepararImpressao();
  // pequena espera para o navegador redesenhar no tema claro antes de abrir a impressão
  setTimeout(() => {
    window.print();
    // onde o navegador não avisa que a impressão acabou, devolve o tema quando a tela voltar a ser usada
    setTimeout(() => addEventListener('pointerdown', terminarImpressao, { once: true }), 1000);
  }, 150);
}

export const fundoSalvo = () => { try { return localStorage.getItem('marmoraria-fundo') || 'aurora'; } catch (e) { return 'aurora'; } };
export const salvarFundo = f => { try { localStorage.setItem('marmoraria-fundo', f); } catch (e) {} };

// Claro ou escuro e fundo são de cada aparelho; a cor do tema é da marmoraria (vem dos ajustes)
export function aplicarTema(cor) {
  const tema = temaSalvo(), raiz = document.documentElement;
  const escuro = tema === 'escuro' || (tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  raiz.dataset.tema = escuro ? 'escuro' : 'claro';
  raiz.dataset.fundo = fundoSalvo();
  if (cor) raiz.dataset.cor = cor;
}
