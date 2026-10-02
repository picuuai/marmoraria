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

// O tema é uma preferência de cada aparelho: fica fora dos dados sincronizados
export const temaSalvo = () => { try { return localStorage.getItem('marmoraria-tema') || 'auto'; } catch (e) { return 'auto'; } };
export const salvarTema = t => { try { localStorage.setItem('marmoraria-tema', t); } catch (e) {} };

export function aplicarTema(tema = temaSalvo()) {
  const escuro = tema === 'escuro' || (tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
}
