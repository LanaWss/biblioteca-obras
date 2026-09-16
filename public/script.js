let obraProgressoAtual = null;

let obrasCarregadas = [];

const buscarObras = document.getElementById("buscar-obras");

const filtroTipo = document.getElementById("filtro-tipo");

const filtroStatus = document.getElementById("filtro-status");

function normalizarTexto(valor) {
  return valor
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obterObrasFiltradas() {
  const termo = normalizarTexto(buscarObras.value.trim());

  return obrasCarregadas.filter((obra) => {
    const nomeCombina = normalizarTexto(obra.title).includes(termo);

    const tipoCombina = !filtroTipo.value || obra.tipo === filtroTipo.value;

    const statusCombina =
      !filtroStatus.value || obra.status === filtroStatus.value;

    return nomeCombina && tipoCombina && statusCombina;
  });
}

function lerConteudoObra(valor) {
  if (!valor) {
    return [];
  }

  try {
    return JSON.parse(valor);
  } catch (erro) {
    return [];
  }
}

function prepararProgresso(itens, quantidadeKey) {
  return itens.map((item) => {
    if (quantidadeKey === "capitulos") {
      return {
        ...item,
        vistos: Array.isArray(item.vistos)
          ? item.vistos.filter(
              (numero) => numero >= item.inicio && numero <= item.fim,
            )
          : [],
      };
    }

    return {
      ...item,
      vistos: Array.isArray(item.vistos)
        ? item.vistos.filter(
            (numero) => numero >= 1 && numero <= item[quantidadeKey],
          )
        : [],
    };
  });
}

function calcularProgresso(obra) {
  const itens =
    obra.tipo === "anime"
      ? lerConteudoObra(obra.temporadas)
      : lerConteudoObra(obra.volumes);

  let total = 0;

  let vistos = 0;

  itens.forEach((item) => {
    if (obra.tipo === "manga") {
      total += item.fim - item.inicio + 1;
    } else {
      total += item.episodios || 0;
    }

    vistos += Array.isArray(item.vistos) ? item.vistos.length : 0;
  });

  return {
    vistos,
    total,
  };
}

function obterImagemPreferida(obra) {
  const imagens = {
    url: obra.imagem,
    arquivo: obra.imagem_arquivo,
  };

  const preferida = obra.imagem_preferencia || "url";
  const alternativa = preferida === "url" ? "arquivo" : "url";

  return {
    principal: imagens[preferida] || imagens[alternativa] || "",
    fallback: imagens[preferida] ? imagens[alternativa] || "" : "",
  };
}

function lerArquivoComoDataUrl(arquivo) {
  if (!arquivo) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

function validarImagem(url, arquivoDataUrl) {
  if (!url && !arquivoDataUrl) {
    alert("Informe uma URL ou escolha uma imagem do dispositivo.");
    return false;
  }

  return true;
}

function ajustarCorDoTexto(card, imagemUrl) {
  const imagem = new Image();

  imagem.crossOrigin = "anonymous";

  imagem.onload = () => {
    try {
      const canvas = document.createElement("canvas");

      const contexto = canvas.getContext("2d");

      const tamanhoAmostra = 8;

      canvas.width = tamanhoAmostra;
      canvas.height = tamanhoAmostra;
      contexto.drawImage(imagem, 0, 0, tamanhoAmostra, tamanhoAmostra);

      const pixels = contexto.getImageData(
        0,
        0,
        tamanhoAmostra,
        tamanhoAmostra,
      ).data;

      let luminanciaTotal = 0;
      let pesoTotal = 0;

      for (let indice = 0; indice < pixels.length; indice += 4) {
        const alpha = pixels[indice + 3] / 255;
        const vermelho = pixels[indice] / 255;
        const verde = pixels[indice + 1] / 255;
        const azul = pixels[indice + 2] / 255;

        const luminancia =
          0.2126 * vermelho ** 2.2 +
          0.7152 * verde ** 2.2 +
          0.0722 * azul ** 2.2;

        luminanciaTotal += luminancia * alpha;
        pesoTotal += alpha;
      }

      const luminanciaMedia = pesoTotal ? luminanciaTotal / pesoTotal : 0;
      const contrasteComPreto = (luminanciaMedia + 0.05) / 0.05;
      const contrasteComBranco = 1.05 / (luminanciaMedia + 0.05);
      const textoEscuro = contrasteComPreto >= contrasteComBranco;

      card.classList.toggle("texto-escuro", textoEscuro);
      card.classList.toggle("texto-claro", !textoEscuro);
    } catch (erro) {
      console.log("Não foi possível analisar o brilho da imagem.");

      card.classList.add("texto-claro");
      card.classList.remove("texto-escuro");
    }
  };

  imagem.onerror = () => {
    card.classList.add("texto-claro");
    card.classList.remove("texto-escuro");
  };

  imagem.src = imagemUrl;
}

function configurarImagemCard(card, obra) {
  const imagem = card.querySelector(".imagem-obra");
  const aviso = card.querySelector(".aviso-imagem-card");
  const imagens = obterImagemPreferida(obra);

  card.style.setProperty(
    "--imagem-obra",
    imagens.principal ? `url("${imagens.principal}")` : "none",
  );

  if (!imagem || !imagens.principal) {
    return;
  }

  const usarFallback = () => {
    if (imagens.fallback && imagem.src !== imagens.fallback) {
      imagem.src = imagens.fallback;
      card.style.setProperty("--imagem-obra", `url("${imagens.fallback}")`);
      ajustarCorDoTexto(card, imagens.fallback);
      aviso.textContent =
        "A URL da imagem falhou. Imagem do dispositivo exibida.";
      aviso.hidden = false;
      return;
    }

    imagem.hidden = true;
    card.classList.add("imagem-indisponivel");
    aviso.textContent = "Não foi possível carregar a imagem.";
    aviso.hidden = false;
  };

  imagem.addEventListener("load", () => {
    imagem.hidden = false;
    card.classList.remove("imagem-indisponivel");
    ajustarCorDoTexto(card, imagem.currentSrc || imagem.src);
  });
  imagem.addEventListener("error", usarFallback);
  imagem.src = imagens.principal;
}

async function salvarProgresso() {
  const obra = obraProgressoAtual;

  const resposta = await fetch(`/obras/${obra.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temporadas: obra.temporadas,
      volumes: obra.volumes,
    }),
  });

  if (!resposta.ok) {
    throw new Error("Não foi possível salvar o progresso.");
  }

  await carregarObras();
}

function renderizarProgresso() {
  const obra = obraProgressoAtual;

  const listaProgresso = document.getElementById("lista-progresso");

  const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;

  const quantidadeKey = obra.tipo === "anime" ? "episodios" : "capitulos";

  const itemLabel = obra.tipo === "anime" ? "Episódio" : "Capítulo";

  const grupoLabel = obra.tipo === "anime" ? "Temporada" : "Volume";

  listaProgresso.innerHTML = itens
    .map((item, indice) => {
      const inicio = obra.tipo === "manga" ? item.inicio : 1;

      const fim = obra.tipo === "manga" ? item.fim : item[quantidadeKey];

      const totalItens = fim - inicio + 1;

      const todosMarcados = item.vistos.length === totalItens;

      const itensHtml = Array.from({ length: totalItens }, (_, numero) => {
        const numeroItem = inicio + numero;

        const marcado = item.vistos.includes(numeroItem);

        return `
      <label class="item-progresso">
        <input
          type="checkbox"
          data-progresso-item="${indice}"
          data-numero-item="${numeroItem}"
          ${marcado ? "checked" : ""}
        >
        ${itemLabel} ${numeroItem}
      </label>
    `;
      }).join("");

      return `
        <section class="grupo-progresso">

          <div class="cabecalho-progresso">

            <h3>
              ${grupoLabel} ${item.numero}
            </h3>

            <button
              type="button"
              data-marcar-todos="${indice}"
            >
              ${todosMarcados ? "Desmarcar todos" : "Marcar todos"}
            </button>

          </div>

          <div class="itens-progresso">
            ${itensHtml}
          </div>

        </section>
      `;
    })
    .join("");
}

function abrirPopupProgresso(id) {
  fetch(`/obras/${id}`)
    .then((resposta) => resposta.json())
    .then((obra) => {
      obra.temporadas = prepararProgresso(
        lerConteudoObra(obra.temporadas),
        "episodios",
      );

      obra.volumes = prepararProgresso(
        lerConteudoObra(obra.volumes),
        "capitulos",
      );

      obraProgressoAtual = obra;

      document.getElementById("titulo-progresso").textContent =
        `Progresso: ${obra.title}`;

      renderizarProgresso();

      document.getElementById("popup-progresso").style.display = "flex";
    });
}

function carregarObras() {
  return fetch("/obras")
    .then((resposta) => resposta.json())
    .then((obras) => {
      obrasCarregadas = obras;

      const lista = document.getElementById("lista-obras");

      lista.innerHTML = "";

      obterObrasFiltradas().forEach((obra) => {
        let conteudo = "";

        const progresso = calcularProgresso(obra);

        const statusExibido = {
          completa: "Completa",
          hiato: "Em hiato",
          lancando: "Lançando",
        }[obra.status];

        if (obra.tipo === "anime") {
          const temporadas = lerConteudoObra(obra.temporadas);

          conteudo = `
            <h3><i class="fa-solid fa-list"></i> Temporadas</h3>

            ${temporadas
              .map(
                (temporada) => `
                  <p>
                    Temporada ${temporada.numero} —
                    ${temporada.episodios} episódios
                  </p>
                `,
              )
              .join("")}
          `;
        }

        if (obra.tipo === "manga") {
          const volumes = lerConteudoObra(obra.volumes);

          conteudo = `
            <h3><i class="fa-solid fa-book"></i> Volumes</h3>

            ${volumes
              .map(
                (volume) => `
                  <p>
  Volume ${volume.numero} —
  capítulos ${volume.inicio}–${volume.fim}
</p>
                `,
              )
              .join("")}
          `;
        }

        const imagens = obterImagemPreferida(obra);
        const linkLeitura = String(obra.link_leitura || "").trim();
        const imagem = imagens.principal
          ? `<img class="imagem-obra" src="${imagens.principal}" alt="${obra.title}">`
          : "";
        const botaoLeitura = linkLeitura
          ? `
              <a
                class="botao-ler"
                href="${linkLeitura}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="fa-solid fa-book-open"></i>Ler
              </a>
            `
          : "";

        lista.innerHTML += `
          <div
            class="cards"
            data-card-id="${obra.id}"
          >

            <div class="titulo-card">

              <h2>${obra.title}</h2>

              <span
                class="status-card status-${obra.status}"
              >
                ${statusExibido}
              </span>

            </div>

            ${imagem}
            <p class="aviso-imagem-card" hidden role="status"></p>

            <div class="progresso-card">

              <div class="progresso-texto">
                <span>
                  Progresso ${progresso.vistos}/${progresso.total}
                </span>
              </div>

              <div class="barra-progresso">

                <div
                  class="barra-progresso-preenchida"
                  style="width: ${
                    progresso.total > 0
                      ? (progresso.vistos / progresso.total) * 100
                      : 0
                  }%"
                ></div>

              </div>

            </div>

            ${conteudo}

            <div class="botoes-card">

  ${botaoLeitura}

  <button data-id="${obra.id}">
    <i class="fa-solid fa-pen"></i> Editar
  </button>

  <button data-delete-id="${obra.id}">
    <i class="fa-solid fa-trash"></i> Apagar
  </button>

  <button data-progress-id="${obra.id}">
    <i class="fa-solid fa-chart-simple"></i> Progresso
  </button>

</div>

          </div>
        `;

        const card = lista.querySelector(`[data-card-id="${obra.id}"]`);

        if (card) {
          configurarImagemCard(card, obra);
        }
      });
    });
}

carregarObras();

buscarObras.addEventListener("input", () => {
  carregarObras();
});

filtroTipo.addEventListener("change", () => {
  carregarObras();
});

filtroStatus.addEventListener("change", () => {
  carregarObras();
});

document.getElementById("abrir-filtros").addEventListener("click", () => {
  document.getElementById("popup-filtros").style.display = "flex";
});

document.getElementById("fechar-filtros").addEventListener("click", () => {
  document.getElementById("popup-filtros").style.display = "none";
});

document.getElementById("limpar-filtros").addEventListener("click", () => {
  buscarObras.value = "";

  filtroTipo.value = "";

  filtroStatus.value = "";

  carregarObras();
});

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

        document.getElementById("editar-imagem").value = obra.imagem || "";
        document.getElementById("editar-preferencia-imagem").value =
          obra.imagem_preferencia || "url";
        document.getElementById("editar-link-leitura").value =
          obra.link_leitura || "";
        popupEditar.dataset.imagemArquivo = obra.imagem_arquivo || "";
        document.getElementById("editar-arquivo-imagem").value = "";

        const editarCamposAnime = document.getElementById(
          "editar-campos-anime",
        );

        const editarCamposManga = document.getElementById(
          "editar-campos-manga",
        );

        const editarListaTemporadas = document.getElementById(
          "editar-lista-temporadas",
        );

        const editarListaVolumes = document.getElementById(
          "editar-lista-volumes",
        );

        const editarTipo = document.getElementById("editar-tipo");

        editarTipo.addEventListener("change", () => {
          if (editarTipo.value === "anime") {
            editarCamposAnime.style.display = "block";

            editarCamposManga.style.display = "none";
          } else if (editarTipo.value === "manga") {
            editarCamposAnime.style.display = "none";

            editarCamposManga.style.display = "block";
          } else {
            editarCamposAnime.style.display = "none";

            editarCamposManga.style.display = "none";
          }
        });

        editarListaTemporadas.innerHTML = "";

        editarListaVolumes.innerHTML = "";

        if (obra.tipo === "anime") {
          editarCamposAnime.style.display = "block";

          editarCamposManga.style.display = "none";

          const temporadas = obra.temporadas ? JSON.parse(obra.temporadas) : [];

          temporadas.forEach((temporada) => {
            const linha = document.createElement("div");

            linha.classList.add("temporada");
            linha.dataset.vistos = JSON.stringify(temporada.vistos || []);

            linha.innerHTML = `
              <label>
                Temporada
                <input
                  type="number"
                  min="1"
                  value="${temporada.numero}"
                >
              </label>

              <label>
                Episódios
                <input
                  type="number"
                  min="0"
                  value="${temporada.episodios}"
                >
              </label>
            `;

            editarListaTemporadas.appendChild(linha);
          });
        } else if (obra.tipo === "manga") {
          editarCamposAnime.style.display = "none";

          editarCamposManga.style.display = "block";

          const volumes = obra.volumes ? JSON.parse(obra.volumes) : [];

          volumes.forEach((volume) => {
            const linha = document.createElement("div");

            linha.classList.add("volume");
            linha.dataset.vistos = JSON.stringify(volume.vistos || []);

            linha.innerHTML = `
  <label>
    Volume
    <input
      type="number"
      min="1"
      value="${volume.numero}"
    >
  </label>

  <label>
    Começa no capítulo
    <input
      type="number"
      min="1"
      value="${volume.inicio}"
    >
  </label>

  <label>
    Termina no capítulo
    <input
      type="number"
      min="1"
      value="${volume.fim}"
    >
  </label>
`;

            editarListaVolumes.appendChild(linha);
          });
        }

        const previewImagemEditar = document.getElementById(
          "preview-imagem-editar",
        );

        previewImagemEditar.src = obterImagemPreferida(obra).principal;

        previewImagemEditar.hidden = !obterImagemPreferida(obra).principal;
        document.getElementById("aviso-imagem-editar").hidden = true;

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

  if (evento.target.matches("button[data-progress-id]")) {
    abrirPopupProgresso(evento.target.dataset.progressId);
  }

  if (evento.target.matches("button[data-marcar-todos]")) {
    const indice = Number(evento.target.dataset.marcarTodos);

    const obra = obraProgressoAtual;

    const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;

    const item = itens[indice];

    const inicio = obra.tipo === "manga" ? item.inicio : 1;

    const fim = obra.tipo === "manga" ? item.fim : item.episodios;

    const totalItens = fim - inicio + 1;

    const todosMarcados = item.vistos.length === totalItens;

    item.vistos = todosMarcados
      ? []
      : Array.from({ length: totalItens }, (_, numero) => inicio + numero);

    renderizarProgresso();

    salvarProgresso();
  }

  if (evento.target.matches("button#fechar-popup-progresso")) {
    document.getElementById("popup-progresso").style.display = "none";
  }
});

document.addEventListener("change", (evento) => {
  if (!evento.target.matches("input[data-progresso-item]")) {
    return;
  }

  const obra = obraProgressoAtual;

  const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;

  const indice = Number(evento.target.dataset.progressoItem);

  const numero = Number(evento.target.dataset.numeroItem);

  const vistos = new Set(itens[indice].vistos);

  if (evento.target.checked) {
    vistos.add(numero);
  } else {
    vistos.delete(numero);
  }

  itens[indice].vistos = [...vistos].sort((a, b) => a - b);

  renderizarProgresso();

  salvarProgresso();
});

const tipoObra = document.getElementById("tipo-obra");

const camposAnime = document.getElementById("campos-anime");

const camposManga = document.getElementById("campos-manga");

const listaTemporadas = document.getElementById("lista-temporadas");

const listaVolumes = document.getElementById("lista-volumes");

const adicionarTemporada = document.getElementById("adicionar-temporada");

const adicionarVolume = document.getElementById("adicionar-volume");

tipoObra.addEventListener("change", () => {
  if (tipoObra.value === "anime") {
    camposAnime.style.display = "block";

    camposManga.style.display = "none";
  } else if (tipoObra.value === "manga") {
    camposAnime.style.display = "none";

    camposManga.style.display = "block";
  } else {
    camposAnime.style.display = "none";

    camposManga.style.display = "none";
  }
});

adicionarTemporada.addEventListener("click", () => {
  const temporadas = listaTemporadas.querySelectorAll(".temporada");

  const ultimaTemporada = temporadas[temporadas.length - 1];

  const campos = ultimaTemporada.querySelectorAll("input");

  if (campos[0].value === "" || campos[1].value === "") {
    alert("Preencha a temporada e a quantidade de episódios.");

    return;
  }

  const novaTemporada = document.createElement("div");

  novaTemporada.classList.add("temporada");

  novaTemporada.innerHTML = `
      <label>
        Temporada
        <input
          type="number"
          min="1"
        >
      </label>

      <label>
        Episódios
        <input
          type="number"
          min="0"
        >
      </label>
    `;

  listaTemporadas.appendChild(novaTemporada);
});

adicionarVolume.addEventListener("click", () => {
  const volumes = listaVolumes.querySelectorAll(".volume");

  const ultimoVolume = volumes[volumes.length - 1];

  const campos = ultimoVolume.querySelectorAll("input");

  if (
    campos[0].value === "" ||
    campos[1].value === "" ||
    campos[2].value === ""
  ) {
    alert("Preencha o volume e o início e fim dos capítulos.");

    return;
  }

  const novoVolume = document.createElement("div");

  novoVolume.classList.add("volume");

  novoVolume.innerHTML = `
    <label>
      Volume
      <input
        type="number"
        min="1"
      >
    </label>

    <label>
      Começa no capítulo
      <input
        type="number"
        min="1"
      >
    </label>

    <label>
      Termina no capítulo
      <input
        type="number"
        min="1"
      >
    </label>
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

formCriar.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const botaoCriar = evento.currentTarget.querySelector(
    'button[type="submit"]',
  );

  botaoCriar.disabled = true;

  const tituloObra = document.getElementById("titulo-obra");

  const statusObra = document.getElementById("status-obra");

  const imagemObra = document.getElementById("imagem-obra");

  const arquivoImagemObra = document.getElementById("arquivo-imagem-obra");

  const linkLeituraObra = document.getElementById("link-leitura-obra");

  imagemObra.value = imagemObra.value.trim();

  if (imagemObra.value && !imagemObra.checkValidity()) {
    alert("Informe uma URL válida para a imagem.");
    imagemObra.focus();
    return;
  }

  if (linkLeituraObra.value && !linkLeituraObra.checkValidity()) {
    alert("Informe um link válido para ler a obra.");
    linkLeituraObra.focus();
    return;
  }

  let imagemArquivo = "";

  try {
    imagemArquivo = await lerArquivoComoDataUrl(arquivoImagemObra.files[0]);
  } catch (erro) {
    alert(erro.message);
    return;
  }

  if (!validarImagem(imagemObra.value, imagemArquivo)) {
    return;
  }

  const preferenciaImagem = document.getElementById(
    "preferencia-imagem-obra",
  ).value;

  if (tipoObra.value === "anime") {
    const temporadas = listaTemporadas.querySelectorAll(".temporada");

    const primeira = temporadas[0].querySelectorAll("input");

    if (primeira[0].value === "" || primeira[1].value === "") {
      alert("Preencha a primeira temporada.");

      return;
    }

    for (let i = 1; i < temporadas.length; i++) {
      const campos = temporadas[i].querySelectorAll("input");

      const numero = campos[0].value;

      const episodios = campos[1].value;

      if (numero !== "" || episodios !== "") {
        if (numero === "" || episodios === "") {
          alert("Preencha a temporada e a quantidade de episódios.");

          return;
        }
      }
    }
  }

  if (tipoObra.value === "manga") {
    const volumes = listaVolumes.querySelectorAll(".volume");

    const primeiro = volumes[0].querySelectorAll("input");

    if (
      primeiro[0].value === "" ||
      primeiro[1].value === "" ||
      primeiro[2].value === ""
    ) {
      alert("Preencha o primeiro volume.");

      return;
    }

    for (let i = 1; i < volumes.length; i++) {
      const campos = volumes[i].querySelectorAll("input");

      const numero = campos[0].value;

      const inicio = campos[1].value;

      const fim = campos[2].value;

      if (numero !== "" || inicio !== "" || fim !== "") {
        if (numero === "" || inicio === "" || fim === "") {
          alert("Preencha o volume e o início e fim dos capítulos.");

          return;
        }

        if (Number(inicio) > Number(fim)) {
          alert("O início do capítulo não pode ser maior que o fim.");

          return;
        }
      }
    }
  }

  const temporadas = [];

  if (tipoObra.value === "anime") {
    const linhas = listaTemporadas.querySelectorAll(".temporada");

    linhas.forEach((linha) => {
      const campos = linha.querySelectorAll("input");

      if (campos[0].value !== "" && campos[1].value !== "") {
        temporadas.push({
          numero: Number(campos[0].value),

          episodios: Number(campos[1].value),
        });
      }
    });
  }

  const volumes = [];

  if (tipoObra.value === "manga") {
    const linhas = listaVolumes.querySelectorAll(".volume");

    linhas.forEach((linha) => {
      const campos = linha.querySelectorAll("input");

      if (
        campos[0].value !== "" &&
        campos[1].value !== "" &&
        campos[2].value !== ""
      ) {
        volumes.push({
          numero: Number(campos[0].value),

          inicio: Number(campos[1].value),

          fim: Number(campos[2].value),

          vistos: [],
        });
      }
    });
  }

  try {
    const resposta = await fetch("/obras", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      title: tituloObra.value,

      tipo: tipoObra.value,

      status: statusObra.value,

      imagem: imagemObra.value,

      imagem_arquivo: imagemArquivo || null,

      imagem_preferencia: preferenciaImagem,

      link_leitura: linkLeituraObra.value.trim() || null,

      temporadas: temporadas,

      volumes: volumes,
    }),
    });

    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => ({}));
      throw new Error(resultado.erro || "Não foi possível criar a obra.");
    }

    await carregarObras();

    tituloObra.value = "";

    tipoObra.value = "";

    statusObra.value = "";

    imagemObra.value = "";

    arquivoImagemObra.value = "";

    document.getElementById("preferencia-imagem-obra").value = "url";

    linkLeituraObra.value = "";

    previewImagem.src = "";

    previewImagem.hidden = true;

    listaTemporadas.innerHTML = `
        <div class="temporada">

          <label>
            Temporada
            <input
              type="number"
              value="1"
              min="1"
            >
          </label>

          <label>
            Episódios
            <input
              type="number"
              min="0"
            >
          </label>

        </div>
      `;

    listaVolumes.innerHTML = `
  <div class="volume">

    <label>
      Volume
      <input
        type="number"
        value="1"
        min="1"
      >
    </label>

    <label>
      Começa no capítulo
      <input
        type="number"
        value="1"
        min="1"
      >
    </label>

    <label>
      Termina no capítulo
      <input
        type="number"
        min="1"
      >
    </label>

  </div>
`;

    camposAnime.style.display = "none";

    camposManga.style.display = "none";

    popupCriar.style.display = "none";
  } catch (erro) {
    alert(erro.message || "Não foi possível criar a obra.");
  } finally {
    botaoCriar.disabled = false;
  }
});

