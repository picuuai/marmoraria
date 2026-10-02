// Guarda os arquivos do sistema no aparelho para ele abrir sem internet.
// Ao publicar uma versão nova, troque o número abaixo para os aparelhos atualizarem.
const VERSAO = 'marmoraria-v13';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'icone.svg', 'icone-192.png', 'icone-512.png', 'icone-mascara-512.png', 'icone-apple.png', 'css/app.css',
  'js/main.js', 'js/nucleo.js', 'js/util.js', 'js/padroes.js', 'js/db.js', 'js/calc.js', 'js/desenho.js', 'js/sinc.js', 'js/marca.js', 'js/pdf.js', 'js/folha-pdf.js',
  'js/telas/orcamento.js', 'js/telas/folhas.js', 'js/telas/gestao.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Com internet busca a versão mais nova e atualiza a cópia guardada; sem internet usa a cópia
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // 'no-cache' faz o navegador conferir com o servidor se o arquivo mudou, para não
  // misturar arquivos antigos e novos depois de uma atualização
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(resp => {
        const copia = resp.clone();
        caches.open(VERSAO).then(c => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
