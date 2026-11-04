const CACHE = "biblioteca-obras-shell-v26";
const RECURSOS = [
  "/login.html",
  "/index.html",
  "/style.css?v=57",
  "/icone-192.png",
  "/icone-512.png",
  "/manifest.json",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(RECURSOS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE)
          .map((chave) => caches.delete(chave)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET" || new URL(evento.request.url).origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    fetch(evento.request).then((resposta) => {
      if (
        resposta.ok &&
        ["script", "style", "image", "font"].includes(evento.request.destination)
      ) {
        const copia = resposta.clone();
        caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
      }
      return resposta;
    }).catch(() => caches.match(evento.request)),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "teste-notificacao") {
    evento.waitUntil(
      self.registration.showNotification("Biblioteca de Obras", {
        body: "A notificação está funcionando!",
        icon: "/icone.png",
      }),
    );
  }
});

self.addEventListener("push", (evento) => {
  let dados = {};

  try {
    dados = evento.data ? evento.data.json() : {};
  } catch (erro) {
    dados = {};
  }

  const titulo = dados.titulo || "Biblioteca de Obras";

  const opcoes = {
    body: dados.corpo || "Você tem um novo lembrete.",
    icon: dados.icone || "/icone.png",
    badge: dados.badge || "/icone.png",
    requireInteraction: true,
    data: {
      obraId: dados.obraId || null,
    },
  };

  evento.waitUntil(
    self.registration.showNotification(titulo, opcoes),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();

  evento.waitUntil(
    (async () => {
      const clientes = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const cliente of clientes) {
        const url = new URL(cliente.url);

        if (url.origin === self.location.origin) {
          await cliente.focus();
          return;
        }
      }

      await clients.openWindow(self.location.origin + "/");
    })(),
  );
});