const imagemObra = document.getElementById("imagem-obra");

const previewImagem = document.getElementById("preview-imagem");

imagemObra.addEventListener("input", () => {
  previewImagem.hidden = !imagemObra.value;

  previewImagem.src = imagemObra.value;
});

previewImagem.addEventListener("error", () => {
  previewImagem.hidden = true;
});

document
  .getElementById("arquivo-imagem-obra")
  .addEventListener("change", async (evento) => {
    const arquivo = evento.target.files[0];

    if (!arquivo) {
      return;
    }

    previewImagem.src = await lerArquivoComoDataUrl(arquivo);
    previewImagem.hidden = false;
  });

document
  .getElementById("preview-imagem-editar")
  .addEventListener("error", (evento) => {
    evento.target.hidden = true;
  });

document
  .getElementById("editar-arquivo-imagem")
  .addEventListener("change", async (evento) => {
    const arquivo = evento.target.files[0];

    if (!arquivo) {
      return;
    }

    const preview = document.getElementById("preview-imagem-editar");
    preview.src = await lerArquivoComoDataUrl(arquivo);
    preview.hidden = false;
  });

const formEditar = document.getElementById("form-editar");

const fecharPopupEditar = document.getElementById("fechar-popup-editar");

const editarListaTemporadas = document.getElementById(
  "editar-lista-temporadas",
);

