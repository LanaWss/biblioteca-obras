fetch("/obras")
  .then((resposta) => resposta.json())
  .then((obras) => {
    const lista = document.getElementById("lista-obras");

    obras.forEach((obra) => {
      lista.innerHTML += `
                <div>
                    <h2>${obra.title}</h2>
                    <p>ID: ${obra.id}</p>
                    <p>Concluída: ${obra.done}</p>
                    <button data-id="${obra.id}">Editar</button>
                    <button data-delete-id="${obra.id}">Apagar</button>
                    <button data-patch-id="${obra.id}" data-done="${obra.done}">${obra.done ? "Desmarcar" : "Concluir"}</button>
                </div>
            `;
    });
  });

document.addEventListener("click", (evento) => {
  if (evento.target.matches("button[data-id]")) {
    const id = evento.target.dataset.id;

    const novoTitulo = prompt("Digite o novo título:");

    fetch(`/obras/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: novoTitulo,
      }),
    });
  }

  if (evento.target.matches("button[data-delete-id]")) {
    const id = evento.target.dataset.deleteId;

    fetch(`/obras/${id}`, {
      method: "DELETE",
    });
  }

  if (evento.target.matches("button[data-patch-id]")) {
    const id = evento.target.dataset.patchId;
    const doneAtual = Number(evento.target.dataset.done);

    fetch(`/obras/${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            done: doneAtual === 0 ? 1 : 0
        })
    });
}


});

const botaoCriar = document.getElementById("botao-criar");

botaoCriar.addEventListener("click", () => {
  fetch("/obras", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Nova obra",
    }),
  });
});
