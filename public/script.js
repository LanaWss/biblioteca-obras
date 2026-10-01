let obraProgressoAtual = null;
let obraNotificacaoAtual = null;
let obrasCarregadas = [];
let carregamentoObrasAtual = 0;
let controladorCarregamentoObras = null;
let linksLeituraCriacao = [];
let linksLeituraEdicao = [];
let linksEscolhaAtual = [];

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

function base64ParaUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const dados = window.atob(base64);
  const array = new Uint8Array(dados.length);

  for (let i = 0; i < dados.length; i++) {
    array[i] = dados.charCodeAt(i);
  }

  return array;
}

async function inscreverPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push não é suportado neste navegador.");
  }

  const permissao = await Notification.requestPermission();

  if (permissao !== "granted") {
    throw new Error("Permissão para notificações não concedida.");
  }

  const registro = await navigator.serviceWorker.ready;

  let inscricao = await registro.pushManager.getSubscription();

  if (!inscricao) {
    const chavePublica = "BHu5tqRESey0Uv5_I0KCKH3PZ-5J8rgWx1AsdoKsPpQBoV_UGcrjsZoE0dTBg8LQZDaGoP5PIZROBM4dXzUTvS0";

    inscricao = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaUint8Array(chavePublica),
    });
  }

  const resposta = await fetch("/notificacoes/inscricao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({
      inscricao: inscricao.toJSON(),
    }),
  });

  const resultado = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(
      resultado.erro || "Não foi possível salvar a inscrição Push.",
    );
  }

  return inscricao;
}

async function testarNotificacao() {
  const registro = await navigator.serviceWorker.ready;

  registro.active.postMessage({
    tipo: "teste-notificacao",
  });
}

async function abrirConfiguracaoNotificacao(id) {
  const obra = obrasCarregadas.find((item) => String(item.id) === String(id));

  if (!obra) {
    return;
  }

  obraNotificacaoAtual = obra;

  const resposta = await fetch(`/obras/${id}/notificacoes`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  const configuracoes = resposta.ok ? await resposta.json() : {};

  preencherConfiguracaoNotificacao("anime", configuracoes.anime);
  preencherConfiguracaoNotificacao("manga", configuracoes.manga);

  document.getElementById("titulo-notificacao-configuracao").textContent =
    obterTituloExibicao(obra);

  document.getElementById("configuracao-anime-notificacao").style.display =
    tipoTemAnime(obra.tipo) ? "block" : "none";

  document.getElementById("configuracao-manga-notificacao").style.display =
    tipoTemManga(obra.tipo) ? "block" : "none";

  document.getElementById("popup-configurar-notificacao").style.display =
    "flex";
}

function preencherConfiguracaoNotificacao(tipo, configuracao) {
  const ativar = document.getElementById(`ativar-notificacao-${tipo}`);

  const semanal = document.getElementById(`notificacao-${tipo}-semanal`);

  const mensal = document.getElementById(`notificacao-${tipo}-mensal`);

  const diaMes = document.getElementById(`dia-notificacao-${tipo}`);

  const hora = document.getElementById(`hora-notificacao-${tipo}`);

  ativar.checked = !!configuracao;

  semanal.checked = !!configuracao?.diasSemana?.length;

  mensal.checked =
    configuracao?.diaMes !== null && configuracao?.diaMes !== undefined;

  diaMes.value = configuracao?.diaMes || "";

  hora.value = configuracao?.hora || "";

  document
    .querySelectorAll(`#dias-semana-${tipo} input[type="checkbox"]`)
    .forEach((checkbox) => {
      checkbox.checked = (configuracao?.diasSemana || []).includes(
        Number(checkbox.value),
      );
    });

  atualizarFrequenciaNotificacao(tipo);
}

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

function atualizarPopupConfiguracaoNotificacao(obra) {
  const camposAnime = document.getElementById("configuracao-anime-notificacao");

  const camposManga = document.getElementById("configuracao-manga-notificacao");

  camposAnime.style.display = tipoTemAnime(obra.tipo) ? "block" : "none";

  camposManga.style.display = tipoTemManga(obra.tipo) ? "block" : "none";
}

function atualizarFrequenciaNotificacao(tipo) {
  const semanal = document.getElementById(`notificacao-${tipo}-semanal`);

  const mensal = document.getElementById(`notificacao-${tipo}-mensal`);

  const diasSemana = document.getElementById(`dias-semana-${tipo}`);

  const diaMes = document.getElementById(`dia-mes-${tipo}`);

  diasSemana.hidden = !semanal.checked;
  diaMes.hidden = !mensal.checked;
}

["anime", "manga"].forEach((tipo) => {
  document
    .getElementById(`notificacao-${tipo}-semanal`)
    .addEventListener("change", () => {
      atualizarFrequenciaNotificacao(tipo);
    });

  document
    .getElementById(`notificacao-${tipo}-mensal`)
    .addEventListener("change", () => {
      atualizarFrequenciaNotificacao(tipo);
    });
});

function obterConfiguracaoNotificacao(tipo) {
  const ativo = document.getElementById(`ativar-notificacao-${tipo}`).checked;

  const semanal = document.getElementById(
    `notificacao-${tipo}-semanal`,
  ).checked;

  const mensal = document.getElementById(`notificacao-${tipo}-mensal`).checked;

  const diasSemana = semanal
    ? [
        ...document.querySelectorAll(
          `#dias-semana-${tipo} input[type="checkbox"]:checked`,
        ),
      ].map((checkbox) => Number(checkbox.value))
    : [];

  const campoDiaMes = document.getElementById(`dia-notificacao-${tipo}`);

  const campoHora = document.getElementById(`hora-notificacao-${tipo}`);

  const diaMes = mensal && campoDiaMes.value ? Number(campoDiaMes.value) : null;

  const hora = campoHora.value || null;

  return {
    ativo,
    diasSemana,
    diaMes,
    hora,
  };
}

document
  .getElementById("salvar-configuracao-notificacao")
  .addEventListener("click", async () => {
    if (!obraNotificacaoAtual) {
      return;
    }

    const erro = document.getElementById("erro-configuracao-notificacao");

    erro.textContent = "";

    const configuracoes = {};

    if (tipoTemAnime(obraNotificacaoAtual.tipo)) {
      configuracoes.anime = obterConfiguracaoNotificacao("anime");
    }

    if (tipoTemManga(obraNotificacaoAtual.tipo)) {
      configuracoes.manga = obterConfiguracaoNotificacao("manga");
    }

    const tiposAtivos = Object.values(configuracoes).filter(
      (configuracao) => configuracao.ativo,
    );

    if (!tiposAtivos.length) {
      erro.textContent = "Ative pelo menos um tipo de notificação.";

      return;
    }

    if (!("Notification" in window)) {
      erro.textContent = "Este navegador não suporta notificações.";

      return;
    }

    if (Notification.permission !== "granted") {
      const permissao = await Notification.requestPermission();

      if (permissao !== "granted") {
        erro.textContent = "Permissão para notificações não concedida.";

        return;
      }
    }

    for (const [tipo, configuracao] of Object.entries(configuracoes)) {
      if (!configuracao.ativo) {
        continue;
      }

      if (!configuracao.diasSemana.length && configuracao.diaMes === null) {
        erro.textContent = `Configure a frequência de ${
          tipo === "anime" ? "Anime" : "Mangá"
        }.`;

        return;
      }

      if (!configuracao.hora) {
        erro.textContent = `Informe o horário de ${
          tipo === "anime" ? "Anime" : "Mangá"
        }.`;

        return;
      }
    }

    await inscreverPush();

    const resposta = await fetch(
      `/obras/${obraNotificacaoAtual.id}/notificacoes`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          configuracoes,
        }),
      },
    );

    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      erro.textContent =
        resultado.erro || "Não foi possível salvar a configuração.";

      return;
    }

    document.getElementById("popup-configurar-notificacao").style.display =
      "none";

    await carregarObras();

    mostrarMensagem("Lembrete salvo!", "sucesso");
  });