const editarListaVolumes = document.getElementById("editar-lista-volumes");

const editarAdicionarTemporada = document.getElementById(
  "editar-adicionar-temporada",
);

const editarAdicionarVolume = document.getElementById(
  "editar-adicionar-volume",
);

fecharPopupEditar.addEventListener("click", () => {
  const popupEditar = document.getElementById("popup-editar");

  popupEditar.style.display = "none";
});

editarAdicionarTemporada.addEventListener("click", () => {
  const temporadas = editarListaTemporadas.querySelectorAll(".temporada");

  const ultimaTemporada = temporadas[temporadas.length - 1];

  if (!ultimaTemporada) {
    editarListaTemporadas.innerHTML = `
        <div class="temporada">

          <label>
            Temporada
            <input
              type="number"
              min="1"
            >
          </label>

          <label>
            Episódios
            <input
              type="number"
              min="0"
            >
          </label>

        </div>
      `;

    return;
  }

  const campos = ultimaTemporada.querySelectorAll("input");

  if (campos[0].value === "" || campos[1].value === "") {
    alert("Preencha a temporada e a quantidade de episódios.");

    return;
  }

  const novaTemporada = document.createElement("div");

  novaTemporada.classList.add("temporada");

  novaTemporada.innerHTML = `
      <label>
        Temporada
        <input
          type="number"
          min="1"
        >
      </label>

      <label>
        Episódios
        <input
          type="number"
          min="0"
        >
      </label>
    `;

  editarListaTemporadas.appendChild(novaTemporada);
});

