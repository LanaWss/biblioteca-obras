self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "teste-notificacao") {
    self.registration.showNotification("Biblioteca de Obras", {
      body: "A notificação está funcionando!",
      icon: "/icone.png",
    });
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
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientes) => {
      for (const cliente of clientes) {
        if (cliente.url === self.location.origin + "/" && "focus" in cliente) {
          return cliente.focus();
        }
      }

      return clients.openWindow("/");
    }),
  );
});