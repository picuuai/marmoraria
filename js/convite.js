// Troca manual sem servidor: o pedido leva apenas uma chave pública.
// A resposta com as credenciais só pode ser aberta pelo navegador solicitante.
const enc = new TextEncoder(), dec = new TextDecoder();
const rsa = { name: 'RSA-OAEP', hash: 'SHA-256' };
const b64 = v => btoa(String.fromCharCode(...new Uint8Array(v)));
const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const codigo = (tipo, valor) => tipo + b64(enc.encode(JSON.stringify(valor)));
// Mesma autorização portátil do QR Code existente. Deve ser guardada como uma chave.
export function criarCodigoReutilizavel(conexao, perfil) {
  const d = { r: conexao.repo, t: conexao.token, p: perfil };
  validarConexao(d);
  return codigo('MAR-CONEXAO-1:', d);
}
function validarConexao(d) {
  if (!d || !['dono', 'vendedor'].includes(d.p) || typeof d.r !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(d.r) || typeof d.t !== 'string' || !d.t.trim()) throw new Error('Código de conexão inválido.');
}
export function lerCodigoReutilizavel(texto) {
  const d = ler(texto, 'MAR-CONEXAO-1:');
  validarConexao(d);
  return { r: d.r, t: d.t, p: d.p };
}
function ler(texto, tipo) {
  const s = String(texto).replace(/\s/g, '');
  if (s.length > 16000 || !s.startsWith(tipo)) throw new Error('Código inválido. Copie o código completo.');
  try { return JSON.parse(dec.decode(bytes(s.slice(tipo.length)))); }
  catch { throw new Error('Código inválido. Copie o código completo.'); }
}
export function lerSolicitacao(texto) {
  const d = ler(texto, 'MAR-PEDIDO-1:');
  if (typeof d.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(d.id) || typeof d.nome !== 'string' || !d.nome.trim() || d.nome.length > 80 || typeof d.publica !== 'string' || d.publica.length > 1000) throw new Error('Solicitação inválida.');
  return d;
}
export async function criarSolicitacao(nome, agora = Date.now()) {
  if (!globalThis.crypto?.subtle) throw new Error('Abra o sistema pelo endereço HTTPS para solicitar acesso.');
  nome = nome.trim();
  if (!nome || nome.length > 80) throw new Error('Informe um nome de até 80 caracteres para este aparelho.');
  const par = await crypto.subtle.generateKey({ ...rsa, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  const pedido = { id: crypto.randomUUID(), nome, criado: agora, publica: b64(await crypto.subtle.exportKey('spki', par.publicKey)) };
  return { pedido: codigo('MAR-PEDIDO-1:', pedido), id: pedido.id, nome, privada: await crypto.subtle.exportKey('jwk', par.privateKey) };
}
export async function aprovarSolicitacao(texto, conexao, perfil, agora = Date.now()) {
  const pedido = lerSolicitacao(texto, agora);
  if (!['vendedor', 'dono'].includes(perfil)) throw new Error('Escolha o perfil de acesso.');
  const publica = await crypto.subtle.importKey('spki', bytes(pedido.publica), rsa, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = { id: pedido.id, nome: pedido.nome, r: conexao.repo, t: conexao.token, p: perfil, criado: agora };
  const conteudo = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(dados)));
  const chave = await crypto.subtle.encrypt(rsa, publica, await crypto.subtle.exportKey('raw', aes));
  return codigo('MAR-ACESSO-1:', { chave: b64(chave), iv: b64(iv), conteudo: b64(conteudo) });
}
export async function abrirLiberacao(texto, pendente) {
  if (!pendente) throw new Error('Gere uma solicitação neste navegador antes de liberar.');
  const resposta = ler(texto, 'MAR-ACESSO-1:');
  let d;
  try {
    const privada = await crypto.subtle.importKey('jwk', pendente.privada, rsa, false, ['decrypt']);
    const raw = await crypto.subtle.decrypt(rsa, privada, bytes(resposta.chave));
    const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    d = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(resposta.iv) }, aes, bytes(resposta.conteudo))));
  } catch { throw new Error('Esta liberação não corresponde à solicitação deste navegador ou foi alterada.'); }
  if (d.id !== pendente.id || !['dono', 'vendedor'].includes(d.p) || typeof d.r !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(d.r) || typeof d.t !== 'string' || !d.t) throw new Error('Liberação inválida.');
  return d;
}
