// Banco de dados no próprio aparelho (IndexedDB). O sistema lê e grava sempre aqui,
// com ou sem internet. Cada registro tem id único, atualizadoEm e excluidoEm:
// é com isso que a sincronização junta as alterações de aparelhos diferentes.
import { agora } from './util.js';
import * as P from './padroes.js';

const NOME = 'marmoraria';
export const LOJAS = ['materiais', 'acabamentos', 'catalogo', 'tipos', 'clientes', 'orcamentos', 'config'];

const dados = Object.fromEntries(LOJAS.map(l => [l, []]));
let idb = null;

const pedido = r => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });

export async function abrir() {
  try {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => {
      for (const l of LOJAS) if (!r.result.objectStoreNames.contains(l)) r.result.createObjectStore(l, { keyPath: 'id' });
    };
    idb = await pedido(r);
    for (const l of LOJAS) dados[l] = await pedido(idb.transaction(l).objectStore(l).getAll());
  } catch (e) {
    // sem IndexedDB (ex.: janela anônima restrita) o sistema abre, mas não guarda nada
    console.error('Banco local indisponível', e);
    idb = null;
  }
  if (!dados.config.length) semear();
  return idb !== null;
}

// Os dados iniciais entram com data antiga: num aparelho novo eles nunca passam
// por cima do que já foi alterado em outro aparelho.
const DATA_SEMENTE = '2000-01-01T00:00:00.000Z';
function semear() {
  for (const m of P.MATERIAIS) gravar('materiais', { ...m }, DATA_SEMENTE);
  for (const a of P.ACABAMENTOS) gravar('acabamentos', { ...a }, DATA_SEMENTE);
  for (const c of P.CATALOGO) gravar('catalogo', { ...c }, DATA_SEMENTE);
  P.TIPOS.forEach((t, i) => gravar('tipos', { ...JSON.parse(JSON.stringify(t)), ordem: i }, DATA_SEMENTE));
  gravar('config', { ...P.CONFIG }, DATA_SEMENTE);
}

// A sincronização pede para ser avisada a cada gravação
let aoMudar = () => {};
export const definirAoMudar = f => { aoMudar = f; };

function persistir(loja, reg) {
  if (!idb) return;
  try {
    idb.transaction(loja, 'readwrite').objectStore(loja).put(reg);
  } catch (e) {
    console.error('Falha ao gravar', loja, e);
  }
}

export function gravar(loja, reg, quando) {
  reg.atualizadoEm = quando || agora();
  const i = dados[loja].findIndex(r => r.id === reg.id);
  if (i >= 0) dados[loja][i] = reg; else dados[loja].push(reg);
  persistir(loja, reg);
  aoMudar();
  return reg;
}

// Exclusão é uma marca, não um apagamento: assim ela também sincroniza
export function excluir(loja, id) {
  const reg = dados[loja].find(r => r.id === id);
  if (reg) { reg.excluidoEm = agora(); gravar(loja, reg); }
}

export const lista = loja => dados[loja].filter(r => !r.excluidoEm);
export const achar = (loja, id) => dados[loja].find(r => r.id === id && !r.excluidoEm) || null;
export const config = () => dados.config[0];

// Cópia de segurança: tudo em um arquivo, inclusive registros marcados como excluídos
export const exportar = () => JSON.stringify({ sistema: NOME, versao: 1, geradoEm: agora(), dados }, null, 1);

export function importar(texto) {
  const arq = JSON.parse(texto);
  if (arq.sistema !== NOME || !arq.dados) throw new Error('Arquivo não é uma cópia deste sistema.');
  substituir(arq.dados);
  aoMudar();
}

// Apaga os dados deste aparelho (usado quando ele é desconectado da sincronização)
export async function apagarTudo() {
  for (const l of LOJAS) {
    dados[l] = [];
    if (idb) await pedido(idb.transaction(l, 'readwrite').objectStore(l).clear());
  }
}

// Tudo o que está guardado, inclusive os registros marcados como excluídos
export const tudo = () => dados;

// Troca todos os dados de uma vez (cópia restaurada ou resultado da sincronização)
export function substituir(novos) {
  for (const l of LOJAS) {
    if (!Array.isArray(novos[l])) continue;
    dados[l] = novos[l];
    if (idb) {
      const loja = idb.transaction(l, 'readwrite').objectStore(l);
      loja.clear();
      for (const reg of dados[l]) loja.put(reg);
    }
  }
}
