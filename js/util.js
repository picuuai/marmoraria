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

// Datas sem hora (vencimentos): texto AAAA-MM-DD no fuso do aparelho
export const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// Dia (AAAA-MM-DD) no fuso do aparelho de um instante gravado em ISO (UTC)
export const diaLocal = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const diaBR = d => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
export function somarDias(d, dias) {
  const [a, m, di] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, di + dias)).toISOString().slice(0, 10);
}
// Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02)
export function somarMeses(d, meses) {
  const [a, m, di] = d.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(di, ultimo))).toISOString().slice(0, 10);
}
export const arred = v => Math.round((v || 0) * 100) / 100;

// CPF e CNPJ: confere os dígitos verificadores
export const soDigitos = s => String(s ?? '').replace(/\D/g, '');
function cpfValido(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
function cnpjValido(c) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +c[12] && dv(13) === +c[13];
}
// 'cpf', 'cnpj', 'invalido' ou '' (vazio)
export function tipoDocumento(s) {
  const c = soDigitos(s);
  if (!c) return '';
  return c.length === 11 && cpfValido(c) ? 'cpf' : c.length === 14 && cnpjValido(c) ? 'cnpj' : 'invalido';
}