document
  .getElementById("dia-notificacao-anime")
  .addEventListener("input", (evento) => {
    if (Number(evento.target.value) > 31) {
      evento.target.value = 31;
    }

    if (Number(evento.target.value) < 1) {
      evento.target.value = 1;
    }
  });

document
  .getElementById("dia-notificacao-manga")
  .addEventListener("input", (evento) => {
    if (Number(evento.target.value) > 31) {
      evento.target.value = 31;
    }

    if (Number(evento.target.value) < 1) {
      evento.target.value = 1;
    }
  });

function obterLinksLeitura(obra) {
  let links = lerConteudoObra(obra.link_leituras);

  if (!links.length && obra.link_leitura) {
    links = [
      {
        nome: "",
        url: String(obra.link_leitura).trim(),
      },
    ];
  }

  return links.filter((link) => link && link.url);
}

function renderizarListaLinks(links, lista, prefixo) {
  lista.innerHTML = links
    .map(
      (link, indice) => `
    <div class="item-link-leitura">
      <span>${link.nome || "Link de leitura"}</span>

      <button
        type="button"
        data-remover-link="${prefixo}"
        data-indice-link="${indice}"
        aria-label="Remover link"
      >
        ×
      </button>
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
    : {
        vistos: 0,
        total: 0,
      };

  const progressoManga = tipoTemManga(obra.tipo)
    ? calcularProgressoPorTipo(lerConteudoObra(obra.volumes), "manga")
    : {
        vistos: 0,
        total: 0,
      };

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
        <span>
          ${progresso.vistos}/${progresso.total}
        </span>
      </div>

      <div class="barra-progresso">

        <div
          class="barra-progresso-preenchida"
          style="width: ${percentual}%"
        ></div>

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

      fallback:
        imagemPreferida === imagemLocal ? imagens.url || "" : imagemPreferida,
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
let botaoListaItensAberta = null;
let obrasPublicasAtual = [];

function fecharListaItens() {
  if (botaoListaItensAberta) {
    botaoListaItensAberta.dataset.temporadasExpandidas = "false";
    botaoListaItensAberta.dataset.volumesExpandidos = "false";
    botaoListaItensAberta.textContent = "Ler mais";
    botaoListaItensAberta = null;
  }

  document.getElementById("popup-lista-itens").style.display = "none";
}

function abrirListaItens(botao, tipo) {
  const card = botao.closest(".cards");
  const seletor = tipo === "manga" ? ".lista-volumes-card" : ".lista-temporadas-card";
  const lista = card.querySelector(seletor);

  if (!lista) {
    return;
  }

  const itens = [...lista.children]
    .map((item) => {
      const copia = item.cloneNode(true);
      copia.hidden = false;
      copia.removeAttribute("data-volume-extra");
      copia.removeAttribute("data-temporada-extra");
      return copia.outerHTML;
    })
    .join("");

  document.getElementById("titulo-lista-itens").textContent =
    tipo === "manga" ? "Volumes" : "Temporadas";
  document.getElementById("conteudo-lista-itens").innerHTML = itens;
  document.getElementById("popup-lista-itens").style.display = "flex";

  botao.dataset[`${tipo === "manga" ? "volumes" : "temporadas"}Expandidas`] = "true";
  botao.textContent = "Ler menos";
  botaoListaItensAberta = botao;
}

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
      ? [
          {
            chave: "anime",
            itens: obra.temporadas,
          },
        ]
      : []),

    ...(tipoTemManga(obra.tipo)
      ? [
          {
            chave: "manga",
            itens: obra.volumes,
          },
        ]
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

          const itensHtml = Array.from(
            {
              length: totalItens,
            },
            (_, numero) => {
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
            },
          ).join("");

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

    return {
      proximo: 1,
      criouNovoItem: true,
    };
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

  return {
    proximo,
    criouNovoItem: true,
  };
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

      avancos.push({
        tipo,
        ...avanco,
      });
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
          `${tipo === "anime" ? "Episódio" : "Capítulo"} ${proximo}${
            criouNovoItem ? " criado" : ""
          }`,
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

function carregarObras(atualizarDados = true) {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";

    return;
  }

  const numeroCarregamento = atualizarDados
    ? ++carregamentoObrasAtual
    : carregamentoObrasAtual;

  if (atualizarDados) {
    controladorCarregamentoObras?.abort();

    controladorCarregamentoObras = new AbortController();
  }

  const requisicao = atualizarDados
    ? fetch("/obras", {
        cache: "no-store",

        signal: controladorCarregamentoObras.signal,

        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    : Promise.resolve({
        ok: true,
        json: async () => obrasCarregadas,
      });

  return requisicao
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
            <h3>
              <i class="fa-solid fa-list"></i>
              Temporadas
            </h3>

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
                ? `<button
                    type="button"
                    class="botao-mais-itens"
                    data-temporadas-expandidas="false"
                  >
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
            <h3>
              <i class="fa-solid fa-book"></i>
              Volumes
            </h3>

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
                ? `<button
                    type="button"
                    class="botao-mais-itens"
                    data-volumes-expandidos="false"
                  >
                    Ler mais
                  </button>`
                : ""
            }
          `;
        }

        const imagens = obterImagemPreferida(obra);

        const linksLeitura = obterLinksLeitura(obra);

        const imagem = imagens.principal
          ? `<img
                    class="imagem-obra"
                    src="${imagens.principal}"
                    referrerpolicy="no-referrer"
                    alt="${obterTituloExibicao(obra)}"
                  >`
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
                <i class="fa-solid fa-book-open"></i>
                Ler
              </a>
            `
            : linksLeitura.length > 1
              ? `
              <button
                type="button"
                class="botao-ler"
                data-escolher-link="${obra.id}"
              >
                <i class="fa-solid fa-book-open"></i>
                Ler
              </button>
            `
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
              aria-label="${
                obra.favorito
                  ? "Remover dos favoritos"
                  : "Adicionar aos favoritos"
              }"
              title="${
                obra.favorito
                  ? "Remover dos favoritos"
                  : "Adicionar aos favoritos"
              }"
            >
              <i
                class="${obra.favorito ? "fa-solid" : "fa-regular"} fa-heart"
              ></i>
            </button>

            <button
  type="button"
  class="botao-avancar"
  data-avancar-id="${obra.id}"
  data-tipo-obra="${obra.tipo}"
  aria-label="${
    obra.status === "completa" ? "Obra completa" : "Marcar próximo como visto"
  }"
  title="${
    obra.status === "completa" ? "Obra completa" : "Marcar próximo como visto"
  }"
  ${obra.status === "completa" ? "disabled" : ""}
