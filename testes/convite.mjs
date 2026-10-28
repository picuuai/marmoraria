import assert from 'node:assert/strict';
import { criarSolicitacao, lerSolicitacao, aprovarSolicitacao, abrirLiberacao } from '../js/convite.js';

const agora = Date.now();
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
  assert.deepEqual(Object.keys(p).sort(), ['criado', 'id', 'nome', 'publica', 'vence']);
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
await teste('solicitação expira em 24 horas e não pode ser aprovada', async () => {
  assert.throws(() => lerSolicitacao(a.pedido, agora + 86400000), /vencido/);
  await assert.rejects(aprovarSolicitacao(a.pedido, cfg, 'vendedor', agora + 86400000));
});
await teste('liberação expira em 30 minutos', async () => {
  await assert.rejects(abrirLiberacao(cod, a, agora + 1800000), /vencido/);
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
console.log(`${n} verificações concluídas.`);
