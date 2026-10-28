import assert from 'node:assert/strict';
import { criarSolicitacao, lerSolicitacao, aprovarSolicitacao, abrirLiberacao, criarCodigoReutilizavel, lerCodigoReutilizavel } from '../js/convite.js';

// Solicitação antiga: deve continuar utilizável anos depois de criada.
const agora = Date.now() - 5 * 365 * 86400000;
const cfg = { repo: 'empresa/dados-privados', token: 'credencial-ficticia-somente-teste' };
let n = 0;
async function teste(nome, fn) { await fn(); console.log('OK: ' + nome); n++; }
const a = await criarSolicitacao('Computador do escritório', agora);
const b = await criarSolicitacao('Outro aparelho', agora);
const cod = await aprovarSolicitacao(a.pedido, cfg, 'vendedor', agora);
await teste('solicitação contém identificação e chave pública, sem credenciais ou chave privada', () => {
  const p = lerSolicitacao(a.pedido, agora);
  assert.equal(p.nome, 'Computador do escritório');
  assert.equal(p.id, a.id);
  assert.deepEqual(Object.keys(p).sort(), ['criado', 'id', 'nome', 'publica']);
  assert.equal(a.vence, undefined);
  assert.ok(!a.pedido.includes(cfg.token));
});
await teste('solicitação sobrevive ao recarregamento e recupera o perfil aprovado', async () => {
  const d = await abrirLiberacao(cod, JSON.parse(JSON.stringify(a)), agora);
  assert.equal(d.r, cfg.repo); assert.equal(d.t, cfg.token); assert.equal(d.p, 'vendedor');
});
await teste('perfil dono é preservado sem promover o aparelho a principal', async () => {
  const d = await abrirLiberacao(await aprovarSolicitacao(a.pedido, cfg, 'dono', agora), a, agora);
  assert.equal(d.p, 'dono'); assert.equal(d.principal, undefined);
});
await teste('liberação de outro navegador é recusada', async () => {
  await assert.rejects(abrirLiberacao(cod, b, agora), /não corresponde/);
});
await teste('liberação adulterada é recusada', async () => {
  const [tipo, texto] = cod.split(':');
  const obj = JSON.parse(Buffer.from(texto, 'base64').toString());
  const dados = Buffer.from(obj.conteudo, 'base64'); dados[0] ^= 1;
  obj.conteudo = dados.toString('base64');
  await assert.rejects(abrirLiberacao(tipo + ':' + Buffer.from(JSON.stringify(obj)).toString('base64'), a, agora), /alterada/);
});
await teste('solicitação antiga continua válida e pode ser aprovada sem prazo', async () => {
  assert.equal(lerSolicitacao(a.pedido).id, a.id);
  const novo = await aprovarSolicitacao(a.pedido, cfg, 'vendedor');
  assert.equal((await abrirLiberacao(novo, a)).p, 'vendedor');
});
await teste('liberação criada anos atrás continua válida e não contém vencimento', async () => {
  const d = await abrirLiberacao(cod, a);
  assert.equal(d.criado, agora);
  assert.equal(d.vence, undefined);
});
await teste('pedido e liberação da versão antiga são aceitos mesmo após vencimento', async () => {
  const p = { ...lerSolicitacao(a.pedido), vence: agora + 86400000 };
  const pedidoAntigo = 'MAR-PEDIDO-1:' + Buffer.from(JSON.stringify(p)).toString('base64');
  assert.equal(lerSolicitacao(pedidoAntigo).id, a.id);
  const pendente = { ...a, pedido: pedidoAntigo, vence: p.vence };
  assert.equal((await abrirLiberacao(await aprovarSolicitacao(pedidoAntigo, cfg, 'vendedor'), pendente)).t, cfg.token);
  // Reproduz o envelope criptografado da versão anterior, inclusive o prazo vencido.
  const publica = await crypto.subtle.importKey('spki', Buffer.from(p.publica, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = { id: a.id, r: cfg.repo, t: cfg.token, p: 'vendedor', criado: agora, vence: agora + 1800000 };
  const conteudo = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(dados)));
  const chave = await crypto.subtle.encrypt('RSA-OAEP', publica, await crypto.subtle.exportKey('raw', aes));
  const envelope = Object.fromEntries(Object.entries({ chave, iv, conteudo }).map(([k,v]) => [k, Buffer.from(v).toString('base64')]));
  const antigo = 'MAR-ACESSO-1:' + Buffer.from(JSON.stringify(envelope)).toString('base64');
  assert.equal((await abrirLiberacao(antigo, pendente)).t, cfg.token);
});
await teste('solicitação cancelada ou substituída não aceita resposta antiga', async () => {
  await assert.rejects(abrirLiberacao(cod, null, agora), /Gere uma solicitação/);
  await assert.rejects(abrirLiberacao(cod, { ...a, id: b.id }, agora), /inválida/);
});
await teste('códigos incompletos, errados e grandes são recusados', async () => {
  for (const texto of ['', 'MAR-PEDIDO-1:!', 'MAR-PEDIDO-1:' + 'a'.repeat(16001), cod]) {
    assert.throws(() => lerSolicitacao(texto, agora));
  }
  await assert.rejects(abrirLiberacao(a.pedido, a, agora));
});
await teste('perfil desconhecido e nome vazio são recusados', async () => {
  await assert.rejects(aprovarSolicitacao(a.pedido, cfg, 'administrador', agora));
  await assert.rejects(criarSolicitacao(' ', agora));
});
await teste('quebras de linha de mensagens não invalidam o código', async () => {
  assert.equal(lerSolicitacao(a.pedido.replace(/(.{60})/g, '$1\n'), agora).id, a.id);
  assert.equal((await abrirLiberacao(cod.replace(/(.{60})/g, '$1\n'), a, agora)).p, 'vendedor');
});
await teste('código reutilizável preserva perfil e credencial sem vencimento nem aparelho principal', () => {
  for (const p of ['vendedor', 'dono']) {
    const c = criarCodigoReutilizavel(cfg, p);
    const d = lerCodigoReutilizavel(c);
    assert.deepEqual(d, { r: cfg.repo, t: cfg.token, p });
    assert.deepEqual(lerCodigoReutilizavel(c.replace(/(.{50})/g, '$1\n')), d);
    assert.equal(d.vence, undefined); assert.equal(d.principal, undefined);
  }
});
await teste('código reutilizável não aceita perfil desconhecido nem códigos do outro formato', () => {
  assert.throws(() => criarCodigoReutilizavel(cfg, 'administrador'));
  assert.throws(() => lerCodigoReutilizavel(cod));
  assert.throws(() => lerCodigoReutilizavel(a.pedido));
  assert.throws(() => lerCodigoReutilizavel('MAR-CONEXAO-1:incompleto'));
});
console.log(`${n} verificações concluídas.`);