>
  <strong>+1</strong>
</button>

            <div class="titulo-card">

              <h2>
                ${obterTituloExibicao(obra)}
              </h2>

              <span
                class="status-card status-${obra.status}"
              >
                ${statusExibido}
              </span>

            </div>

            ${imagem}

            <button
              type="button"
              class="botao-visto"
              data-visto-id="${obra.id}"
              title="Marcar como visto"
              aria-label="Marcar como visto"
            >
              <i class="fa-solid fa-check"></i>
            </button>

            <button
             type="button"
             class="botao-notificar"
             data-notificar-id="${obra.id}"
             title="Notificar"
             aria-label="Notificar"
            >
              <i class="${obra.notificacao_ativa ? "fa-solid" : "fa-regular"} fa-bell"></i>
            </button>

            <p
              class="aviso-imagem-card"
              hidden
              role="status"
            ></p>

            <div class="progresso-card">

              <div class="progresso-texto">
                <span>
                  Progresso
                  ${progresso.vistos}/${progresso.total}
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

              <button
                data-id="${obra.id}"
              >
                <i class="fa-solid fa-pen"></i>
                Editar
              </button>

              <button
                data-delete-id="${obra.id}"
              >
                <i class="fa-solid fa-trash"></i>
                Apagar
              </button>

              <button
                data-progress-id="${obra.id}"
              >
                <i class="fa-solid fa-chart-simple"></i>
                Progresso
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

let temporizadorBusca;

window.addEventListener("pageshow", () => {
  clearTimeout(temporizadorBusca);
  buscarObras.value = "";
  carregarObras();
});

buscarObras.addEventListener("input", () => {
  clearTimeout(temporizadorBusca);

  temporizadorBusca = setTimeout(() => {
    carregarObras(false);
  }, 120);
});

filtroTipo.addEventListener("change", () => {
  carregarObras(false);
});

filtroStatus.addEventListener("change", () => {
  carregarObras(false);
});

filtroProgresso.addEventListener("change", () => {
  carregarObras(false);
});

filtroFavorito.addEventListener("change", () => {
  carregarObras(false);
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

  carregarObras(false);
});

document
  .querySelectorAll(
    "#popup-filtros,#popup-configurar-notificacao, #popup-organizar, #popup-criar, #popup-editar, #popup-progresso, #popup-confirmar-exclusao, #popup-atualizacoes, #popup-perfil, #popup-amigos, #popup-biblioteca-amigo, #popup-lista-itens, #popup-detalhe-obra-publica, #popup-escolha-avanco, #popup-escolha-link, #popup-lista-notificacoes, #popup-escolha-visto",
  )
  .forEach((popup) => {
    popup.addEventListener("click", (evento) => {
      if (evento.target === popup) {
        if (popup.id === "popup-lista-itens") {
          fecharListaItens();
        } else {
          popup.style.display = "none";
        }
      }
    });
  });

let titulosAlternativosEdicao = [];

let avancoPendente = null;

let pendenciasVistoPendente = [];

let botaoVistoPendente = null;

function obterPendenciasVisto(obra) {
  const pendencias = [];

  if (tipoTemAnime(obra.tipo)) {
    const temporadas = lerConteudoObra(obra.temporadas);

    temporadas.forEach((temporada, indice) => {
      const inicio = obterInicioTemporada(temporada);

      const fim = inicio + Number(temporada.episodios || 0) - 1;

      const vistos = obterNumerosVistosValidos(temporada, inicio, fim);

      const total = fim - inicio + 1;

      if (total <= 0 || vistos.size >= total) {
        return;
      }

      let proximo = null;

      for (let numero = inicio; numero <= fim; numero++) {
        if (!vistos.has(numero)) {
          proximo = numero;
          break;
        }
      }

      if (proximo !== null) {
        pendencias.push({
          tipo: "anime",
          indice,
          nome: `Temporada ${temporada.numero}`,
          proximo,
        });
      }
    });
  }

  if (tipoTemManga(obra.tipo)) {
    const volumes = lerConteudoObra(obra.volumes);

    volumes.forEach((volume, indice) => {
      const inicio = Number(volume.inicio);

      const fim = Number(volume.fim);

      const vistos = obterNumerosVistosValidos(volume, inicio, fim);

      const total = fim - inicio + 1;

      if (total <= 0 || vistos.size >= total) {
        return;
      }

      let proximo = null;

      for (let numero = inicio; numero <= fim; numero++) {
        if (!vistos.has(numero)) {
          proximo = numero;
          break;
        }
      }

      if (proximo !== null) {
        pendencias.push({
          tipo: "manga",
          indice,
          nome: `Volume ${volume.numero}`,
          proximo,
        });
      }
    });
  }

  return pendencias;
}

