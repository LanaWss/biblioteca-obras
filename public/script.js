let obraProgressoAtual = null;

let obrasCarregadas = [];

const boasVindas = document.getElementById("boas-vindas");

function mostrarMensagem(texto, tipo) {
  const mensagem = document.getElementById("mensagem");

  mensagem.textContent = texto;
  mensagem.className = tipo;
  mensagem.style.display = "block";

  setTimeout(() => {
    mensagem.style.display = "none";
  }, 3000);
}

if (boasVindas && sessionStorage.getItem("mostrarBoasVindas") === "true") {
  document.getElementById("nome-boas-vindas").textContent =
    localStorage.getItem("nomeUsuario") || "usuário";
  boasVindas.hidden = false;
  sessionStorage.removeItem("mostrarBoasVindas");
  setTimeout(() => {
    boasVindas.hidden = true;
  }, 1600);
}

const buscarObras = document.getElementById("buscar-obras");

const filtroTipo = document.getElementById("filtro-tipo");

const filtroStatus = document.getElementById("filtro-status");

const filtroProgresso = document.getElementById("filtro-progresso");

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

    const progresso = calcularProgresso(obra);
    const progressoCombina =
      !filtroProgresso.value ||
      (filtroProgresso.value === "completo" &&
        progresso.total > 0 &&
        progresso.vistos === progresso.total) ||
      (filtroProgresso.value === "pendente" &&
        progresso.vistos < progresso.total);

    return nomeCombina && tipoCombina && statusCombina && progressoCombina;
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
            (numero) =>
              numero >= obterInicioTemporada(item) &&
              numero < obterInicioTemporada(item) + item[quantidadeKey],
          )
        : [],
    };
  });
}

function obterNumerosVistosValidos(item, inicio, fim) {
  return new Set(
    (Array.isArray(item.vistos) ? item.vistos : [])
      .map(Number)
      .filter((numero) => numero >= inicio && numero <= fim),
  );
}

function obterFimComProgresso(item, inicio, fim) {
  const maiorVisto = Math.max(
    fim,
    ...(Array.isArray(item.vistos) ? item.vistos.map(Number) : []),
  );

  return Math.max(inicio - 1, maiorVisto);
}

function calcularProgresso(obra) {
  const itens =
    obra.tipo === "anime"
      ? lerConteudoObra(obra.temporadas)
      : lerConteudoObra(obra.volumes);

  if (obra.tipo === "manga") {
    const fimDaObra = itens.reduce((maiorFim, item) => {
      const maiorVisto = Math.max(
        ...(Array.isArray(item.vistos) ? item.vistos.map(Number) : []),
        0,
      );

      return Math.max(maiorFim, Number(item.fim) || 0, maiorVisto);
    }, 0);

    const capitulosVistos = new Set();

    itens.forEach((item) => {
      obterNumerosVistosValidos(item, 1, fimDaObra).forEach((numero) => {
        capitulosVistos.add(numero);
      });
    });

    return {
      vistos: capitulosVistos.size,
      total: fimDaObra,
    };
  }

  let total = 0;
  let vistos = 0;

  itens.forEach((item) => {
    const inicio =
      obra.tipo === "manga" ? Number(item.inicio) : obterInicioTemporada(item);
    let fim =
      obra.tipo === "manga"
        ? Number(item.fim)
        : obterInicioTemporada(item) + Number(item.episodios || 0) - 1;
    fim = obterFimComProgresso(item, inicio, fim);

    if (obra.tipo === "manga") {
      total += Math.max(0, fim - inicio + 1);
    } else {
      total += Math.max(0, fim - inicio + 1);
    }

    vistos += obterNumerosVistosValidos(item, inicio, fim).size;
  });

  return {
    vistos,
    total,
  };
}

