function carregarObras() {
  fetch("/obras")
    .then((resposta) => resposta.json())
    .then((obras) => {
      const lista = document.getElementById("lista-obras");

      lista.innerHTML = "";

      obras.forEach((obra) => {
        lista.innerHTML += `
                    <div class="cards">
                        <h2>${obra.title}</h2>
                        <img src="${obra.imagem}" alt="${obra.title}">
                        <p>ID: ${obra.id}</p>
                        <p>${obra.done ? "Concluída" : "Pendente"}</p>

                        <button data-id="${obra.id}">Editar</button>

                        <button data-delete-id="${obra.id}">Apagar</button>

                        <button data-patch-id="${obra.id}" data-done="${obra.done}">
                            ${obra.done ? "Desmarcar" : "Concluir"}
                        </button>
                    </div>
                `;
      });
    });
}

carregarObras();

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
        title: tituloObra.value,
        tipo: tipoObra.value,
        status: statusObra.value,
        imagem: imagemObra.value,
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
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        done: doneAtual === 0 ? 1 : 0,
      }),
    });
  }
});

const botaoCriar = document.getElementById("botao-criar");

const popupCriar = document.getElementById("popup-criar");

const fecharPopup = document.getElementById("fechar-popup");

botaoCriar.addEventListener("click", () => {
  popupCriar.style.display = "flex";
});

fecharPopup.addEventListener("click", () => {
  popupCriar.style.display = "none";
});

const formCriar = document.getElementById("form-criar");

formCriar.addEventListener("submit", (evento) => {
  evento.preventDefault();

  const tituloObra = document.getElementById("titulo-obra");
  const tipoObra = document.getElementById("tipo-obra");
  const statusObra = document.getElementById("status-obra");
  const imagemObra = document.getElementById("imagem-obra");

  fetch("/obras", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: tituloObra.value,
      tipo: tipoObra.value,
      status: statusObra.value,
      imagem: imagemObra.value,
    }),
  }).then(() => {
    carregarObras();

    tituloObra.value = "";

    popupCriar.style.display = "none";
  });
});

const imagemObra = document.getElementById("imagem-obra");
const previewImagem = document.getElementById("preview-imagem");

imagemObra.addEventListener("input", () => {
  previewImagem.src = imagemObra.value;
});