async function marcarProximoVisto(id, botao, tipo, indice) {
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
  } catch (erro) {
    mostrarMensagem("Não foi possível carregar o progresso.", "erro");

    return;
  }

  const chave = tipo === "anime" ? "temporadas" : "volumes";

  const itens = lerConteudoObra(obra[chave]);

  const item = itens[indice];

  if (!item) {
    return;
  }

  const inicio =
    tipo === "anime" ? obterInicioTemporada(item) : Number(item.inicio);

  const fim =
    tipo === "anime"
      ? inicio + Number(item.episodios || 0) - 1
      : Number(item.fim);

  const vistos = obterNumerosVistosValidos(item, inicio, fim);

  let proximo = null;

  for (let numero = inicio; numero <= fim; numero++) {
    if (!vistos.has(numero)) {
      proximo = numero;
      break;
    }
  }

  if (proximo === null) {
    return;
  }

  vistos.add(proximo);

  item.vistos = [...vistos].sort((a, b) => a - b);

  botao.disabled = true;

  try {
    const resposta = await fetch(`/obras/${id}`, {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },

      body: JSON.stringify({
        [chave]: itens,
      }),
    });

    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarMensagem(
        resultado.erro || "Não foi possível marcar como visto.",
        "erro",
      );

      return;
    }

    await carregarObras();

    mostrarMensagem(
      `${
        tipo === "anime" ? "Episódio" : "Capítulo"
      } ${proximo} marcado como visto.`,
      "sucesso",
    );
  } catch (erro) {
    mostrarMensagem("Não foi possível marcar como visto.", "erro");
  } finally {
    botao.disabled = false;
  }
}

document.addEventListener("click", async (evento) => {
  const botaoVisto = evento.target.closest("button[data-visto-id]");

  if (botaoVisto) {
    const id = botaoVisto.dataset.vistoId;

    const obra = obrasCarregadas.find((item) => String(item.id) === String(id));

    if (!obra) {
      return;
    }

    const pendencias = obterPendenciasVisto(obra);

    if (!pendencias.length) {
      mostrarMensagem("Não há episódios ou capítulos pendentes.", "aviso");

      return;
    }

    if (pendencias.length === 1) {
      const pendencia = pendencias[0];

      await marcarProximoVisto(
        id,
        botaoVisto,
        pendencia.tipo,
        pendencia.indice,
      );

      return;
    }

    pendenciasVistoPendente = pendencias;

    botaoVistoPendente = botaoVisto;

    const popup = document.getElementById("popup-escolha-visto");

    const opcoes = document.getElementById("opcoes-visto");

    opcoes.innerHTML = pendencias
      .map(
        (pendencia, indice) => `
              <button
                type="button"
                data-escolher-visto="${indice}"
              >
                ${pendencia.nome}
                —
                ${pendencia.tipo === "anime" ? "Episódio" : "Capítulo"}
                ${pendencia.proximo}
              </button>
            `,
      )
      .join("");

    popup.style.display = "flex";

    return;
  }

  const botaoEscolherVisto = evento.target.closest(
    "button[data-escolher-visto]",
  );

  if (botaoEscolherVisto && botaoVistoPendente) {
    const indice = Number(botaoEscolherVisto.dataset.escolherVisto);

    const pendencia = pendenciasVistoPendente[indice];

    const botao = botaoVistoPendente;

    pendenciasVistoPendente = [];

    botaoVistoPendente = null;

    document.getElementById("popup-escolha-visto").style.display = "none";

    if (!pendencia) {
      return;
    }

    await marcarProximoVisto(
      botao.dataset.vistoId,
      botao,
      pendencia.tipo,
      pendencia.indice,
    );

    return;
  }

  if (evento.target.matches("#fechar-escolha-visto")) {
    pendenciasVistoPendente = [];

    botaoVistoPendente = null;

    document.getElementById("popup-escolha-visto").style.display = "none";

    return;
  }

  const botaoAvancar = evento.target.closest("button[data-avancar-id]");

  if (botaoAvancar) {
    const obra = obrasCarregadas.find(
      (item) => String(item.id) === String(botaoAvancar.dataset.avancarId),
    );

    const tipoObra = botaoAvancar.dataset.tipoObra || obra?.tipo;

    if (obra?.status === "completa") {
      mostrarMensagem("Esta obra está completa.", "aviso");
      return;
    }

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

    campo.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );

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
            `
              <button
                type="button"
                data-abrir-link="${indice}"
              >
                ${link.nome || "Link de leitura"}
              </button>
              `,
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
                      <button
                        type="button"
                        class="botao-remover-item"
                        aria-label="Remover temporada"
                      >
                        ×
                      </button>

                      <label>
                        Temporada
                        <input
                          type="number"
                          min="1"
                          value="1"
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
                        <input
                          type="number"
                          min="1"
                          value="1"
                        >
                      </label>
                    </div>
                  `;
          }

          if (
            tipoTemManga(editarTipo.value) &&
            !editarListaVolumes.querySelector(".volume")
          ) {
            editarListaVolumes.innerHTML = `
                    <div class="volume">
                      <button
                        type="button"
                        class="botao-remover-item"
                        aria-label="Remover volume"
                      >
                        ×
                      </button>

                      <label>
                        Volume
                        <input
                          type="number"
                          min="1"
                          value="1"
                        >
                      </label>

                      <label>
                        Começa no capítulo
                        <input
                          type="number"
                          min="1"
                          value="1"
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
                    <button
                      type="button"
                      class="botao-remover-item"
                      aria-label="Remover temporada"
                    >
                      ×
                    </button>

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
                      <input
                        type="number"
                        min="1"
                        value="${obterInicioTemporada(temporada)}"
                      >
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
                    <button
                      type="button"
                      class="botao-remover-item"
                      aria-label="Remover volume"
                    >
                      ×
                    </button>

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
});

function obterTextoDiasSemana(dias) {
  const nomes = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];

  return dias
    .map((dia) => nomes[Number(dia)])
    .filter(Boolean)
    .join(", ");
}