editarAdicionarVolume.addEventListener("click", () => {
  const volumes = editarListaVolumes.querySelectorAll(".volume");

  const ultimoVolume = volumes[volumes.length - 1];

  if (!ultimoVolume) {
    editarListaVolumes.innerHTML = `
    <div class="volume">
      <label>
        Volume
        <input type="number" min="1">
      </label>

      <label>
        Começa no capítulo
        <input type="number" min="1">
      </label>

      <label>
        Termina no capítulo
        <input type="number" min="1">
      </label>
    </div>
  `;
    return;
  }

  const campos = ultimoVolume.querySelectorAll("input");

  if (
    campos[0].value === "" ||
    campos[1].value === "" ||
    campos[2].value === ""
  ) {
    alert("Preencha o volume e o início e fim dos capítulos.");

    return;
  }

  const novoVolume = document.createElement("div");

  novoVolume.classList.add("volume");

  novoVolume.innerHTML = `
  <label>
    Volume
    <input
      type="number"
      min="1"
    >
  </label>

  <label>
    Começa no capítulo
    <input
      type="number"
      min="1"
    >
  </label>

  <label>
    Termina no capítulo
    <input
      type="number"
      min="1"
    >
  </label>
`;
  editarListaVolumes.appendChild(novoVolume);
});

