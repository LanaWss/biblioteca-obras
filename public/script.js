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

            <button
              data-patch-id="${obra.id}"
              data-done="${obra.done}"
            >
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

    fetch(`/obras/${id}`)
      .then((resposta) => resposta.json())
      .then((obra) => {
        const popupEditar = document.getElementById("popup-editar");

        popupEditar.dataset.id = id;

        document.getElementById("editar-titulo").value = obra.title;
        document.getElementById("editar-tipo").value = obra.tipo;
        document.getElementById("editar-status").value = obra.status;
        document.getElementById("editar-imagem").value = obra.imagem;

        document.getElementById("preview-imagem-editar").src = obra.imagem;

        popupEditar.style.display = "flex";
      });
  }

  if (evento.target.matches("button[data-delete-id]")) {
    const id = evento.target.dataset.deleteId;

    fetch(`/obras/${id}`, {
      method: "DELETE",
    }).then(() => {
      carregarObras();
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
    }).then(() => {
      carregarObras();
    });
  }
});

const tipoObra = document.getElementById("tipo-obra");

const camposAnime = document.getElementById("campos-anime");
const camposManga = document.getElementById("campos-manga");
const listaVolumes = document.getElementById("lista-volumes");
const listaTemporadas = document.getElementById("lista-temporadas");

tipoObra.addEventListener("change", () => {
  const camposTemporada = listaTemporadas.querySelectorAll("input");

  if (tipoObra.value === "anime") {
    camposAnime.style.display = "block";
    camposManga.style.display = "none";

    camposTemporada.forEach((campo) => {
      campo.required = true;
    });
  } else if (tipoObra.value === "manga") {
    camposAnime.style.display = "none";
    camposManga.style.display = "block";

    camposTemporada.forEach((campo) => {
      campo.required = false;
    });
  } else {
    camposAnime.style.display = "none";
    camposManga.style.display = "none";

    camposTemporada.forEach((campo) => {
      campo.required = false;
    });
  }
});

const adicionarTemporada = document.getElementById("adicionar-temporada");

const listaTemporadasElemento = document.getElementById("lista-temporadas");

adicionarTemporada.addEventListener("click", () => {
  const novaTemporada = document.createElement("div");

  novaTemporada.classList.add("temporada");

  novaTemporada.innerHTML = `
    <input
      type="number"
      min="1"
      placeholder="Temporada"
      required
    >

    <input
      type="number"
      min="0"
      placeholder="Episódios"
      required
    >
  `;

  listaTemporadasElemento.appendChild(novaTemporada);
});

const adicionarVolume = document.getElementById("adicionar-volume");

adicionarVolume.addEventListener("click", () => {
  const novoVolume = document.createElement("div");

  novoVolume.classList.add("volume");

  novoVolume.innerHTML = `
    <input
      type="number"
      min="1"
      placeholder="Volume"
      required
    >

    <input
      type="number"
      min="0"
      placeholder="Capítulos"
      required
    >
  `;

  listaVolumes.appendChild(novoVolume);
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

  // Verifica as temporadas quando for Anime

  if (tipoObra.value === "anime") {
    const camposTemporada = listaTemporadas.querySelectorAll("input");

    for (const campo of camposTemporada) {
      if (campo.value === "") {
        alert("Preencha a temporada e a quantidade de episódios.");

        return;
      }
    }
  }

  if (tipoObra.value === "manga") {
    const camposVolume = listaVolumes.querySelectorAll("input");

    for (const campo of camposVolume) {
      if (campo.value === "") {
        alert("Preencha o volume e a quantidade de capítulos.");
        return;
      }
    }
  }

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

    tipoObra.value = "";

    statusObra.value = "";

    imagemObra.value = "";

    previewImagem.src = "";

    listaTemporadas.innerHTML = `
  <div class="temporada">
    <input
      type="number"
      value="1"
      min="1"
      placeholder="Temporada"
    />

    <input
      type="number"
      min="1"
      placeholder="Episódios"
    />
  </div>
`;

    listaVolumes.innerHTML = `
  <div class="volume">
    <input
      type="number"
      value="1"
      min="1"
      placeholder="Volume"
    />

    <input
      type="number"
      min="1"
      placeholder="Capítulos"
    />
  </div>
`;

    popupCriar.style.display = "none";
  });
});

const imagemObra = document.getElementById("imagem-obra");

const previewImagem = document.getElementById("preview-imagem");

imagemObra.addEventListener("input", () => {
  previewImagem.src = imagemObra.value;
});

const formEditar = document.getElementById("form-editar");

const fecharPopupEditar = document.getElementById("fechar-popup-editar");

fecharPopupEditar.addEventListener("click", () => {
  const popupEditar = document.getElementById("popup-editar");

  popupEditar.style.display = "none";
});

formEditar.addEventListener("submit", (evento) => {
  evento.preventDefault();

  const popupEditar = document.getElementById("popup-editar");

  const id = popupEditar.dataset.id;

  const titulo = document.getElementById("editar-titulo");

  const tipo = document.getElementById("editar-tipo");

  const status = document.getElementById("editar-status");

  const imagem = document.getElementById("editar-imagem");

  fetch(`/obras/${id}`, {
    method: "PUT",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      title: titulo.value,

      tipo: tipo.value,

      status: status.value,

      imagem: imagem.value,
    }),
  }).then(() => {
    carregarObras();

    popupEditar.style.display = "none";
  });
});