async function abrirListaNotificacoes() {
  const lista = document.getElementById("lista-notificacoes");

  lista.innerHTML = "<p>Carregando...</p>";

  document.getElementById("popup-lista-notificacoes").style.display = "flex";

  try {
    const resposta = await fetch("/notificacoes", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    const resultado = await resposta.json().catch(() => []);

    if (!resposta.ok) {
      throw new Error(
        resultado.erro || "Não foi possível carregar as notificações.",
      );
    }

    if (!resultado.length) {
      lista.innerHTML = `
        <p>
          Nenhum lembrete configurado.
        </p>
      `;

      return;
    }

    lista.innerHTML = resultado
      .map((notificacao) => {
        const nomeObra =
          notificacao.tituloExibicao &&
          notificacao.tituloExibicao !== "principal"
            ? notificacao.tituloExibicao
            : notificacao.title;

        const tipo = notificacao.tipo === "anime" ? "Anime" : "Mangá";

        const partes = [];

        if (notificacao.diasSemana.length) {
          partes.push(
            `Semanalmente: ${obterTextoDiasSemana(notificacao.diasSemana)}`,
          );
        }

        if (notificacao.diaMes !== null) {
          partes.push(`Mensalmente: dia ${notificacao.diaMes}`);
        }

        if (notificacao.hora) {
          partes.push(`Horário: ${notificacao.hora}`);
        }

        return `
          <div class="item-notificacao">

            <h3>${nomeObra}</h3>

            <p>
              <strong>Tipo:</strong> ${tipo}
            </p>

            ${partes.map((parte) => `<p>${parte}</p>`).join("")}

            <button
              type="button"
              data-editar-notificacao="${notificacao.obraId}"
            >
              Configurar
            </button>

          </div>
        `;
      })
      .join("");
  } catch (erro) {
    lista.innerHTML = `
      <p>
        ${erro.message}
      </p>
    `;
  }
}

document
  .getElementById("botao-notificacao")
  .addEventListener("click", abrirListaNotificacoes);

document
  .getElementById("fechar-lista-notificacoes")
  .addEventListener("click", () => {
    document.getElementById("popup-lista-notificacoes").style.display = "none";
  });

document
  .getElementById("fechar-configurar-notificacao")
  .addEventListener("click", () => {
    document.getElementById("popup-configurar-notificacao").style.display =
      "none";

    obraNotificacaoAtual = null;
  });

document.addEventListener("click", async (evento) => {
  const botaoEditarNotificacao = evento.target.closest(
    "button[data-editar-notificacao]",
  );

  if (botaoEditarNotificacao) {
    const id = botaoEditarNotificacao.dataset.editarNotificacao;

    document.getElementById("popup-lista-notificacoes").style.display = "none";

    await abrirConfiguracaoNotificacao(id);

    return;
  }

  const botaoNotificar = evento.target.closest("button[data-notificar-id]");

  if (botaoNotificar) {
    const id = botaoNotificar.dataset.notificarId;

    const obra = obrasCarregadas.find((item) => String(item.id) === String(id));

    if (!obra) {
      return;
    }

    // Se já existe lembrete, clicar novamente desativa.
    if (obra.notificacao_ativa) {
      try {
        const resposta = await fetch(`/obras/${id}/notificacoes`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        const resultado = await resposta.json().catch(() => ({}));

        if (!resposta.ok) {
          mostrarMensagem(
            resultado.erro || "Não foi possível desativar o lembrete.",
            "erro",
          );

          return;
        }

        await carregarObras();

        mostrarMensagem("Lembrete desativado.", "sucesso");
      } catch (erro) {
        mostrarMensagem("Não foi possível desativar o lembrete.", "erro");
      }

      return;
    }

    // Se não existe lembrete, abre a configuração.
    await abrirConfiguracaoNotificacao(id);

    return;
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

    return;
  }

  if (evento.target.matches("button[data-volumes-expandidos]")) {
    const botao = evento.target;

    if (botao.dataset.volumesExpandidos === "true") {
      fecharListaItens();
    } else {
      abrirListaItens(botao, "manga");
    }

    return;
  }

  if (evento.target.matches("button[data-temporadas-expandidas]")) {
    const botao = evento.target;

    if (botao.dataset.temporadasExpandidas === "true") {
      fecharListaItens();
    } else {
      abrirListaItens(botao, "anime");
    }

    return;
  }

  if (evento.target.matches("button[data-marcar-todos]")) {
    const indice = Number(evento.target.dataset.marcarTodos);

    const tipo = evento.target.dataset.marcarTipo;

    const obra = obraProgressoAtual;

    const itens = obterItensDaObra(obra, tipo);

    const item = itens[indice];

    if (!item) {
      return;
    }

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
      : Array.from(
          {
            length: totalItens,
          },
          (_, numero) => inicio + numero,
        );

    renderizarProgresso();

    salvarProgresso();

    return;
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
              {
                length: fim - inicio + 1,
              },
              (_, numero) => inicio + numero,
            );
      }),
    );

    renderizarProgresso();

    salvarProgresso();

    return;
  }

  if (evento.target.matches("button#fechar-popup-progresso")) {
    document.getElementById("popup-progresso").style.display = "none";

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
            `
              <button
                type="button"
                data-abrir-link="${indice}"
              >
                ${link.nome || "Link de leitura"}
              </button>
              `,
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

      const tipo = botao.dataset.tipoAtalho;

      seletor.value = tipo;

      seletor.dispatchEvent(new Event("change"));
    });
  });