formEditar.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const popupEditar = document.getElementById("popup-editar");

  const id = popupEditar.dataset.id;

  const titulo = document.getElementById("editar-titulo");

  const tipo = document.getElementById("editar-tipo");

  const status = document.getElementById("editar-status");

  const imagem = document.getElementById("editar-imagem");

  const arquivoImagem = document.getElementById("editar-arquivo-imagem");

  const preferenciaImagem = document.getElementById(
    "editar-preferencia-imagem",
  );

  const linkLeitura = document.getElementById("editar-link-leitura");

  imagem.value = imagem.value.trim();

  if (imagem.value && !imagem.checkValidity()) {
    alert("Informe uma URL válida para a imagem.");

    imagem.focus();

    return;
  }

  if (linkLeitura.value && !linkLeitura.checkValidity()) {
    alert("Informe um link válido para ler a obra.");
    linkLeitura.focus();
    return;
  }

  let imagemArquivo = popupEditar.dataset.imagemArquivo || "";

  try {
    const novoArquivo = await lerArquivoComoDataUrl(arquivoImagem.files[0]);

    if (novoArquivo) {
      imagemArquivo = novoArquivo;
    }
  } catch (erro) {
    alert(erro.message);
    return;
  }

  if (!validarImagem(imagem.value, imagemArquivo)) {
    return;
  }

  const temporadas = [];

  const linhasTemporadas = editarListaTemporadas.querySelectorAll(".temporada");

  for (const linha of linhasTemporadas) {
    const campos = linha.querySelectorAll("input");

    const numero = campos[0].value;

    const episodios = campos[1].value;

    if (numero === "" && episodios === "") {
      continue;
    }

    if (numero === "" || episodios === "") {
      alert("Preencha a temporada e a quantidade de episódios.");

      return;
    }

    temporadas.push({
      numero: Number(numero),

      episodios: Number(episodios),

      vistos: JSON.parse(linha.dataset.vistos || "[]"),
    });
  }

  const volumes = [];

  const linhasVolumes = editarListaVolumes.querySelectorAll(".volume");

  for (const linha of linhasVolumes) {
    const campos = linha.querySelectorAll("input");

    const numero = campos[0].value;

    const inicio = campos[1].value;

    const fim = campos[2].value;

    if (numero === "" && inicio === "" && fim === "") {
      continue;
    }

    if (numero === "" || inicio === "" || fim === "") {
      alert("Preencha o volume e o início e fim dos capítulos.");

      return;
    }

    if (Number(inicio) > Number(fim)) {
      alert("O início do capítulo não pode ser maior que o fim.");

      return;
    }

    volumes.push({
      numero: Number(numero),

      inicio: Number(inicio),

      fim: Number(fim),

      vistos: JSON.parse(linha.dataset.vistos || "[]"),
    });
  }

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

      imagem_arquivo: imagemArquivo || null,

      imagem_preferencia: preferenciaImagem.value,

      link_leitura: linkLeitura.value.trim() || null,

      temporadas: tipo.value === "anime" ? temporadas : null,

      volumes: tipo.value === "manga" ? volumes : null,
    }),
  }).then(() => {
    carregarObras();

    popupEditar.style.display = "none";
  });
});