function obterInicioTemporada(temporada) {
  return Number(temporada.inicio) || 1;
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
    mostrarMensagem(
      "Informe uma URL ou escolha uma imagem do dispositivo.",
      "erro",
    );
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

let filaSalvamentoProgresso = Promise.resolve();

function salvarProgresso() {
  filaSalvamentoProgresso = filaSalvamentoProgresso.then(async () => {
    const obra = obraProgressoAtual;
    const resposta = await fetch(`/obras/${obra.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        temporadas: obra.temporadas,
        volumes: obra.volumes,
      }),
    });

    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => ({}));

      mostrarMensagem(
        resultado.erro || "Não foi possível salvar o progresso.",
        "erro",
      );

      return;
    }

    await carregarObras();

    mostrarMensagem("Progresso salvo com sucesso!", "sucesso");
  });

  return filaSalvamentoProgresso;
}

function renderizarProgresso() {
  const obra = obraProgressoAtual;

  const listaProgresso = document.getElementById("lista-progresso");

  const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;

  const quantidadeKey = obra.tipo === "anime" ? "episodios" : "capitulos";

  const itemLabel = obra.tipo === "anime" ? "Episódio" : "Capítulo";

  const grupoLabel = obra.tipo === "anime" ? "Temporada" : "Volume";
  const todosItens = itens.every((item) => {
    const inicio =
      obra.tipo === "manga" ? Number(item.inicio) : obterInicioTemporada(item);
    const fim = obterFimComProgresso(
      item,
      inicio,
      obra.tipo === "manga"
        ? Number(item.fim)
        : obterInicioTemporada(item) + Number(item.episodios) - 1,
    );

    return (
      obterNumerosVistosValidos(item, inicio, fim).size === fim - inicio + 1
    );
  });

  const botaoTodaObra = document.getElementById("marcar-toda-obra");
  botaoTodaObra.textContent = todosItens
    ? "Desmarcar toda a obra"
    : "Marcar toda a obra";

  listaProgresso.innerHTML = itens
    .map((item, indice) => {
      const inicio =
        obra.tipo === "manga" ? item.inicio : obterInicioTemporada(item);

      const fim = obterFimComProgresso(
        item,
        inicio,
        obra.tipo === "manga"
          ? Number(item.fim)
          : obterInicioTemporada(item) + Number(item[quantidadeKey]) - 1,
      );

      const totalItens = fim - inicio + 1;

      const vistosValidos = obterNumerosVistosValidos(item, inicio, fim);
      const todosMarcados = vistosValidos.size === totalItens;

      const itensHtml = Array.from({ length: totalItens }, (_, numero) => {
        const numeroItem = inicio + numero;

        const marcado = vistosValidos.has(numeroItem);

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
  const obraDaLista = obrasCarregadas.find(
    (obra) => String(obra.id) === String(id),
  );

  fetch(`/obras/${id}`)
    .then((resposta) => resposta.json())
    .then((obraRecebida) => {
      const obra =
        obraRecebida && obraRecebida.title ? obraRecebida : obraDaLista;

      if (!obra) {
        mostrarMensagem(
          "Não foi possível carregar o progresso desta obra.",
          "erro",
        );
        return;
      }

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
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  fetch("/obras", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then(async (resposta) => {
      const resultado = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        const erro = new Error(
          resultado.erro || "Não foi possível carregar as obras.",
        );
        erro.status = resposta.status;
        throw erro;
      }

      if (!Array.isArray(resultado)) {
        throw new Error("Resposta inválida ao carregar as obras.");
      }

      return resultado;
    })
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

            <div class="lista-volumes-card">
              ${volumes
                .map(
                  (volume, indice) => `
                    <p ${indice > 0 ? 'hidden data-volume-extra="true"' : ""}>
                      Volume ${volume.numero} —
                      capítulos ${volume.inicio}–${volume.fim}
                    </p>
                  `,
                )
                .join("")}
            </div>

            ${
              volumes.length > 1
                ? `<button type="button" class="botao-mais-volumes" data-volumes-expandidos="false">
                  Ler mais
                </button>`
                : ""
            }
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
    })
    .catch((erro) => {
      if (erro.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
        return;
      }

      mostrarMensagem(erro.message, "erro");
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

filtroProgresso.addEventListener("change", () => {
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

  filtroProgresso.value = "";

  carregarObras();
});

document
  .querySelectorAll(
    "#popup-filtros, #popup-criar, #popup-editar, #popup-progresso, #popup-confirmar-exclusao",
  )
  .forEach((popup) => {
    popup.addEventListener("click", (evento) => {
      if (evento.target === popup) {
        popup.style.display = "none";
      }
    });
  });

document.addEventListener("click", (evento) => {
  const botaoEditar = evento.target.closest("button[data-id]");

  if (botaoEditar) {
    const id = botaoEditar.dataset.id;
    const obraDaLista = obrasCarregadas.find(
      (obra) => String(obra.id) === String(id),
    );

    fetch(`/obras/${id}`)
      .then((resposta) => resposta.json())
      .then((obraRecebida) => {
        const obra =
          obraRecebida && obraRecebida.title ? obraRecebida : obraDaLista;

        if (!obra) {
          mostrarMensagem(
            "Não foi possível carregar os dados desta obra.",
            "erro",
          );
          return;
        }

        const popupEditar = document.getElementById("popup-editar");

        popupEditar.dataset.id = id;

        document.getElementById("editar-titulo").value = obra.title || "";

        document.getElementById("editar-tipo").value = obra.tipo || "";

        document.getElementById("editar-status").value = obra.status || "";

        document.getElementById("editar-imagem").value = obra.imagem || "";
        document.getElementById("editar-preferencia-imagem").value =
          obra.imagem_preferencia || "url";
        document.getElementById("editar-link-leitura").value =
          obra.link_leitura || "";
        popupEditar.dataset.imagemUrl = obra.imagem || "";
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

          const temporadas = lerConteudoObra(obra.temporadas);

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
              <label>
                Começa no episódio
                <input type="number" min="1" value="${obterInicioTemporada(temporada)}">
              </label>
            `;

            editarListaTemporadas.appendChild(linha);
          });
        } else if (obra.tipo === "manga") {
          editarCamposAnime.style.display = "none";

          editarCamposManga.style.display = "block";

          const volumes = lerConteudoObra(obra.volumes);

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

  const botaoExcluir = evento.target.closest("button[data-delete-id]");

  if (botaoExcluir) {
    const popupExclusao = document.getElementById("popup-confirmar-exclusao");
    const obra = obrasCarregadas.find(
      (item) => String(item.id) === String(botaoExcluir.dataset.deleteId),
    );

    popupExclusao.dataset.id = botaoExcluir.dataset.deleteId;
    document.getElementById("nome-obra-exclusao").textContent =
      obra?.title || "";
    popupExclusao.hidden = false;
    popupExclusao.style.display = "flex";
  }

  if (evento.target.matches("button[data-progress-id]")) {
    abrirPopupProgresso(evento.target.dataset.progressId);
  }

  if (evento.target.matches("button[data-volumes-expandidos]")) {
    const botao = evento.target;
    const card = botao.closest(".cards");
    const mostrar = botao.dataset.volumesExpandidos !== "true";

    card.querySelectorAll("[data-volume-extra]").forEach((volume) => {
      volume.hidden = !mostrar;
    });

    botao.dataset.volumesExpandidos = String(mostrar);
    botao.textContent = mostrar ? "Mostrar menos" : "Ler mais";
  }

  if (evento.target.matches("button[data-marcar-todos]")) {
    const indice = Number(evento.target.dataset.marcarTodos);

    const obra = obraProgressoAtual;

    const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;

    const item = itens[indice];

    const inicio =
      obra.tipo === "manga" ? item.inicio : obterInicioTemporada(item);

    const fim =
      obra.tipo === "manga"
        ? item.fim
        : obterInicioTemporada(item) + item.episodios - 1;

    const totalItens = fim - inicio + 1;

    const todosMarcados =
      obterNumerosVistosValidos(item, inicio, fim).size === totalItens;

    item.vistos = todosMarcados
      ? []
      : Array.from({ length: totalItens }, (_, numero) => inicio + numero);

    renderizarProgresso();

    salvarProgresso();
  }

  if (evento.target.matches("#marcar-toda-obra")) {
    const obra = obraProgressoAtual;
    const itens = obra.tipo === "anime" ? obra.temporadas : obra.volumes;
    const todosMarcados = itens.every((item) => {
      const inicio =
        obra.tipo === "manga" ? item.inicio : obterInicioTemporada(item);
      const fim =
        obra.tipo === "manga"
          ? item.fim
          : obterInicioTemporada(item) + item.episodios - 1;

      return (
        obterNumerosVistosValidos(item, inicio, fim).size === fim - inicio + 1
      );
    });

    itens.forEach((item) => {
      const inicio =
        obra.tipo === "manga" ? item.inicio : obterInicioTemporada(item);
      const fim =
        obra.tipo === "manga"
          ? item.fim
          : obterInicioTemporada(item) + item.episodios - 1;

      item.vistos = todosMarcados
        ? []
        : Array.from(
            { length: fim - inicio + 1 },
            (_, numero) => inicio + numero,
          );
    });

    renderizarProgresso();
    salvarProgresso();
  }

  if (evento.target.matches("button#fechar-popup-progresso")) {
    document.getElementById("popup-progresso").style.display = "none";
  }
});

document.addEventListener("change", async (evento) => {
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

  await salvarProgresso();
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
    mostrarMensagem(
      "Preencha a temporada e a quantidade de episódios.",
      "erro",
    );

    return;
  }

  if (Number(campos[2].value) > Number(campos[1].value)) {
    mostrarMensagem(
      "O episódio inicial não pode ser maior que a quantidade de episódios.",
      "erro",
    );
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
      <label>
        Começa no episódio
        <input type="number" min="1" value="${Number(campos[1].value) + 1}">
      </label>
    `;

  listaTemporadas.appendChild(novaTemporada);
});

adicionarVolume.addEventListener("click", () => {
  const volumes = listaVolumes.querySelectorAll(".volume");

  const ultimoVolume = volumes[volumes.length - 1];

  const campos = ultimoVolume.querySelectorAll("input");

  const numero = campos[0].value;
  const inicio = campos[1].value;
  const fim = campos[2].value;

  if (!numero || !inicio || !fim) {
    mostrarMensagem("Preencha todos os campos do volume.", "erro");
    return;
  }

  if (Number(inicio) > Number(fim)) {
    mostrarMensagem(
      "O capítulo inicial não pode ser maior que o final.",
      "erro",
    );
    return;
  }

  const novoVolume = document.createElement("div");

  novoVolume.classList.add("volume");

  const proximoNumero = Number(campos[0].value) + 1;
  const proximoInicio = Number(campos[2].value) + 1;

  novoVolume.innerHTML = `
    <label>
      Volume
      <input
        type="number"
        min="1"
        value="${proximoNumero}"
      >
    </label>

    <label>
      Começa no capítulo
      <input
        type="number"
        min="1"
        value="${proximoInicio}"
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

let titulosAlternativos = [];

const campoTituloAlternativo = document.getElementById("titulo-alternativo");
const botaoAdicionarTituloAlternativo = document.getElementById(
  "adicionar-titulo-alternativo",
);
const listaTitulosAlternativos = document.getElementById(
  "lista-titulos-alternativos",
);
const selectTituloExibicao = document.getElementById("titulo-exibicao");

botaoAdicionarTituloAlternativo.addEventListener("click", () => {
  const titulo = campoTituloAlternativo.value.trim();

  if (!titulo) {
    mostrarMensagem("Digite um título alternativo.", "aviso");
    return;
  }

  titulosAlternativos.push(titulo);

  campoTituloAlternativo.value = "";

  renderizarTitulosAlternativos();
});

function renderizarTitulosAlternativos() {
  const selecaoAtual = selectTituloExibicao.value || "principal";

  listaTitulosAlternativos.innerHTML = "";

  selectTituloExibicao.innerHTML = `
    <option value="principal">Título principal</option>
  `;

  titulosAlternativos.forEach((titulo, indice) => {
    const item = document.createElement("div");

    const texto = document.createElement("span");
    texto.textContent = titulo;

    const botaoRemover = document.createElement("button");
    botaoRemover.type = "button";
    botaoRemover.textContent = "×";

    botaoRemover.addEventListener("click", () => {
      titulosAlternativos.splice(indice, 1);
      renderizarTitulosAlternativos();
    });

    item.append(texto, botaoRemover);

    listaTitulosAlternativos.appendChild(item);

    const opcao = document.createElement("option");
    opcao.value = titulo;
    opcao.textContent = titulo;

    selectTituloExibicao.appendChild(opcao);
  });

  selectTituloExibicao.value = titulosAlternativos.includes(selecaoAtual)
    ? selecaoAtual
    : "principal";
}

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
    mostrarMensagem("Informe uma URL válida para a imagem.", "erro");
    imagemObra.focus();
    botaoCriar.disabled = false;
    return;
  }

  if (linkLeituraObra.value && !linkLeituraObra.checkValidity()) {
    mostrarMensagem("Informe um link válido para ler a obra.", "erro");
    linkLeituraObra.focus();
    botaoCriar.disabled = false;
    return;
  }

  let imagemArquivo = "";

  try {
    imagemArquivo = await lerArquivoComoDataUrl(arquivoImagemObra.files[0]);
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
    botaoCriar.disabled = false;
    return;
  }

  const preferenciaImagem = document.getElementById(
    "preferencia-imagem-obra",
  ).value;

  if (tipoObra.value === "anime") {
    const temporadas = listaTemporadas.querySelectorAll(".temporada");

    const primeira = temporadas[0].querySelectorAll("input");
    const primeiraVazia = [...primeira].every((campo) => campo.value === "");
    const primeiraIncompleta = [...primeira].some(
      (campo) => campo.value === "",
    );

    if (!primeiraVazia && primeiraIncompleta) {
      mostrarMensagem("Preencha a primeira temporada.", "erro");

      botaoCriar.disabled = false;
      return;
    }

    if (
      !primeiraVazia &&
      Number(primeira[2].value) > Number(primeira[1].value)
    ) {
      mostrarMensagem(
        "O episódio inicial não pode ser maior que a quantidade de episódios.",
        "erro",
      );

      botaoCriar.disabled = false;
      return;
    }

    for (let i = 1; i < temporadas.length; i++) {
      const campos = temporadas[i].querySelectorAll("input");

      const numero = campos[0].value;

      const episodios = campos[1].value;
      const inicio = campos[2].value;

      if (numero !== "" || episodios !== "" || inicio !== "") {
        if (numero === "" || episodios === "" || inicio === "") {
          mostrarMensagem(
            "Preencha a temporada e a quantidade de episódios.",
            "erro",
          );

          botaoCriar.disabled = false;
          return;
        }
        if (Number(inicio) > Number(episodios)) {
          mostrarMensagem(
            "O episódio inicial não pode ser maior que a quantidade de episódios.",
            "erro",
          );

          botaoCriar.disabled = false;
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
      mostrarMensagem("Preencha o primeiro volume.", "erro");

      botaoCriar.disabled = false;
      return;
    }

    if (Number(primeiro[1].value) > Number(primeiro[2].value)) {
      mostrarMensagem(
        "O início do capítulo não pode ser maior que o fim.",
        "erro",
      );

      botaoCriar.disabled = false;
      return;
    }

    for (let i = 1; i < volumes.length; i++) {
      const campos = volumes[i].querySelectorAll("input");

      const numero = campos[0].value;

      const inicio = campos[1].value;

      const fim = campos[2].value;

      if (numero !== "" || inicio !== "" || fim !== "") {
        if (numero === "" || inicio === "" || fim === "") {
          mostrarMensagem(
            "Preencha o volume e o início e fim dos capítulos.",
            "erro",
          );

          botaoCriar.disabled = false;
          return;
        }

        if (Number(inicio) > Number(fim)) {
          mostrarMensagem(
            "O início do capítulo não pode ser maior que o fim.",
            "erro",
          );

          botaoCriar.disabled = false;
          return;
        }
      }
    }
  }

  const temporadas = [];

  if (tipoObra.value === "anime") {
    const linhasTemporadas = listaTemporadas.querySelectorAll(".temporada");
    for (let i = 0; i < linhasTemporadas.length; i++) {
      const campos = linhasTemporadas[i].querySelectorAll("input");

      const numero = campos[0].value;
      const episodios = campos[1].value;
      const inicio = campos[2].value;

      if (numero === "" && episodios === "" && inicio === "") {
        continue;
      }

      if (numero === "" || episodios === "" || inicio === "") {
        mostrarMensagem("Preencha todos os campos da temporada.", "erro");

        botaoCriar.disabled = false;
        return;
      }

      const temporada = {
        numero: Number(numero),
        episodios: Number(episodios),
        inicio: Number(inicio),
        vistos: [],
      };

      temporadas.push(temporada);
    }
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

    if (volumes.length === 0) {
      mostrarMensagem(
        "Envie pelo menos um volume completo antes de criar a obra.",
        "erro",
      );
      botaoCriar.disabled = false;
      return;
    }
  }

  try {
    const resposta = await fetch("/obras", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
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

        titulos_alternativos: titulosAlternativos,

        titulo_exibicao: selectTituloExibicao.value,
      }),
    });

    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => ({}));
      throw new Error(resultado.erro || "Não foi possível criar a obra.");
    }

    await carregarObras();

    mostrarMensagem("Obra criada com sucesso!", "sucesso");

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
          <label>
            Começa no episódio
            <input type="number" min="1" value="1">
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
    mostrarMensagem(erro.message || "Não foi possível criar a obra.", "erro");
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
          <label>
            Começa no episódio
            <input type="number" min="1" value="1">
          </label>

        </div>
      `;

    return;
  }

  const campos = ultimaTemporada.querySelectorAll("input");

  if (campos[0].value === "" || campos[1].value === "") {
    mostrarMensagem(
      "Preencha a temporada e a quantidade de episódios.",
      "erro",
    );

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
      <label>
        Começa no episódio
        <input type="number" min="1" value="${Number(campos[1].value) + 1}">
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
        <input type="number" min="1" value="1">
      </label>

      <label>
        Começa no capítulo
        <input type="number" min="1" value="1">
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
    mostrarMensagem(
      "Preencha o volume, o início e o fim dos capítulos.",
      "erro",
    );
    return;
  }

  if (Number(campos[1].value) > Number(campos[2].value)) {
    mostrarMensagem(
      "O início do capítulo não pode ser maior que o fim.",
      "erro",
    );
    return;
  }

  const novoVolume = document.createElement("div");

  novoVolume.classList.add("volume");

  const proximoNumero = Number(campos[0].value) + 1;
  const proximoInicio = Number(campos[2].value) + 1;

  novoVolume.innerHTML = `
  <label>
    Volume
    <input
      type="number"
      min="1"
      value="${proximoNumero}"
    >
  </label>

  <label>
    Começa no capítulo
    <input
      type="number"
      min="1"
      value="${proximoInicio}"
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
    mostrarMensagem("Informe uma URL válida para a imagem.", "erro");
    imagem.focus();

    return;
  }

  if (linkLeitura.value && !linkLeitura.checkValidity()) {
    mostrarMensagem("Informe um link válido para ler a obra.", "erro");
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
    mostrarMensagem(erro.message, "erro");
    return;
  }

  if (!imagem.value && !imagemArquivo) {
    imagem.value = popupEditar.dataset.imagemUrl || "";
  }

  const temporadas = [];

  const linhasTemporadas = editarListaTemporadas.querySelectorAll(".temporada");

  for (const linha of linhasTemporadas) {
    const campos = linha.querySelectorAll("input");

    const numero = campos[0].value;

    const episodios = campos[1].value;
    const inicio = campos[2].value;

    if (numero === "" && episodios === "" && inicio === "") {
      continue;
    }

    if (numero === "" || episodios === "" || inicio === "") {
      mostrarMensagem(
        "Preencha a temporada e a quantidade de episódios.",
        "erro",
      );

      return;
    }

    temporadas.push({
      numero: Number(numero),

      episodios: Number(episodios),
      inicio: Number(inicio),

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
      mostrarMensagem(
        "Preencha o volume e o início e fim dos capítulos.",
        "erro",
      );

      return;
    }

    if (Number(inicio) > Number(fim)) {
      mostrarMensagem(
        "O início do capítulo não pode ser maior que o fim.",
        "erro",
      );

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
      Authorization: `Bearer ${localStorage.getItem("token")}`,
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
  }).then(async (resposta) => {
    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => ({}));

      mostrarMensagem(
        resultado.erro || "Não foi possível editar a obra.",
        "erro",
      );

      return;
    }

    await carregarObras();
    popupEditar.style.display = "none";

    mostrarMensagem("Obra editada com sucesso!", "sucesso");
  });
});

document.getElementById("botao-sair").addEventListener("click", () => {
  localStorage.removeItem("token");

  window.location.href = "/login.html";
});

const popupExclusao = document.getElementById("popup-confirmar-exclusao");

document.getElementById("cancelar-exclusao").addEventListener("click", () => {
  popupExclusao.hidden = true;
  popupExclusao.style.display = "none";
});

document
  .getElementById("confirmar-exclusao")
  .addEventListener("click", async () => {
    const id = popupExclusao.dataset.id;
    const resposta = await fetch(`/obras/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!resposta.ok) {
      mostrarMensagem("Não foi possível excluir a obra.", "erro");
      return;
    }

    popupExclusao.hidden = true;
    popupExclusao.style.display = "none";
    await carregarObras();

    mostrarMensagem("Obra excluída com sucesso!", "sucesso");
  });