adicionarTemporada.addEventListener("click", () => {
  const temporadas = listaTemporadas.querySelectorAll(".temporada");

  if (!temporadas.length) {
    listaTemporadas.innerHTML = `
        <div class="temporada">
          <button
            type="button"
            class="botao-remover-item"
            aria-label="Remover temporada"
          >
            ×
          </button>

          <label>
            Temporada
            <input
              type="number"
              min="1"
              value="1"
            >
          </label>

          <label>
            Episódios
            <input
              type="number"
              min="1"
            >
          </label>

          <label>
            Começa no episódio
            <input
              type="number"
              min="1"
              value="1"
            >
          </label>
        </div>
      `;

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
      <button
        type="button"
        class="botao-remover-item"
        aria-label="Remover temporada"
      >
        ×
      </button>

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
        <input
          type="number"
          min="1"
          value="${proximoInicio}"
        >
      </label>
    `;

  listaTemporadas.appendChild(novaTemporada);
});

adicionarVolume.addEventListener("click", () => {
  const volumes = listaVolumes.querySelectorAll(".volume");

  if (!volumes.length) {
    listaVolumes.innerHTML = `
        <div class="volume">
          <button
            type="button"
            class="botao-remover-item"
            aria-label="Remover volume"
          >
            ×
          </button>

          <label>
            Volume
            <input
              type="number"
              min="1"
              value="1"
            >
          </label>

          <label>
            Começa no capítulo
            <input
              type="number"
              min="1"
              value="1"
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

  const proximoNumero = Number(numero) + 1;

  const proximoInicio = Number(fim) + 1;

  novoVolume.innerHTML = `
      <button
        type="button"
        class="botao-remover-item"
        aria-label="Remover volume"
      >
        ×
      </button>

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
    <option value="principal">
      Título principal
    </option>
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
    <option value="principal">
      Título principal
    </option>
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

      temporadas.push({
        numero: Number(numero),
        episodios: Number(episodios),
        inicio: Number(inicio),
        vistos: [],
      });
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

        temporadas,

        volumes,

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
          <input
            type="number"
            min="1"
            value="1"
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

          <button
            type="button"
            class="botao-remover-item"
            aria-label="Remover temporada"
          >
            ×
          </button>

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
            <input
              type="number"
              min="1"
              value="1"
            >
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
      <button
        type="button"
        class="botao-remover-item"
        aria-label="Remover temporada"
      >
        ×
      </button>

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
        <input
          type="number"
          min="1"
          value="${proximoInicio}"
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

          <button
            type="button"
            class="botao-remover-item"
            aria-label="Remover volume"
          >
            ×
          </button>

          <label>
            Volume
            <input
              type="number"
              min="1"
              value="1"
            >
          </label>

          <label>
            Começa no capítulo
            <input
              type="number"
              min="1"
              value="1"
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
      <button
        type="button"
        class="botao-remover-item"
        aria-label="Remover volume"
      >
        ×
      </button>

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

    linksLeituraEdicao.push({
      nome: nome.value.trim(),

      url: url.value.trim(),
    });

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
        <span
          class="organizar-alca"
          aria-hidden="true"
        >
          ☷
        </span>

        <img
          src="${imagem}"
          referrerpolicy="no-referrer"
          alt=""
        >

        <span class="organizar-titulo">
          ${titulo}
        </span>

        <div class="organizar-acoes">

          <button
            type="button"
            data-mover="cima"
            aria-label="Subir ${titulo}"
            title="Subir"
          >
            ↑
          </button>

          <button
            type="button"
            data-mover="baixo"
            aria-label="Descer ${titulo}"
            title="Descer"
          >
            ↓
          </button>

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

    item.querySelector('[data-mover="baixo"]').disabled =
      indice === itens.length - 1;
  });
}

async function salvarOrdemObras() {
  const itens = document.querySelectorAll("#lista-organizar .item-organizar");

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
  const confirmouSaida = window.confirm("Tem certeza de que deseja sair?");

  if (!confirmouSaida) {
    return;
  }

  localStorage.removeItem("token");

  window.location.href = "/login.html";
});

const nomePerfil = localStorage.getItem("nomeUsuario") || "usuário";

document.getElementById("nome-perfil").textContent = nomePerfil;

document.getElementById("nome-perfil-popup").textContent = nomePerfil;

document.getElementById("mudar-nick").placeholder = nomePerfil;

const configuracoesVisuaisPadrao = {
  fundo: "#196cf3",
  fonte: "Arial, sans-serif",
  botoes: "#175d69",
  botoesTexto: "#ffef0e",
  textos: "#ffffff",
  titulos: "#ffffff",
};

function aplicarConfiguracoesVisuais(configuracoes = {}) {
  const valores = {
    ...configuracoesVisuaisPadrao,
    ...configuracoes,
  };
  const raiz = document.documentElement;

  raiz.style.setProperty("--fundo-personalizado", valores.fundo);
  raiz.style.setProperty("--fonte-textos-personalizada", valores.fonte);
  raiz.style.setProperty("--cor-botoes-personalizada", valores.botoes);
  raiz.style.setProperty(
    "--cor-conteudo-botoes-personalizada",
    valores.botoesTexto,
  );
  raiz.style.setProperty("--cor-textos-personalizada", valores.textos);
  raiz.style.setProperty("--cor-titulos-personalizada", valores.titulos);
}

function preencherConfiguracoesVisuais(configuracoes = {}) {
  const valores = {
    ...configuracoesVisuaisPadrao,
    ...configuracoes,
  };

  document.getElementById("cor-fundo").value = valores.fundo;
  document.getElementById("fonte-textos").value = valores.fonte;
  document.getElementById("cor-botoes").value = valores.botoes;
  document.getElementById("cor-conteudo-botoes").value = valores.botoesTexto;
  document.getElementById("cor-textos").value = valores.textos;
  document.getElementById("cor-titulos").value = valores.titulos;
}

let fotoPerfilSelecionada;
let bibliotecaPublicaSelecionada = false;
let perfilFoiCarregado = false;

function atualizarPreviewFotoPerfil(foto) {
  const preview = document.getElementById("foto-perfil-preview");
  const vazio = document.getElementById("foto-perfil-vazia");
  const cabecalho = document.getElementById("foto-perfil-cabecalho");
  const iconeCabecalho = document.getElementById("icone-perfil-cabecalho");

  if (foto) {
    preview.src = foto;
    preview.hidden = false;
    vazio.hidden = true;
    cabecalho.src = foto;
    cabecalho.hidden = false;
    iconeCabecalho.hidden = true;
    return;
  }

  preview.hidden = true;
  vazio.hidden = false;
  cabecalho.hidden = true;
  iconeCabecalho.hidden = false;
}

function lerFotoPerfil(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

function mensagemAmigo(texto, tipo = "") {
  const elemento = document.getElementById("mensagem-amigo");

  elemento.textContent = texto;
  elemento.dataset.tipo = tipo;
}

function atualizarPrivacidade(bibliotecaPublica) {
  bibliotecaPublicaSelecionada = bibliotecaPublica;

  document
    .getElementById("privacidade-publica")
    .setAttribute("aria-pressed", String(bibliotecaPublica));
  document
    .getElementById("privacidade-privada")
    .setAttribute("aria-pressed", String(!bibliotecaPublica));
}

async function salvarPrivacidadeAutomaticamente(bibliotecaPublicaAnterior) {
  const botoes = document.querySelectorAll("[data-privacidade]");

  botoes.forEach((botao) => {
    botao.disabled = true;
  });

  try {
    const resposta = await fetch("/perfil", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        bibliotecaPublica: bibliotecaPublicaSelecionada,
      }),
    });

    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      atualizarPrivacidade(bibliotecaPublicaAnterior);
      mensagemAmigo(resultado.erro || "Não foi possível alterar a privacidade.", "erro");
      return;
    }

    mensagemAmigo(
      bibliotecaPublicaSelecionada
        ? "Biblioteca agora pública para seus amigos."
        : "Biblioteca agora privada.",
      "sucesso",
    );
  } catch (erro) {
    atualizarPrivacidade(bibliotecaPublicaAnterior);
    mensagemAmigo("Não foi possível alterar a privacidade.", "erro");
  } finally {
    botoes.forEach((botao) => {
      botao.disabled = false;
    });
  }
}

function formatarAvatarAmigo(amizade) {
  return amizade.fotoPerfil
    ? `<img class="avatar-amigo" src="${amizade.fotoPerfil}" alt="" />`
    : '<span class="avatar-amigo avatar-amigo-vazio"><i class="fa-solid fa-user"></i></span>';
}

function renderizarAmizades(amizades) {
  const solicitacoes = document.getElementById("lista-solicitacoes-amizade");
  const amigos = document.getElementById("lista-amigos");
  const recebidas = amizades.filter(
    (amizade) => amizade.direcao === "recebida" && amizade.status === "pendente",
  );
  const aceitas = amizades.filter((amizade) => amizade.status === "aceita");

  solicitacoes.innerHTML = recebidas.length
    ? recebidas
        .map(
          (amizade) => `
            <div class="item-amizade">
              <div class="identidade-amigo">
                ${formatarAvatarAmigo(amizade)}
                <span>${amizade.nome} (#${amizade.identificadorPublico})</span>
              </div>
              <div class="item-amizade-acoes">
                <button type="button" data-aceitar-amizade="${amizade.id}">Aceitar</button>
                <button type="button" data-recusar-amizade="${amizade.id}">Recusar</button>
              </div>
            </div>
          `,
        )
        .join("")
    : '<p class="lista-vazia">Nenhuma solicitação pendente.</p>';

  amigos.innerHTML = aceitas.length
    ? aceitas
        .map(
          (amizade) => `
            <div class="item-amizade">
              <div class="identidade-amigo">
                ${formatarAvatarAmigo(amizade)}
                <span>${amizade.nome} (#${amizade.identificadorPublico})</span>
              </div>
              <div class="item-amizade-acoes">
                <button type="button" data-ver-biblioteca="${amizade.identificadorPublico}" ${amizade.bibliotecaPublica ? "" : "disabled"}>
                  ${amizade.bibliotecaPublica ? "Ver biblioteca" : "Biblioteca privada"}
                </button>
                <button type="button" data-remover-amizade="${amizade.id}">Remover</button>
              </div>
            </div>
          `,
        )
        .join("")
    : '<p class="lista-vazia">Você ainda não adicionou amigos.</p>';
}

async function carregarAmizades() {
  const resposta = await fetch("/amizades", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  if (resposta.ok) {
    renderizarAmizades(await resposta.json());
  }
}

async function abrirBibliotecaAmigo(identificador) {
  const resposta = await fetch(`/usuarios/${identificador}/biblioteca`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  const resultado = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    mensagemAmigo(resultado.erro || "Não foi possível abrir a biblioteca.", "erro");
    return;
  }

  document.getElementById("titulo-biblioteca-amigo").textContent =
    `Biblioteca de ${resultado.nome}`;
  obrasPublicasAtual = resultado.obras;
  const lista = document.getElementById("lista-biblioteca-amigo");

  lista.innerHTML = resultado.obras.length
    ? resultado.obras
        .map(
          (obra) => {
            const imagem = obterImagemPreferida(obra).principal;

            return `
            <article class="obra-publica" data-publica-obra="${obrasPublicasAtual.indexOf(obra)}" tabindex="0" role="button">
              <div class="obra-publica-imagem">
                ${imagem ? `<img src="${imagem}" alt="" loading="lazy" />` : '<i class="fa-solid fa-book"></i>'}
              </div>
              <div>
                <strong>${obra.title}</strong>
                <span>${obra.tipo || "Obra"} · ${obra.status || "Sem status"}</span>
              </div>
          </article>
          `;
          },
        )
        .join("")
    : '<p class="lista-vazia">Esta biblioteca ainda não possui obras.</p>';

  document.getElementById("popup-biblioteca-amigo").style.display = "flex";
}

function abrirDetalheObraPublica(obra) {
  const progresso = calcularProgresso(obra);
  const imagem = obterImagemPreferida(obra).principal;
  const temporadas = lerConteudoObra(obra.temporadas);
  const volumes = lerConteudoObra(obra.volumes);
  const anime = temporadas.length
    ? `
      <section class="obra-publica-grupo">
        <h3><i class="fa-solid fa-list"></i> Anime</h3>
        <ul class="obra-publica-detalhe-lista">
          ${temporadas
            .map(
              (temporada) =>
                `<li>Temporada ${temporada.numero}: ${temporada.episodios || 0} episódios</li>`,
            )
            .join("")}
        </ul>
      </section>
    `
    : "";
  const manga = volumes.length
    ? `
      <section class="obra-publica-grupo">
        <h3><i class="fa-solid fa-book"></i> Mangá</h3>
        <ul class="obra-publica-detalhe-lista">
          ${volumes
            .map(
              (volume) =>
                `<li>Volume ${volume.numero}: capítulos ${volume.inicio}-${volume.fim}</li>`,
            )
            .join("")}
        </ul>
      </section>
    `
    : "";

  document.getElementById("conteudo-detalhe-obra-publica").innerHTML = `
    <article class="obra-publica-detalhe">
      <h2>${obra.title}</h2>
      ${imagem ? `<img class="obra-publica-detalhe-imagem" src="${imagem}" alt="" />` : ""}
      <span class="status-card status-${obra.status || "indefinido"}">${obra.status || "Sem status"}</span>
      <div class="progresso-texto">Progresso ${progresso.vistos}/${progresso.total}</div>
      <div class="barra-progresso">
        <div class="barra-progresso-preenchida" style="width: ${progresso.total ? (progresso.vistos / progresso.total) * 100 : 0}%"></div>
      </div>
      ${anime}
      ${manga}
    </article>
  `;

  document.getElementById("popup-detalhe-obra-publica").style.display = "flex";
}

async function carregarPerfil() {
  if (perfilFoiCarregado) {
    await carregarAmizades();
    return;
  }

  const resposta = await fetch("/perfil", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });

  if (!resposta.ok) {
    return;
  }

  const perfil = await resposta.json();
  const configuracoes = perfil.configuracoesVisuais || {};

  document.getElementById("nome-perfil").textContent = perfil.nome;
  document.getElementById("nome-perfil-popup").textContent = perfil.nome;
  document.getElementById("mudar-nick").value = perfil.nome;
  document.getElementById("mudar-email").value = perfil.email;
  document.getElementById("identificador-publico").textContent =
    perfil.identificadorPublico;
  atualizarPrivacidade(perfil.bibliotecaPublica);
  fotoPerfilSelecionada = perfil.fotoPerfil || null;
  atualizarPreviewFotoPerfil(fotoPerfilSelecionada);
  preencherConfiguracoesVisuais(configuracoes);
  aplicarConfiguracoesVisuais(configuracoes);
  perfilFoiCarregado = true;
  await carregarAmizades();
}

document.getElementById("botao-perfil").addEventListener("click", async () => {
  document.getElementById("popup-perfil").style.display = "flex";

  try {
    await carregarPerfil();
  } catch (erro) {
    mostrarMensagem("Não foi possível carregar o perfil.", "erro");
  }
});

document.getElementById("botao-amigos").addEventListener("click", async () => {
  document.getElementById("popup-amigos").style.display = "flex";

  try {
    await carregarPerfil();
  } catch (erro) {
    mensagemAmigo("Não foi possível carregar seus amigos.", "erro");
  }
});

document.getElementById("fechar-perfil").addEventListener("click", () => {
  document.getElementById("popup-perfil").style.display = "none";
});

document.getElementById("fechar-amigos").addEventListener("click", () => {
  document.getElementById("popup-amigos").style.display = "none";
});

document.querySelectorAll("[data-privacidade]").forEach((botao) => {
  botao.addEventListener("click", async () => {
    const privacidadeAnterior = bibliotecaPublicaSelecionada;

    atualizarPrivacidade(botao.dataset.privacidade === "publica");
    await salvarPrivacidadeAutomaticamente(privacidadeAnterior);
  });
});

document
  .getElementById("foto-perfil-input")
  .addEventListener("change", async (evento) => {
    const arquivo = evento.target.files[0];

    if (!arquivo) {
      return;
    }

    if (arquivo.size > 1.5 * 1024 * 1024) {
      document.getElementById("erro-perfil").textContent =
        "Escolha uma foto de até 1,5 MB.";
      evento.target.value = "";
      return;
    }

    fotoPerfilSelecionada = await lerFotoPerfil(arquivo);
    atualizarPreviewFotoPerfil(fotoPerfilSelecionada);
  });

document.getElementById("adicionar-amigo").addEventListener("click", async () => {
  const campo = document.getElementById("id-amigo");
  const identificadorPublico = campo.value.trim();

  mensagemAmigo("");

  try {
    const resposta = await fetch("/amizades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ identificadorPublico }),
    });
    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mensagemAmigo(resultado.erro || "Não foi possível enviar a solicitação.", "erro");
      return;
    }

    campo.value = "";
    mensagemAmigo(`Solicitação enviada para ${resultado.nome}.`, "sucesso");
    await carregarAmizades();
  } catch (erro) {
    mensagemAmigo("Não foi possível enviar a solicitação.", "erro");
  }
});

document.getElementById("fechar-biblioteca-amigo").addEventListener("click", () => {
  document.getElementById("popup-biblioteca-amigo").style.display = "none";
});

document
  .getElementById("fechar-detalhe-obra-publica")
  .addEventListener("click", () => {
    document.getElementById("popup-detalhe-obra-publica").style.display = "none";
  });

document.getElementById("fechar-lista-itens").addEventListener("click", () => {
  fecharListaItens();
});

document.addEventListener("click", async (evento) => {
  const aceitar = evento.target.closest("[data-aceitar-amizade]");
  const recusar = evento.target.closest("[data-recusar-amizade]");
  const remover = evento.target.closest("[data-remover-amizade]");
  const verBiblioteca = evento.target.closest("[data-ver-biblioteca]");
  const obraPublica = evento.target.closest("[data-publica-obra]");

  if (obraPublica) {
    abrirDetalheObraPublica(
      obrasPublicasAtual[Number(obraPublica.dataset.publicaObra)],
    );
    return;
  }

  if (verBiblioteca) {
    await abrirBibliotecaAmigo(verBiblioteca.dataset.verBiblioteca);
    return;
  }

  const acao = aceitar || recusar;

  if (acao) {
    const status = aceitar ? "aceita" : "recusada";
    const resposta = await fetch(`/amizades/${acao.dataset[aceitar ? "aceitarAmizade" : "recusarAmizade"]}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ status }),
    });

    if (resposta.ok) {
      await carregarAmizades();
    }

    return;
  }

  if (remover) {
    const resposta = await fetch(`/amizades/${remover.dataset.removerAmizade}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (resposta.ok) {
      await carregarAmizades();
    }
  }
});

document.getElementById("restaurar-visuais").addEventListener("click", () => {
  preencherConfiguracoesVisuais(configuracoesVisuaisPadrao);
  aplicarConfiguracoesVisuais(configuracoesVisuaisPadrao);
});

document.getElementById("salvar-perfil").addEventListener("click", async () => {
  const erro = document.getElementById("erro-perfil");
  const novaSenha = document.getElementById("nova-senha").value;
  const senhaAtual = document.getElementById("senha-atual").value;
  const confirmarNovaSenha = document.getElementById(
    "confirmar-nova-senha",
  ).value;

  erro.textContent = "";

  if (novaSenha !== confirmarNovaSenha) {
    erro.textContent = "As novas senhas não conferem.";
    return;
  }

  const configuracoesVisuais = {
    fundo: document.getElementById("cor-fundo").value,
    fonte: document.getElementById("fonte-textos").value,
    botoes: document.getElementById("cor-botoes").value,
    botoesTexto: document.getElementById("cor-conteudo-botoes").value,
    textos: document.getElementById("cor-textos").value,
    titulos: document.getElementById("cor-titulos").value,
  };
  const botao = document.getElementById("salvar-perfil");

  botao.disabled = true;

  try {
    const resposta = await fetch("/perfil", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        nome: document.getElementById("mudar-nick").value,
        email: document.getElementById("mudar-email").value,
        senhaAtual,
        novaSenha,
        bibliotecaPublica: bibliotecaPublicaSelecionada,
        fotoPerfil: fotoPerfilSelecionada,
        configuracoesVisuais,
      }),
    });
    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      erro.textContent = resultado.erro || "Não foi possível salvar o perfil.";
      return;
    }

    localStorage.setItem("nomeUsuario", resultado.nome);
    document.getElementById("nome-perfil").textContent = resultado.nome;
    document.getElementById("nome-perfil-popup").textContent = resultado.nome;
    document.getElementById("identificador-publico").textContent =
      resultado.identificadorPublico;
    fotoPerfilSelecionada = resultado.fotoPerfil || null;
    atualizarPreviewFotoPerfil(fotoPerfilSelecionada);
    document.getElementById("senha-atual").value = "";
    document.getElementById("nova-senha").value = "";
    document.getElementById("confirmar-nova-senha").value = "";
    aplicarConfiguracoesVisuais(resultado.configuracoesVisuais);
    document.getElementById("popup-perfil").style.display = "none";
    mostrarMensagem("Perfil salvo com sucesso!", "sucesso");
  } catch (erroRequisicao) {
    erro.textContent = "Não foi possível salvar o perfil.";
  } finally {
    botao.disabled = false;
  }
});

carregarPerfil().catch(() => {});

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
