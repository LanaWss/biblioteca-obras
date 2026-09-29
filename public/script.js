let obraProgressoAtual = null;

let obrasCarregadas = [];
let carregamentoObrasAtual = 0;
let controladorCarregamentoObras = null;
let linksLeituraCriacao = [];
let linksLeituraEdicao = [];
let linksEscolhaAtual = [];

const boasVindas = document.getElementById("boas-vindas");

document.getElementById("botao-inicio").addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

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

const filtroFavorito = document.getElementById("filtro-favorito");

function normalizarTexto(valor) {
  return valor
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tipoTemAnime(tipo) {
  return tipo === "anime" || tipo === "ambos";
}

function tipoTemManga(tipo) {
  return tipo === "manga" || tipo === "ambos";
}

function atualizarCamposDeTipo(tipo, camposAnime, camposManga) {
  camposAnime.style.display = tipoTemAnime(tipo) ? "block" : "none";
  camposManga.style.display = tipoTemManga(tipo) ? "block" : "none";
}

function obterItensDaObra(obra, tipo) {
  return tipo === "anime" ? obra.temporadas : obra.volumes;
}

function obterObrasFiltradas() {
  const termo = normalizarTexto(buscarObras.value.trim());

  return obrasCarregadas.filter((obra) => {
    const titulosAlternativos = Array.isArray(obra.titulos_alternativos)
      ? obra.titulos_alternativos
      : lerConteudoObra(obra.titulos_alternativos);
    const nomeCombina = [obra.title, ...titulosAlternativos].some((titulo) =>
      normalizarTexto(titulo || "").includes(termo),
    );

    const tipoCombina =
      !filtroTipo.value ||
      obra.tipo === filtroTipo.value ||
      (filtroTipo.value === "anime" && tipoTemAnime(obra.tipo)) ||
      (filtroTipo.value === "manga" && tipoTemManga(obra.tipo));

    const statusCombina =
      !filtroStatus.value || obra.status === filtroStatus.value;

    const progresso = calcularProgresso(obra);
    const progressoCombina =
      !filtroProgresso.value ||
      (filtroProgresso.value === "nao-comecou" && progresso.vistos === 0) ||
      (filtroProgresso.value === "completo" &&
        progresso.total > 0 &&
        progresso.vistos === progresso.total) ||
      (filtroProgresso.value === "pendente" &&
        progresso.vistos < progresso.total);

    const favoritoCombina =
      !filtroFavorito.value ||
      (filtroFavorito.value === "favoritos" && obra.favorito === 1);

    return (
      nomeCombina &&
      tipoCombina &&
      statusCombina &&
      progressoCombina &&
      favoritoCombina
    );
  });
}

function lerConteudoObra(valor) {
  if (!valor) {
    return [];
  }

  if (Array.isArray(valor)) {
    return valor;
  }

  try {
    return JSON.parse(valor);
  } catch (erro) {
    return [];
  }
}

function obterLinksLeitura(obra) {
  let links = lerConteudoObra(obra.link_leituras);

  if (!links.length && obra.link_leitura) {
    links = [{ nome: "", url: String(obra.link_leitura).trim() }];
  }

  return links.filter((link) => link && link.url);
}

function renderizarListaLinks(links, lista, prefixo) {
  lista.innerHTML = links
    .map(
      (link, indice) => `
    <div class="item-link-leitura">
      <span>${link.nome || "Link de leitura"}</span>
      <button type="button" data-remover-link="${prefixo}" data-indice-link="${indice}" aria-label="Remover link">×</button>
    </div>
  `,
    )
    .join("");
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

function calcularProgressoPorTipo(itens, tipo) {
  if (tipo === "manga") {
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
    const inicio = obterInicioTemporada(item);
    let fim = inicio + Number(item.episodios || 0) - 1;
    fim = obterFimComProgresso(item, inicio, fim);

    total += Math.max(0, fim - inicio + 1);
    vistos += obterNumerosVistosValidos(item, inicio, fim).size;
  });

  return {
    vistos,
    total,
  };
}

function calcularProgresso(obra) {
  const progressoAnime = tipoTemAnime(obra.tipo)
    ? calcularProgressoPorTipo(lerConteudoObra(obra.temporadas), "anime")
    : { vistos: 0, total: 0 };
  const progressoManga = tipoTemManga(obra.tipo)
    ? calcularProgressoPorTipo(lerConteudoObra(obra.volumes), "manga")
    : { vistos: 0, total: 0 };

  return {
    vistos: progressoAnime.vistos + progressoManga.vistos,
    total: progressoAnime.total + progressoManga.total,
  };
}

function renderizarProgressoTipo(obra, tipo) {
  if (obra.tipo !== "ambos") {
    return "";
  }

  const itens =
    tipo === "anime"
      ? lerConteudoObra(obra.temporadas)
      : lerConteudoObra(obra.volumes);
  const progresso = calcularProgressoPorTipo(itens, tipo);
  const percentual = progresso.total
    ? (progresso.vistos / progresso.total) * 100
    : 0;

  return `
    <div class="progresso-tipo-card">
      <div class="progresso-texto">
        <span>${progresso.vistos}/${progresso.total}</span>
      </div>
      <div class="barra-progresso">
        <div class="barra-progresso-preenchida" style="width: ${percentual}%"></div>
      </div>
    </div>
  `;
}

function ordenarItensPeloProgresso(obra, itens, tipo = obra.tipo) {
  if (itens.length < 2) {
    return itens;
  }

  const maiorVisto = Math.max(
    ...itens.flatMap((item) =>
      Array.isArray(item.vistos) ? item.vistos.map(Number) : [],
    ),
    0,
  );

  if (maiorVisto === 0) {
    return itens;
  }

  let indiceAtual = 0;

  itens.forEach((item, indice) => {
    const inicio =
      tipo === "manga" ? Number(item.inicio) : obterInicioTemporada(item);
    const fim =
      tipo === "manga"
        ? Number(item.fim)
        : inicio + Number(item.episodios || 0) - 1;

    if (maiorVisto >= inicio && maiorVisto <= fim) {
      indiceAtual = indice;
    }
  });

  return [
    itens[indiceAtual],
    ...itens.filter((_, indice) => indice !== indiceAtual),
  ];
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
  const imagemLocal = imagens.arquivo;
  const imagemPreferida = imagens[preferida] || imagens.url || imagens.arquivo;

  if (imagemLocal) {
    return {
      principal: imagemLocal,
      fallback: imagemPreferida === imagemLocal ? imagens.url || "" : imagemPreferida,
    };
  }

  return {
    principal: imagemPreferida || "",
    fallback: preferida === "url" ? imagens.arquivo || "" : imagens.url || "",
  };
}

function obterImagemParaCss(url) {
  const urlEscapada = String(url)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\A");

  return `url("${urlEscapada}")`;
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
    imagens.principal ? obterImagemParaCss(imagens.principal) : "none",
  );

  if (!imagem || !imagens.principal) {
    return;
  }

  const usarFallback = () => {
    if (imagens.fallback && !imagem.dataset.fallbackTentado) {
      imagem.dataset.fallbackTentado = "true";
      imagem.src = imagens.fallback;
      card.style.setProperty(
        "--imagem-obra",
        obterImagemParaCss(imagens.fallback),
      );
      ajustarCorDoTexto(card, imagens.fallback);
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
    aviso.hidden = true;
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

  const tipos = [
    ...(tipoTemAnime(obra.tipo)
      ? [{ chave: "anime", itens: obra.temporadas }]
      : []),
    ...(tipoTemManga(obra.tipo)
      ? [{ chave: "manga", itens: obra.volumes }]
      : []),
  ];
  const todosItens = tipos.every(({ chave, itens }) =>
    itens.every((item) => {
      const inicio =
        chave === "manga" ? Number(item.inicio) : obterInicioTemporada(item);
      const fim = obterFimComProgresso(
        item,
        inicio,
        chave === "manga"
          ? Number(item.fim)
          : inicio + Number(item.episodios) - 1,
      );

      return (
        obterNumerosVistosValidos(item, inicio, fim).size === fim - inicio + 1
      );
    }),
  );

  const botaoTodaObra = document.getElementById("marcar-toda-obra");
  botaoTodaObra.textContent = todosItens
    ? "Desmarcar toda a obra"
    : "Marcar toda a obra";

  listaProgresso.innerHTML = tipos
    .map(({ chave, itens }) => {
      const itemLabel = chave === "anime" ? "Episódio" : "Capítulo";
      const grupoLabel = chave === "anime" ? "Temporada" : "Volume";

      return itens
        .map((item, indice) => {
          const inicio =
            chave === "manga"
              ? Number(item.inicio)
              : obterInicioTemporada(item);

          const fim = obterFimComProgresso(
            item,
            inicio,
            chave === "manga"
              ? Number(item.fim)
              : inicio + Number(item.episodios || 0) - 1,
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
          data-progresso-tipo="${chave}"
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
              data-marcar-tipo="${chave}"
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
        `Progresso: ${obterTituloExibicao(obra)}`;

      renderizarProgresso();

      document.getElementById("popup-progresso").style.display = "flex";
    });
}

function prepararAvanco(itens, tipo) {
  if (!itens.length) {
    if (tipo === "anime") {
      itens.push({
        numero: 1,
        inicio: 1,
        episodios: 1,
        vistos: [1],
      });
    } else {
      itens.push({
        numero: 1,
        inicio: 1,
        fim: 1,
        vistos: [1],
      });
    }

    return { proximo: 1, criouNovoItem: true };
  }

  const ultimoItem = itens[itens.length - 1];

  if (!ultimoItem) {
    return null;
  }

  const vistos = new Set(
    Array.isArray(ultimoItem.vistos) ? ultimoItem.vistos.map(Number) : [],
  );
  const inicio =
    tipo === "anime"
      ? obterInicioTemporada(ultimoItem)
      : Number(ultimoItem.inicio);
  const limiteAtual =
    tipo === "anime"
      ? inicio + Number(ultimoItem.episodios || 0) - 1
      : Number(ultimoItem.fim);
  const proximo = Math.max(limiteAtual, ...vistos, inicio - 1) + 1;

  if (tipo === "anime") {
    ultimoItem.episodios = proximo - inicio + 1;
  } else {
    ultimoItem.fim = proximo;
  }

  vistos.add(proximo);
  ultimoItem.vistos = [...vistos].sort((a, b) => a - b);

  return { proximo, criouNovoItem: true };
}

async function avancarProgresso(id, botao, tipoEscolhido) {
  let obra = obrasCarregadas.find((item) => String(item.id) === String(id));

  if (!obra) {
    return;
  }

  try {
    const respostaAtual = await fetch(`/obras/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (respostaAtual.ok) {
      obra = await respostaAtual.json();
    }
  } catch (erro) {}

  const tipos =
    tipoEscolhido === "ambos"
      ? ["anime", "manga"]
      : [tipoEscolhido || (tipoTemAnime(obra.tipo) ? "anime" : "manga")];
  const avancos = [];
  const dados = {};

  tipos.forEach((tipo) => {
    const chave = tipo === "anime" ? "temporadas" : "volumes";
    const itens = lerConteudoObra(obra[chave]);
    const avanco = prepararAvanco(itens, tipo);

    if (avanco) {
      dados[chave] = itens;
      avancos.push({ tipo, ...avanco });
    }
  });

  if (!avancos.length) {
    mostrarMensagem("Adicione uma temporada ou volume primeiro.", "aviso");
    return;
  }

  botao.disabled = true;

  try {
    const resposta = await fetch(`/obras/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(dados),
    });

    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarMensagem(
        resultado.erro || "Não foi possível atualizar o progresso.",
        "erro",
      );
      return;
    }

    const obraLocal = obrasCarregadas.find(
      (item) => String(item.id) === String(id),
    );

    if (obraLocal) {
      Object.entries(dados).forEach(([chave, itens]) => {
        obraLocal[chave] = resultado[chave] || JSON.stringify(itens);
      });
    }

    await carregarObras();
    const resumo = avancos
      .map(
        ({ tipo, proximo, criouNovoItem }) =>
          `${tipo === "anime" ? "Episódio" : "Capítulo"} ${proximo}${criouNovoItem ? " criado" : ""}`,
      )
      .join(" e ");
    mostrarMensagem(`${resumo} marcado como visto.`, "sucesso");
  } catch (erro) {
    mostrarMensagem("Não foi possível atualizar o progresso.", "erro");
  } finally {
    botao.disabled = false;
  }
}

function obterTituloExibicao(obra) {
  if (!obra.titulo_exibicao || obra.titulo_exibicao === "principal") {
    return obra.title;
  }

  return obra.titulo_exibicao;
}

function carregarObras() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const numeroCarregamento = ++carregamentoObrasAtual;

  controladorCarregamentoObras?.abort();
  controladorCarregamentoObras = new AbortController();

  return fetch("/obras", {
    cache: "no-store",
    signal: controladorCarregamentoObras.signal,
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
      if (numeroCarregamento !== carregamentoObrasAtual) {
        return;
      }

      obras.sort(
        (obraA, obraB) =>
          (Number(obraA.ordem) || Number.MAX_SAFE_INTEGER) -
            (Number(obraB.ordem) || Number.MAX_SAFE_INTEGER) ||
          Number(obraA.id) - Number(obraB.id),
      );

      obrasCarregadas = obras;

      const lista = document.getElementById("lista-obras");

      lista.innerHTML = "";

      obterObrasFiltradas().forEach((obra) => {
        let conteudo = "";

        const progresso = calcularProgresso(obra);
        const progressoTemporadas = renderizarProgressoTipo(obra, "anime");
        const progressoVolumes = renderizarProgressoTipo(obra, "manga");

        const statusExibido = {
          completa: "Completa",
          hiato: "Em hiato",
          lancando: "Lançando",
        }[obra.status];

        if (tipoTemAnime(obra.tipo)) {
          const temporadas = ordenarItensPeloProgresso(
            obra,
            lerConteudoObra(obra.temporadas),
            "anime",
          );

          conteudo = `
            <h3><i class="fa-solid fa-list"></i> Temporadas</h3>

            ${progressoTemporadas}

            <div class="lista-temporadas-card">
              ${temporadas
                .map(
                  (temporada, indice) => `
                  <p ${indice > 0 ? 'hidden data-temporada-extra="true"' : ""}>
                    Temporada ${temporada.numero} —
                    episódios ${obterInicioTemporada(temporada)}–${
                      obterInicioTemporada(temporada) +
                      Number(temporada.episodios || 0) -
                      1
                    }
                  </p>
                  `,
                )
                .join("")}
            </div>

            ${
              temporadas.length > 1
                ? `<button type="button" class="botao-mais-itens" data-temporadas-expandidas="false">
                  Ler mais
                </button>`
                : ""
            }
          `;
        }

        if (tipoTemManga(obra.tipo)) {
          const volumes = ordenarItensPeloProgresso(
            obra,
            lerConteudoObra(obra.volumes),
            "manga",
          );

          conteudo += `
            <h3><i class="fa-solid fa-book"></i> Volumes</h3>

            ${progressoVolumes}

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
                ? `<button type="button" class="botao-mais-itens" data-volumes-expandidos="false">
                  Ler mais
                </button>`
                : ""
            }
          `;
        }

        const imagens = obterImagemPreferida(obra);
        const linksLeitura = obterLinksLeitura(obra);
        const imagem = imagens.principal
          ? `<img class="imagem-obra" src="${imagens.principal}" referrerpolicy="no-referrer" alt="${obterTituloExibicao(obra)}">`
          : "";
        const botaoLeitura =
          linksLeitura.length === 1
            ? `
              <a
                class="botao-ler"
                href="${linksLeitura[0].url}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="fa-solid fa-book-open"></i>Ler
              </a>
            `
            : linksLeitura.length > 1
              ? `<button type="button" class="botao-ler" data-escolher-link="${obra.id}"><i class="fa-solid fa-book-open"></i>Ler</button>`
              : "";

        lista.innerHTML += `
          <div
            class="cards"
            data-card-id="${obra.id}"
          >

          <button
  type="button"
  class="botao-favorito"
  data-favorito-id="${obra.id}"
  aria-label="${obra.favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}"
  title="${obra.favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}"
>
  <i class="${obra.favorito ? "fa-solid" : "fa-regular"} fa-heart"></i>
</button>

            <button
              type="button"
              class="botao-avancar"
              data-avancar-id="${obra.id}"
              data-tipo-obra="${obra.tipo}"
              aria-label="Marcar próximo como visto"
              title="Marcar próximo como visto"
            >
              <strong>+1</strong>
            </button>

            <div class="titulo-card">

              <h2>${obterTituloExibicao(obra)}</h2>

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
      if (erro.name === "AbortError") {
        return;
      }

      if (erro.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
        return;
      }

      mostrarMensagem(erro.message, "erro");
    });
}

carregarObras();

window.addEventListener("pageshow", (evento) => {
  if (evento.persisted) {
    carregarObras();
  }
});

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

filtroFavorito.addEventListener("change", () => {
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

  filtroFavorito.value = "";

  carregarObras();
});

document
  .querySelectorAll(
    "#popup-filtros, #popup-organizar, #popup-criar, #popup-editar, #popup-progresso, #popup-confirmar-exclusao, #popup-atualizacoes, #popup-perfil, #popup-escolha-avanco, #popup-escolha-link",
  )
  .forEach((popup) => {
    popup.addEventListener("click", (evento) => {
      if (evento.target === popup) {
        popup.style.display = "none";
      }
    });
  });

let titulosAlternativosEdicao = [];
let avancoPendente = null;

document.addEventListener("click", async (evento) => {
  const botaoAvancar = evento.target.closest("button[data-avancar-id]");

  if (botaoAvancar) {
    const obra = obrasCarregadas.find(
      (item) => String(item.id) === String(botaoAvancar.dataset.avancarId),
    );

    const tipoObra = botaoAvancar.dataset.tipoObra || obra?.tipo;

    if (tipoObra === "ambos") {
      avancoPendente = {
        id: botaoAvancar.dataset.avancarId,
        botao: botaoAvancar,
      };
      document.getElementById("popup-escolha-avanco").style.display = "flex";
      return;
    }

    await avancarProgresso(
      botaoAvancar.dataset.avancarId,
      botaoAvancar,
      tipoObra === "manga" ? "manga" : "anime",
    );
    return;
  }

  const botaoTipoAvanco = evento.target.closest("button[data-avancar-tipo]");

  if (botaoTipoAvanco && avancoPendente) {
    const { id, botao } = avancoPendente;
    const tipo = botaoTipoAvanco.dataset.avancarTipo;
    avancoPendente = null;
    document.getElementById("popup-escolha-avanco").style.display = "none";
    await avancarProgresso(id, botao, tipo);
    return;
  }

  if (evento.target.matches("#fechar-escolha-avanco")) {
    avancoPendente = null;
    document.getElementById("popup-escolha-avanco").style.display = "none";
    return;
  }

  const botaoLimpar = evento.target.closest("button[data-limpar-campo]");

  if (botaoLimpar) {
    const campo = document.getElementById(botaoLimpar.dataset.limparCampo);
    campo.value = "";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.focus();
    return;
  }

  const botaoRemoverLink = evento.target.closest("button[data-remover-link]");

  if (botaoRemoverLink) {
    const lista =
      botaoRemoverLink.dataset.removerLink === "criacao"
        ? linksLeituraCriacao
        : linksLeituraEdicao;
    lista.splice(Number(botaoRemoverLink.dataset.indiceLink), 1);
    renderizarListaLinks(
      lista,
      document.getElementById(
        botaoRemoverLink.dataset.removerLink === "criacao"
          ? "lista-links-leitura-obra"
          : "editar-lista-links-leitura",
      ),
      botaoRemoverLink.dataset.removerLink,
    );
    return;
  }

  const botaoEscolherLink = evento.target.closest("button[data-escolher-link]");

  if (botaoEscolherLink) {
    const obra = obrasCarregadas.find(
      (item) =>
        String(item.id) === String(botaoEscolherLink.dataset.escolherLink),
    );
    linksEscolhaAtual = obterLinksLeitura(obra || {});
    document.getElementById("opcoes-links-leitura").innerHTML =
      linksEscolhaAtual
        .map(
          (link, indice) =>
            `<button type="button" data-abrir-link="${indice}">${link.nome || "Link de leitura"}</button>`,
        )
        .join("");
    document.getElementById("popup-escolha-link").style.display = "flex";
    return;
  }

  if (evento.target.matches("button[data-abrir-link]")) {
    const link = linksEscolhaAtual[Number(evento.target.dataset.abrirLink)];
    if (link) {
      window.open(link.url, "_blank", "noopener,noreferrer");
    }
    document.getElementById("popup-escolha-link").style.display = "none";
    return;
  }

  if (evento.target.matches("#fechar-escolha-link")) {
    document.getElementById("popup-escolha-link").style.display = "none";
    return;
  }

  if (evento.target.matches("button.botao-remover-item")) {
    evento.target.closest(".temporada, .volume")?.remove();
    return;
  }

  if (evento.target.matches("#botao-atualizacoes")) {
    document.getElementById("popup-atualizacoes").style.display = "flex";
    return;
  }

  if (evento.target.matches("#fechar-atualizacoes")) {
    document.getElementById("popup-atualizacoes").style.display = "none";
    return;
  }

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

        titulosAlternativosEdicao = Array.isArray(obra.titulos_alternativos)
          ? [...obra.titulos_alternativos]
          : [];

        const popupEditar = document.getElementById("popup-editar");

        popupEditar.dataset.id = id;

        document.getElementById("editar-titulo").value = obra.title || "";

        document.getElementById("editar-tipo").value = obra.tipo || "";

        document.getElementById("editar-status").value = obra.status || "";

        renderizarTitulosAlternativosEdicao();

        document.getElementById("editar-titulo-exibicao").value =
          obra.titulo_exibicao || "principal";

        document.getElementById("editar-imagem").value = obra.imagem || "";
        document.getElementById("editar-preferencia-imagem").value =
          obra.imagem_preferencia || "url";
        document.getElementById("editar-link-leitura").value = "";
        linksLeituraEdicao = obterLinksLeitura(obra).map((link) => ({
          ...link,
        }));
        renderizarListaLinks(
          linksLeituraEdicao,
          document.getElementById("editar-lista-links-leitura"),
          "edicao",
        );
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
          atualizarCamposDeTipo(
            editarTipo.value,
            editarCamposAnime,
            editarCamposManga,
          );

          if (
            tipoTemAnime(editarTipo.value) &&
            !editarListaTemporadas.querySelector(".temporada")
          ) {
            editarListaTemporadas.innerHTML = `
              <div class="temporada">
                <button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button>
                <label>Temporada<input type="number" min="1" value="1"></label>
                <label>Episódios<input type="number" min="0"></label>
                <label>Começa no episódio<input type="number" min="1" value="1"></label>
              </div>
            `;
          }

          if (
            tipoTemManga(editarTipo.value) &&
            !editarListaVolumes.querySelector(".volume")
          ) {
            editarListaVolumes.innerHTML = `
              <div class="volume">
                <button type="button" class="botao-remover-item" aria-label="Remover volume">×</button>
                <label>Volume<input type="number" min="1" value="1"></label>
                <label>Começa no capítulo<input type="number" min="1" value="1"></label>
                <label>Termina no capítulo<input type="number" min="1"></label>
              </div>
            `;
          }
        });

        editarListaTemporadas.innerHTML = "";

        editarListaVolumes.innerHTML = "";

        if (tipoTemAnime(obra.tipo)) {
          editarCamposAnime.style.display = "block";

          const temporadas = lerConteudoObra(obra.temporadas);

          temporadas.forEach((temporada) => {
            const linha = document.createElement("div");

            linha.classList.add("temporada");
            linha.dataset.vistos = JSON.stringify(temporada.vistos || []);

            linha.innerHTML = `
              <button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button>
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
        }

        if (tipoTemManga(obra.tipo)) {
          editarCamposManga.style.display = "block";

          const volumes = lerConteudoObra(obra.volumes);

          volumes.forEach((volume) => {
            const linha = document.createElement("div");

            linha.classList.add("volume");
            linha.dataset.vistos = JSON.stringify(volume.vistos || []);

            linha.innerHTML = `
              <button type="button" class="botao-remover-item" aria-label="Remover volume">×</button>
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

  const botaoFavorito = evento.target.closest("button[data-favorito-id]");

  if (botaoFavorito) {
    const id = botaoFavorito.dataset.favoritoId;

    const obra = obrasCarregadas.find((item) => String(item.id) === String(id));

    if (!obra) {
      return;
    }

    const novoFavorito = obra.favorito ? 0 : 1;

    botaoFavorito.disabled = true;

    try {
      const resposta = await fetch(`/obras/${id}/favorito`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          favorito: novoFavorito,
        }),
      });

      if (!resposta.ok) {
        const resultado = await resposta.json().catch(() => ({}));

        mostrarMensagem(
          resultado.erro || "Não foi possível atualizar o favorito.",
          "erro",
        );

        return;
      }

      await carregarObras();
    } catch (erro) {
      mostrarMensagem("Não foi possível atualizar o favorito.", "erro");
    } finally {
      botaoFavorito.disabled = false;
    }
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

  if (evento.target.matches("button[data-temporadas-expandidas]")) {
    const botao = evento.target;
    const card = botao.closest(".cards");
    const mostrar = botao.dataset.temporadasExpandidas !== "true";

    card.querySelectorAll("[data-temporada-extra]").forEach((temporada) => {
      temporada.hidden = !mostrar;
    });

    botao.dataset.temporadasExpandidas = String(mostrar);
    botao.textContent = mostrar ? "Mostrar menos" : "Ler mais";
  }

  if (evento.target.matches("button[data-marcar-todos]")) {
    const indice = Number(evento.target.dataset.marcarTodos);
    const tipo = evento.target.dataset.marcarTipo;

    const obra = obraProgressoAtual;
    const itens = obterItensDaObra(obra, tipo);

    const item = itens[indice];

    const inicio = tipo === "manga" ? item.inicio : obterInicioTemporada(item);

    const fim =
      tipo === "manga"
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
    const tipos = [
      ...(tipoTemAnime(obra.tipo) ? ["anime"] : []),
      ...(tipoTemManga(obra.tipo) ? ["manga"] : []),
    ];
    const todosMarcados = tipos.every((tipo) =>
      obterItensDaObra(obra, tipo).every((item) => {
        const inicio =
          tipo === "manga" ? item.inicio : obterInicioTemporada(item);
        const fim = tipo === "manga" ? item.fim : inicio + item.episodios - 1;
        return (
          obterNumerosVistosValidos(item, inicio, fim).size === fim - inicio + 1
        );
      }),
    );

    tipos.forEach((tipo) =>
      obterItensDaObra(obra, tipo).forEach((item) => {
        const inicio =
          tipo === "manga" ? item.inicio : obterInicioTemporada(item);
        const fim = tipo === "manga" ? item.fim : inicio + item.episodios - 1;
        item.vistos = todosMarcados
          ? []
          : Array.from(
              { length: fim - inicio + 1 },
              (_, numero) => inicio + numero,
            );
      }),
    );

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

  const tipo = evento.target.dataset.progressoTipo;
  const itens = obterItensDaObra(obra, tipo);

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
  atualizarCamposDeTipo(tipoObra.value, camposAnime, camposManga);
});

document
  .querySelectorAll("[data-seletor-tipo] [data-tipo-atalho]")
  .forEach((botao) => {
    botao.addEventListener("click", () => {
      const seletor = document.getElementById(
        botao.parentElement.dataset.seletorTipo,
      );
      const valorAtual = seletor.value;
      const tipo = botao.dataset.tipoAtalho;

      seletor.value = tipo;
      seletor.dispatchEvent(new Event("change"));
    });
  });

adicionarTemporada.addEventListener("click", () => {
  const temporadas = listaTemporadas.querySelectorAll(".temporada");

  if (!temporadas.length) {
    listaTemporadas.innerHTML = `<div class="temporada"><button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button><label>Temporada<input type="number" min="1" value="1"></label><label>Episódios<input type="number" min="1"></label><label>Começa no episódio<input type="number" min="1" value="1"></label></div>`;
    return;
  }

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

  const proximoNumero = Number(campos[0].value) + 1;
  const proximoInicio =
    (Number(campos[2].value) || 1) + Number(campos[1].value);

  novaTemporada.innerHTML = `
      <button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button>
      <label>
        Temporada
        <input
          type="number"
          min="1"
          value="${proximoNumero}"
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
        <input type="number" min="1" value="${proximoInicio}">
      </label>
    `;

  listaTemporadas.appendChild(novaTemporada);
});

adicionarVolume.addEventListener("click", () => {
  const volumes = listaVolumes.querySelectorAll(".volume");

  if (!volumes.length) {
    listaVolumes.innerHTML = `<div class="volume"><button type="button" class="botao-remover-item" aria-label="Remover volume">×</button><label>Volume<input type="number" min="1" value="1"></label><label>Começa no capítulo<input type="number" min="1" value="1"></label><label>Termina no capítulo<input type="number" min="1"></label></div>`;
    return;
  }

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
    <button type="button" class="botao-remover-item" aria-label="Remover volume">×</button>
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

function renderizarTitulosAlternativosEdicao() {
  const lista = document.getElementById("editar-lista-titulos-alternativos");

  const select = document.getElementById("editar-titulo-exibicao");

  const selecaoAtual = select.value || "principal";

  lista.innerHTML = "";

  select.innerHTML = `
    <option value="principal">Título principal</option>
  `;

  titulosAlternativosEdicao.forEach((titulo, indice) => {
    const item = document.createElement("div");

    const texto = document.createElement("span");
    texto.textContent = titulo;

    const botaoRemover = document.createElement("button");
    botaoRemover.type = "button";
    botaoRemover.textContent = "×";

    botaoRemover.addEventListener("click", () => {
      titulosAlternativosEdicao.splice(indice, 1);

      renderizarTitulosAlternativosEdicao();
    });

    item.append(texto, botaoRemover);

    lista.appendChild(item);

    const opcao = document.createElement("option");

    opcao.value = titulo;
    opcao.textContent = titulo;

    select.appendChild(opcao);
  });

  select.value = titulosAlternativosEdicao.includes(selecaoAtual)
    ? selecaoAtual
    : "principal";
}

document
  .getElementById("editar-adicionar-titulo-alternativo")
  .addEventListener("click", () => {
    const campo = document.getElementById("editar-titulo-alternativo");
    const titulo = campo.value.trim();

    if (!titulo) {
      mostrarMensagem("Digite um título alternativo.", "aviso");
      return;
    }

    if (titulosAlternativosEdicao.includes(titulo)) {
      mostrarMensagem("Esse título alternativo já foi adicionado.", "aviso");
      return;
    }

    titulosAlternativosEdicao.push(titulo);
    campo.value = "";
    renderizarTitulosAlternativosEdicao();
  });

document
  .getElementById("adicionar-link-leitura-obra")
  .addEventListener("click", () => {
    const nome = document.getElementById("nome-link-leitura-obra");
    const url = document.getElementById("link-leitura-obra");

    if (!url.value.trim() || !url.checkValidity()) {
      mostrarMensagem("Informe uma URL válida para o link de leitura.", "erro");
      url.focus();
      return;
    }

    linksLeituraCriacao.push({
      nome: nome.value.trim(),
      url: url.value.trim(),
    });
    nome.value = "";
    url.value = "";
    renderizarListaLinks(
      linksLeituraCriacao,
      document.getElementById("lista-links-leitura-obra"),
      "criacao",
    );
  });

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

  if (linkLeituraObra.value.trim()) {
    if (!linkLeituraObra.checkValidity()) {
      mostrarMensagem("Informe uma URL válida para o link de leitura.", "erro");
      linkLeituraObra.focus();
      botaoCriar.disabled = false;
      return;
    }

    linksLeituraCriacao.push({
      nome: document.getElementById("nome-link-leitura-obra").value.trim(),
      url: linkLeituraObra.value.trim(),
    });
    document.getElementById("nome-link-leitura-obra").value = "";
    linkLeituraObra.value = "";
  }

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

  if (tipoTemAnime(tipoObra.value)) {
    const temporadas = listaTemporadas.querySelectorAll(".temporada");

    if (!temporadas.length) {
      mostrarMensagem(
        "Adicione pelo menos uma temporada para o anime.",
        "erro",
      );
      botaoCriar.disabled = false;
      return;
    }

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

  if (tipoTemManga(tipoObra.value)) {
    const volumes = listaVolumes.querySelectorAll(".volume");

    if (!volumes.length) {
      mostrarMensagem("Adicione pelo menos um volume para o mangá.", "erro");
      botaoCriar.disabled = false;
      return;
    }

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

  if (tipoTemAnime(tipoObra.value)) {
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

  if (tipoTemManga(tipoObra.value)) {
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

        link_leitura:
          linksLeituraCriacao.length === 1 ? linksLeituraCriacao[0].url : null,
        link_leituras: linksLeituraCriacao,

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

    mostrarMensagem("Obra criada com sucesso!", "sucesso");
    popupCriar.style.display = "none";

    renderizarTitulosAlternativos();

    tituloObra.value = "";

    tipoObra.value = "";

    statusObra.value = "";

    imagemObra.value = "";

    arquivoImagemObra.value = "";

    document.getElementById("preferencia-imagem-obra").value = "url";

    linkLeituraObra.value = "";
    linksLeituraCriacao = [];
    renderizarListaLinks(
      linksLeituraCriacao,
      document.getElementById("lista-links-leitura-obra"),
      "criacao",
    );

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

    try {
      await carregarObras();
    } catch (erro) {
      mostrarMensagem(
        "A obra foi criada, mas não foi possível atualizar a lista.",
        "aviso",
      );
    }
  } catch (erro) {
    mostrarMensagem(erro.message || "Não foi possível criar a obra.", "erro");
  } finally {
    botaoCriar.disabled = false;
  }
});

const imagemObra = document.getElementById("imagem-obra");

const previewImagem = document.getElementById("preview-imagem");

const imagemEdicao = document.getElementById("editar-imagem");

const preferenciaImagemEdicao = document.getElementById(
  "editar-preferencia-imagem",
);

imagemObra.addEventListener("input", () => {
  previewImagem.hidden = !imagemObra.value;

  previewImagem.src = imagemObra.value;
});

previewImagem.addEventListener("error", () => {
  previewImagem.hidden = true;
});

imagemEdicao.addEventListener("input", () => {
  if (imagemEdicao.value.trim()) {
    preferenciaImagemEdicao.value = "url";
  }
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
        <button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button>

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

  const proximoNumero = Number(campos[0].value) + 1;
  const proximoInicio =
    (Number(campos[2].value) || 1) + Number(campos[1].value);

  novaTemporada.innerHTML = `
      <button type="button" class="botao-remover-item" aria-label="Remover temporada">×</button>
      <label>
        Temporada
        <input
          type="number"
          min="1"
          value="${proximoNumero}"
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
        <input type="number" min="1" value="${proximoInicio}">
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
      <button type="button" class="botao-remover-item" aria-label="Remover volume">×</button>
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
  <button type="button" class="botao-remover-item" aria-label="Remover volume">×</button>
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

document
  .getElementById("editar-adicionar-link-leitura")
  .addEventListener("click", () => {
    const nome = document.getElementById("editar-nome-link-leitura");
    const url = document.getElementById("editar-link-leitura");

    if (!url.value.trim() || !url.checkValidity()) {
      mostrarMensagem("Informe uma URL válida para o link de leitura.", "erro");
      url.focus();
      return;
    }

    linksLeituraEdicao.push({ nome: nome.value.trim(), url: url.value.trim() });
    nome.value = "";
    url.value = "";
    renderizarListaLinks(
      linksLeituraEdicao,
      document.getElementById("editar-lista-links-leitura"),
      "edicao",
    );
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

  if (linkLeitura.value.trim()) {
    if (!linkLeitura.checkValidity()) {
      mostrarMensagem("Informe uma URL válida para o link de leitura.", "erro");
      linkLeitura.focus();
      return;
    }

    linksLeituraEdicao.push({
      nome: document.getElementById("editar-nome-link-leitura").value.trim(),
      url: linkLeitura.value.trim(),
    });
    document.getElementById("editar-nome-link-leitura").value = "";
    linkLeitura.value = "";
  }

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

      link_leitura:
        linksLeituraEdicao.length === 1 ? linksLeituraEdicao[0].url : null,
      link_leituras: linksLeituraEdicao,

      temporadas: tipoTemAnime(tipo.value) ? temporadas : null,

      volumes: tipoTemManga(tipo.value) ? volumes : null,

      titulos_alternativos: titulosAlternativosEdicao,

      titulo_exibicao: document.getElementById("editar-titulo-exibicao").value,
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

const botaoOrganizar = document.getElementById("botao-organizar");

botaoOrganizar.addEventListener("click", () => {
  const popupOrganizar = document.getElementById("popup-organizar");
  carregarListaOrganizar();
  popupOrganizar.style.display = "flex";
});

document
  .getElementById("fechar-popup-organizar")
  .addEventListener("click", () => {
    document.getElementById("popup-organizar").style.display = "none";
  });

function carregarListaOrganizar() {
  const lista = document.getElementById("lista-organizar");

  lista.innerHTML = "";

  obrasCarregadas.forEach((obra) => {
    const item = document.createElement("div");

    item.className = "item-organizar";
    item.dataset.id = obra.id;
    item.draggable = true;

    item.addEventListener("dragstart", () => {
      item.classList.add("arrastando");
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("arrastando");
      atualizarBotoesOrganizar();
    });

    const titulo = obterTituloExibicao(obra);
    const imagem = obterImagemPreferida(obra).principal;

    item.innerHTML = `
      <span class="organizar-alca" aria-hidden="true">☷</span>
      <img src="${imagem}" referrerpolicy="no-referrer" alt="">
      <span class="organizar-titulo">${titulo}</span>
      <div class="organizar-acoes">
        <button type="button" data-mover="cima" aria-label="Subir ${titulo}" title="Subir">↑</button>
        <button type="button" data-mover="baixo" aria-label="Descer ${titulo}" title="Descer">↓</button>
      </div>
    `;

    item.querySelector('[data-mover="cima"]').addEventListener("click", () => {
      const itemAnterior = item.previousElementSibling;

      if (itemAnterior) {
        lista.insertBefore(item, itemAnterior);
        atualizarBotoesOrganizar();
      }
    });

    item.querySelector('[data-mover="baixo"]').addEventListener("click", () => {
      const itemSeguinte = item.nextElementSibling;

      if (itemSeguinte) {
        lista.insertBefore(itemSeguinte, item);
        atualizarBotoesOrganizar();
      }
    });

    lista.appendChild(item);
  });

  if (!lista.dataset.dragConfigurado) {
    lista.addEventListener("dragover", (evento) => {
      evento.preventDefault();

      const itemArrastado = lista.querySelector(".arrastando");

      if (!itemArrastado) {
        return;
      }

      const itens = [
        ...lista.querySelectorAll(".item-organizar:not(.arrastando)"),
      ];

      const itemDepois = itens.find((item) => {
        const caixa = item.getBoundingClientRect();

        return evento.clientY < caixa.top + caixa.height / 2;
      });

      if (itemDepois) {
        lista.insertBefore(itemArrastado, itemDepois);
      } else {
        lista.appendChild(itemArrastado);
      }

      atualizarBotoesOrganizar();
    });

    lista.dataset.dragConfigurado = "true";
  }

  atualizarBotoesOrganizar();
}

function atualizarBotoesOrganizar() {
  const itens = [
    ...document.querySelectorAll("#lista-organizar .item-organizar"),
  ];

  itens.forEach((item, indice) => {
    item.querySelector('[data-mover="cima"]').disabled = indice === 0;
    item.querySelector('[data-mover="baixo"]').disabled = indice === itens.length - 1;
  });
}

async function salvarOrdemObras() {
  const itens = document.querySelectorAll(
    "#lista-organizar .item-organizar"
  );

  const obras = Array.from(itens).map((item) => ({
    id: Number(item.dataset.id),
  }));

  const resposta = await fetch("/obras/ordem", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({
      obras,
    }),
  });

  const resultado = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    mostrarMensagem(
      resultado.erro || "Não foi possível salvar a ordem.",
      "erro",
    );
    return;
  }

  document.getElementById("popup-organizar").style.display = "none";

  await carregarObras();

  mostrarMensagem("Ordem salva!", "sucesso");
}

document
  .getElementById("salvar-ordem")
  .addEventListener("click", salvarOrdemObras);

document.getElementById("botao-sair").addEventListener("click", () => {
  localStorage.removeItem("token");

  window.location.href = "/login.html";
});

const nomePerfil = localStorage.getItem("nomeUsuario") || "usuário";

document.getElementById("nome-perfil").textContent = nomePerfil;
document.getElementById("nome-perfil-popup").textContent = nomePerfil;

document.getElementById("botao-perfil").addEventListener("click", () => {
  document.getElementById("popup-perfil").style.display = "flex";
});

document.getElementById("fechar-perfil").addEventListener("click", () => {
  document.getElementById("popup-perfil").style.display = "none";
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
