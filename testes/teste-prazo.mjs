// Relógio, navegador e GitHub simulados. Nenhuma credencial ou base real.
import assert from 'node:assert/strict';
import { criarCodigoReutilizavel, DURACAO_TESTE } from '../js/convite.js';
const db = await import('../js/db.js');
let agora = 1900000000000, recargas = 0, chamadas = 0, indice = 0, n = 0;
Date.now = () => agora;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => { const id = ++indice; timers.set(id, { fn, ms }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.setInterval = () => ++indice;
globalThis.addEventListener = () => {};
const storage = {};
Object.defineProperties(storage, {
  getItem: { value: k => storage[k] ?? null },
  setItem: { value: (k,v) => storage[k] = String(v) },
  removeItem: { value: k => delete storage[k] },
});
globalThis.localStorage = storage;
globalThis.location = { hash: '#/', hostname: 'teste.invalid', protocol: 'https:', reload: () => recargas++ };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Windows Chrome/', onLine: true }, configurable: true });
const campos = new Map();
function campo(id) { if (!campos.has(id)) campos.set(id, { value: '', innerHTML: '', classList: { add() {}, remove() {} } }); return campos.get(id); }
globalThis.document = { getElementById: campo, querySelectorAll: () => [], activeElement: null, addEventListener() {} };
const arquivos = new Map();
const fetchSimulado = async (url, op = {}) => {
  chamadas++;
  const nome = url.split('/contents/')[1];
  if (!nome) return { ok:true, status:200, json: async () => ({private:true}) };
  if (op.method === 'PUT') { arquivos.set(nome, JSON.parse(op.body).content); return { ok:true, status:200 }; }
  return arquivos.has(nome) ? { ok:true, status:200, json: async () => ({ sha:'teste',encoding:'base64',content:arquivos.get(nome) }) } : { ok:false,status:404 };
};
globalThis.fetch = fetchSimulado;
const credencial = { repo:'ficticia/privado', token:'credencial-ficticia', principal:false };
async function sessao(cfg) {
  for (const k of Object.keys(storage)) delete storage[k];
  if (cfg) storage.setItem('marmoraria-sinc', JSON.stringify(cfg));
  return import(`../js/sinc.js?prazo=${++indice}`);
}
const botao = () => ({ disabled:false });
async function teste(nome, fn) { await fn(); console.log('OK: ' + nome); n++; }
let codigo, conectado;
await teste('Dono/desenvolvedor conectado como secundário gera códigos e administra aparelhos', async () => {
  const dono = await sessao({...credencial,perfil:'dono'});
  assert.match(dono.cartao(), /Gerar código reutilizável|Trocar a chave/);
  campo('codigo-perfil').value = 'teste';
  await dono.acoes['codigo-gerar'](botao());
  codigo = dono.cartao().match(/id="codigo-reutilizavel"[^>]*>([^<]+)<\/textarea>/)[1];
  assert.ok(codigo);
});
await teste('Dono com permissões reduzidas não pode gerar chaves nem administrar', async () => {
  const restrito = await sessao({...credencial,perfil:'dono',acessos:{orcamentos:true}});
  assert.doesNotMatch(restrito.cartao(), /Gerar código reutilizável|Aparelhos autorizados/);
  campo('codigo-erro').innerHTML = '';
  await restrito.acoes['codigo-gerar'](botao());
  assert.match(campo('codigo-erro').innerHTML, /Somente o dono/);
});
await teste('chave de teste conecta, persiste prazo e não libera administração', async () => {
  conectado = await sessao();
  campo('codigo-entrada').value = codigo;
  await conectado.acoes['codigo-entrar'](botao());
  const cfg = JSON.parse(storage.getItem('marmoraria-sinc'));
  assert.equal(cfg.perfil,'teste'); assert.equal(cfg.principal,false);
  assert.equal(cfg.expiraEm, agora + DURACAO_TESTE);
  assert.equal(conectado.pode('financeiro'),true);
  assert.doesNotMatch(conectado.cartao(), /Gerar código reutilizável|Aprovar solicitação|Aparelhos autorizados/);
  campo('codigo-erro').innerHTML = '';
  await conectado.acoes['codigo-gerar'](botao());
  assert.match(campo('codigo-erro').innerHTML, /Somente o dono/);
  assert.ok([...timers.values()].some(t => t.ms === 60000));
});
await teste('timer ao vencer apaga dados e credenciais locais sem tocar no GitHub', async () => {
  db.gravar('clientes',{id:'cliente-ficticio'});
  db.gravar('orcamentos',{id:'pedido-ficticio'});
  storage.setItem('marmoraria-pedido-acesso','segredo-ficticio');
  storage.setItem('marmoraria-tema','escuro');
  storage.setItem('outro-aplicativo','preservar');
  const remotoAntes = JSON.stringify([...arquivos]);
  const chamadasAntes = chamadas;
  agora += DURACAO_TESTE;
  assert.equal(conectado.bloqueado(),true);
  const timer = [...timers.values()].find(t => t.ms === 60000);
  timer.fn();
  await conectado.conferirTeste();
  assert.equal(recargas,1);
  for (const l of db.LOJAS) assert.equal(db.tudo()[l].length,0);
  assert.equal(storage.getItem('marmoraria-sinc'),null);
  assert.equal(storage.getItem('marmoraria-pedido-acesso'),null);
  assert.equal(storage.getItem('marmoraria-aparelho'),null);
  assert.equal(storage.getItem('marmoraria-tema'),null);
  assert.equal(storage.getItem('marmoraria-revogado'),'teste');
  assert.equal(storage.getItem('outro-aplicativo'),'preservar');
  assert.equal(chamadas,chamadasAntes);
  assert.equal(JSON.stringify([...arquivos]),remotoAntes);
});
await teste('reabrir app após prazo bloqueia antes de sincronizar, inclusive offline', async () => {
  const vencido = await sessao({...credencial,perfil:'teste',inicio:agora-DURACAO_TESTE,expiraEm:agora});
  db.gravar('clientes',{id:'antigo'});
  navigator.onLine = false;
  const chamadasAntes = chamadas;
  assert.equal(vencido.bloqueado(),true);
  vencido.iniciar();
  await vencido.conferirTeste();
  assert.equal(db.tudo().clientes.length,0);
  assert.equal(chamadas,chamadasAntes);
  assert.equal(storage.getItem('marmoraria-sinc'),null);
  navigator.onLine = true;
});
await teste('código de teste vencido não reconecta nem reinicia os 15 dias', async () => {
  const novo = await sessao();
  campo('codigo-entrada').value = codigo;
  campo('codigo-erro').innerHTML = '';
  const chamadasAntes = chamadas;
  await novo.acoes['codigo-entrar'](botao());
  assert.equal(novo.bloqueado(),true);
  assert.equal(chamadas,chamadasAntes);
  assert.match(campo('codigo-erro').innerHTML, /teste de 15 dias/);
});
await teste('resposta de sincronização em andamento não repõe dados após a limpeza', async () => {
  const cfg = {...credencial,perfil:'teste',inicio:agora,expiraEm:agora+DURACAO_TESTE};
  const ativo = await sessao(cfg);
  let liberar, anunciar;
  const aguardando = new Promise(r => anunciar = r);
  const resposta = new Promise(r => liberar = r);
  globalThis.fetch = async (url, op) => {
    if (url.endsWith('/contents/dados.json') && !op?.method) {
      anunciar(); await resposta;
    }
    return fetchSimulado(url,op);
  };
  const sync = ativo.sincronizar();
  await aguardando;
  agora = cfg.expiraEm;
  await ativo.conferirTeste();
  liberar(); await sync;
  for (const l of db.LOJAS) assert.equal(db.tudo()[l].length,0);
  assert.equal(storage.getItem('marmoraria-sinc'),null);
  globalThis.fetch = fetchSimulado;
});
await teste('período expirado nunca desconecta Dono ou Vendedor sem prazo', async () => {
  for (const perfil of ['dono','vendedor']) {
    const s = await sessao({...credencial,perfil});
    assert.equal(await s.conferirTeste(),false);
    assert.equal(s.bloqueado(),false);
    assert.ok(storage.getItem('marmoraria-sinc'));
  }
});
await teste('limpeza interrompida é retomada ao abrir, mesmo sem credencial salva', async () => {
  const s = await sessao();
  storage.setItem('marmoraria-limpeza-teste','1');
  db.gravar('clientes',{id:'restante-de-teste'});
  const chamadasAntes = chamadas;
  s.iniciar();
  await s.conferirTeste();
  assert.equal(db.tudo().clientes.length,0);
  assert.equal(storage.getItem('marmoraria-limpeza-teste'),null);
  assert.equal(storage.getItem('marmoraria-sinc'),null);
  assert.equal(chamadas,chamadasAntes);
});
console.log(`${n} verificações de perfis e expiração concluídas.`);
