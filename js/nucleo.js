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
