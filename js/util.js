// Funções pequenas usadas no sistema todo: números, moeda, datas e texto seguro para HTML

export const num = v => {
  const s = String(v ?? '').trim();
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0;
};
export const moeda = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const m2 = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' m²';
export const pct = v => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
export const medida = v => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const emCampo = v => (v ? v.toFixed(2).replace('.', ',') : '');
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const agora = () => new Date().toISOString();
export const dataBR = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

// Identificador único gerado no aparelho: é o que evita duplicação na sincronização
export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Busca sem diferenciar maiúsculas nem acentos
export const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
