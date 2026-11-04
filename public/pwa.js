if ("serviceWorker" in navigator) {
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);
  let recarregandoPorAtualizacao = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaControlador || recarregandoPorAtualizacao) {
      return;
    }

    recarregandoPorAtualizacao = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/service-worker.js?v=25", { updateViaCache: "none" })
    .then((registro) => registro.update())
    .catch(() => {});

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.serviceWorker.ready
        .then((registro) => registro.update())
        .catch(() => {});
    }
  });
}
