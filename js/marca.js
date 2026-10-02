// Logo da marmoraria: a imagem enviada nos ajustes ou, sem ela, o símbolo padrão
import { config } from './db.js';
import { esc } from './util.js';

export const SIMBOLO = '<svg viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="var(--accent)"/><path d="M6 19 L14 8 L22 19 Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 22.5 H22" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';

export const logo = (cls = '') => (config().logo
  ? `<span class="logo ${cls}"><img src="${esc(config().logo)}" alt="Logo de ${esc(config().empresa)}"></span>`
  : `<span class="logo padrao ${cls}">${SIMBOLO}</span>`);

// Reduz a imagem escolhida para caber bem na folha e não pesar na sincronização
export async function prepararLogo(arquivo) {
  const img = await new Promise((ok, erro) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
    i.src = URL.createObjectURL(arquivo);
  });
  const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  // PNG mantém fundo transparente; se ficar pesado, vira JPEG com fundo branco
  let dados = c.toDataURL('image/png');
  if (dados.length > 400000) {
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    dados = c.toDataURL('image/jpeg', 0.85);
  }
  return dados;
}
