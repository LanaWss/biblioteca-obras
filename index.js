require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const webpush = require("web-push");

const app = express();

const VERSAO_TERMOS = "1.0";
const VERSAO_PRIVACIDADE = "1.0";
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TAMANHO_MAXIMO_FOTO_PERFIL = 2 * 1024 * 1024;
const EMAIL_ADMINISTRADOR = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

class ErroAplicacao extends Error {
  constructor(mensagem, status = 500) {
    super(mensagem);
    this.status = status;
  }
}

function responderErro(res, status, mensagem) {
  return res.status(status).json({ erro: mensagem });
}

async function baixarImagemComoDataUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  const controlador = new AbortController();
  const tempoLimite = setTimeout(() => controlador.abort(), 8000);

  try {
    const resposta = await fetch(url, {
      signal: controlador.signal,
      headers: {
        Accept: "image/*",
      },
    });

    if (!resposta.ok) {
      return null;
    }

    const tipo = resposta.headers.get("content-type") || "";
    const tamanhoInformado = Number(resposta.headers.get("content-length"));

    if (
      !tipo.startsWith("image/") ||
      tamanhoInformado > TAMANHO_MAXIMO_IMAGEM
    ) {
      return null;
    }

    const dados = Buffer.from(await resposta.arrayBuffer());

    if (dados.length > TAMANHO_MAXIMO_IMAGEM) {
      return null;
    }

    return `data:${tipo.split(";")[0]};base64,${dados.toString("base64")}`;
  } catch (erro) {
    return null;
  } finally {
    clearTimeout(tempoLimite);
  }
}

function tratarErro(erro, req, res, next) {
  if (res.headersSent) {
    return next(erro);
  }

  if (erro.type === "entity.parse.failed") {
    return responderErro(res, 400, "JSON inválido");
  }

  const status = erro instanceof ErroAplicacao ? erro.status : 500;
  const mensagem = status >= 500 ? "Erro interno do servidor" : erro.message;

  if (status >= 500) {
    console.error(erro);
  }

  return responderErro(res, status, mensagem);
}

function verificarToken(req, res, next) {
  const autorizacao = req.headers.authorization;

  if (!autorizacao) {
    return responderErro(res, 401, "Token não informado");
  }

  const token = autorizacao.split(" ")[1];

  try {
    const usuario = jwt.verify(token, "chave-secreta");

    req.usuario = usuario;

    next();
  } catch (erro) {
    return responderErro(res, 401, "Token inválido");
  }
}

const caminhoBanco = process.env.DB_PATH || path.join(__dirname, "obras.db");
const db = new Database(caminhoBanco);

webpush.setVapidDetails(
  "mailto:lanawinna11@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    usuario_id INTEGER,
    tipo TEXT,
    status TEXT,
    imagem TEXT,
    imagem_arquivo TEXT,
    imagem_preferencia TEXT DEFAULT 'url',
    link_leitura TEXT,
    link_leituras TEXT DEFAULT '[]',
    temporadas TEXT,
    capitulos INTEGER,
    ordem INTEGER
  );
`);

for (const coluna of [
  "ALTER TABLE obras ADD COLUMN titulos_alternativos TEXT DEFAULT '[]'",
  "ALTER TABLE obras ADD COLUMN titulo_exibicao TEXT DEFAULT 'principal'",
  "ALTER TABLE obras ADD COLUMN usuario_id INTEGER",
  "ALTER TABLE obras ADD COLUMN temporadas TEXT",
  "ALTER TABLE obras ADD COLUMN capitulos INTEGER",
  "ALTER TABLE obras ADD COLUMN volumes TEXT",
  "ALTER TABLE obras ADD COLUMN imagem_arquivo TEXT",
  "ALTER TABLE obras ADD COLUMN imagem_preferencia TEXT DEFAULT 'url'",
  "ALTER TABLE obras ADD COLUMN link_leitura TEXT",
  "ALTER TABLE obras ADD COLUMN link_leituras TEXT DEFAULT '[]'",
  "ALTER TABLE obras ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE obras ADD COLUMN ordem INTEGER",
]) {
  try {
    db.exec(coluna);
  } catch (erro) {
    // A coluna já existe
  }
}

const obrasSemOrdem = db
  .prepare(
    `
    SELECT id, usuario_id
    FROM obras
    WHERE ordem IS NULL
    ORDER BY usuario_id, id
  `,
  )
  .all();

const definirOrdem = db.prepare(`
  UPDATE obras
  SET ordem = ?
  WHERE id = ?
`);

const ordemPorUsuario = new Map();

for (const obra of obrasSemOrdem) {
  const usuarioId = obra.usuario_id;

  const proximaOrdem = (ordemPorUsuario.get(usuarioId) || 0) + 1;

  definirOrdem.run(proximaOrdem, obra.id);

  ordemPorUsuario.set(usuarioId, proximaOrdem);
}

function obterDataHoraSaoPaulo() {
  const agora = new Date();

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);

  const valores = {};

  partes.forEach((parte) => {
    if (parte.type !== "literal") {
      valores[parte.type] = parte.value;
    }
  });

  return {
    ano: Number(valores.year),
    mes: Number(valores.month),
    dia: Number(valores.day),
    diaSemana: new Date(
      Number(valores.year),
      Number(valores.month) - 1,
      Number(valores.day),
    ).getDay(),
    hora: valores.hour,
    minuto: valores.minute,
  };
}

function obterChaveEnvio(dataHora) {
  return (
    `${dataHora.ano}-` +
    `${String(dataHora.mes).padStart(2, "0")}-` +
    `${String(dataHora.dia).padStart(2, "0")} ` +
    `${dataHora.hora}:` +
    `${String(dataHora.minuto).padStart(2, "0")}`
  );
}

function notificacaoDeveSerEnviada(notificacao, dataHora) {
  if (!notificacao.hora) {
    return false;
  }

  const horaAtual = `${dataHora.hora}:${String(dataHora.minuto).padStart(2, "0")}`;

  if (notificacao.hora !== horaAtual) {
    return false;
  }

  const chaveAtual = obterChaveEnvio(dataHora);

  if (notificacao.ultima_envio === chaveAtual) {
    return false;
  }

  const diasSemana = JSON.parse(notificacao.dias_semana || "[]").map(Number);

  const correspondeSemana = diasSemana.includes(dataHora.diaSemana);

  const correspondeMes =
    notificacao.dia_mes !== null &&
    Number(notificacao.dia_mes) === dataHora.dia;

  return correspondeSemana || correspondeMes;
}

async function enviarPushDaNotificacao(notificacao) {
  const inscricoes = db
    .prepare(`
      SELECT endpoint, p256dh, auth
      FROM inscricoes_push
      WHERE usuario_id = ?
    `)
    .all(notificacao.usuario_id);

  if (!inscricoes.length) {
    return false;
  }

  const nomeObra =
    notificacao.titulo_exibicao &&
    notificacao.titulo_exibicao !== "principal"
      ? notificacao.titulo_exibicao
      : notificacao.title;

  const tipoTexto = notificacao.tipo === "anime" ? "Anime" : "Mangá";

  const payload = JSON.stringify({
    titulo: nomeObra,
    corpo: `Seu lembrete de ${tipoTexto} está na hora.`,
    obraId: notificacao.obra_id,
  });

  let enviou = false;

  for (const inscricao of inscricoes) {
    try {
      await webpush.sendNotification(
        {
          endpoint: inscricao.endpoint,
          keys: {
            p256dh: inscricao.p256dh,
            auth: inscricao.auth,
          },
        },
        payload,
        {
          TTL: 3600,
          urgency: "high",
        },
      );

      enviou = true;
    } catch (erro) {
      console.error("Erro ao enviar Push:", erro);

      if (erro.statusCode === 404 || erro.statusCode === 410) {
        db.prepare(`
          DELETE FROM inscricoes_push
          WHERE endpoint = ?
        `).run(inscricao.endpoint);
      }
    }
  }

  return enviou;
}

async function verificarNotificacoesAgendadas() {
  const dataHora = obterDataHoraSaoPaulo();

  const notificacoes = db
    .prepare(`
      SELECT
        n.*,
        o.title,
        o.titulo_exibicao
      FROM notificacoes n
      INNER JOIN obras o
        ON o.id = n.obra_id
      WHERE n.usuario_id = o.usuario_id
    `)
    .all();

  for (const notificacao of notificacoes) {
    if (!notificacaoDeveSerEnviada(notificacao, dataHora)) {
      continue;
    }

    const enviou = await enviarPushDaNotificacao(notificacao);

    if (!enviou) {
      continue;
    }

    const chaveAtual = obterChaveEnvio(dataHora);

    db.prepare(`
      UPDATE notificacoes
      SET ultima_envio = ?
      WHERE id = ?
    `).run(chaveAtual, notificacao.id);
  }
}

setInterval(() => {
  verificarNotificacoesAgendadas().catch((erro) => {
    console.error("Erro ao verificar notificações:", erro);
  });
}, 30000);

verificarNotificacoesAgendadas().catch((erro) => {
  console.error("Erro ao iniciar verificação de notificações:", erro);
});

function normalizarOrdemDoUsuario(usuarioId) {
  const obras = db
    .prepare(
      `
      SELECT id
      FROM obras
      WHERE usuario_id = ?
      ORDER BY ordem ASC, id ASC
    `,
    )
    .all(usuarioId);

  const atualizarOrdem = db.prepare(`
    UPDATE obras
    SET ordem = ?
    WHERE id = ? AND usuario_id = ?
  `);

  const normalizar = db.transaction((lista) => {
    lista.forEach((obra, indice) => {
      atualizarOrdem.run(indice + 1, obra.id, usuarioId);
    });
  });

  normalizar(obras);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    termos_aceitos INTEGER NOT NULL DEFAULT 0,
    versao_termos TEXT,
    versao_privacidade TEXT,
    data_aceite TEXT,
    configuracoes_visuais TEXT NOT NULL DEFAULT '{}',
    identificador_publico TEXT,
    biblioteca_publica INTEGER NOT NULL DEFAULT 0,
    foto_perfil TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    obra_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('anime', 'manga')),
    dias_semana TEXT NOT NULL DEFAULT '[]',
    dia_mes INTEGER,
    hora TEXT,
    UNIQUE (obra_id, usuario_id, tipo)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inscricoes_push (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL
  );
`);

try {
  db.exec(`
    ALTER TABLE notificacoes
    ADD COLUMN hora TEXT
  `);
} catch (erro) {
  if (!erro.message.includes("duplicate column name")) {
    throw erro;
  }
}

try {
  db.exec(`
    ALTER TABLE notificacoes
    ADD COLUMN ultima_envio TEXT
  `);
} catch (erro) {
  if (!erro.message.includes("duplicate column name")) {
    throw erro;
  }
}

for (const coluna of [
  "ALTER TABLE usuarios ADD COLUMN termos_aceitos INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usuarios ADD COLUMN versao_termos TEXT",
  "ALTER TABLE usuarios ADD COLUMN versao_privacidade TEXT",
  "ALTER TABLE usuarios ADD COLUMN data_aceite TEXT",
  "ALTER TABLE usuarios ADD COLUMN configuracoes_visuais TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE usuarios ADD COLUMN identificador_publico TEXT",
  "ALTER TABLE usuarios ADD COLUMN biblioteca_publica INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT",
  "ALTER TABLE usuarios ADD COLUMN eh_admin INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(coluna);
  } catch (erro) {
    // A coluna já existe
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS indice_identificador_publico
  ON usuarios (identificador_publico)
`);

function gerarIdentificadorPublico() {
  let identificador;

  do {
    identificador = String(Math.floor(1000 + Math.random() * 9000));
  } while (
    db
      .prepare(
        "SELECT 1 FROM usuarios WHERE identificador_publico = ?",
      )
      .get(identificador)
  );

  return identificador;
}

const usuariosSemIdentificador = db
  .prepare(
    `
    SELECT id
    FROM usuarios
    WHERE identificador_publico IS NULL
  `,
  )
  .all();

const definirIdentificadorPublico = db.prepare(
  "UPDATE usuarios SET identificador_publico = ? WHERE id = ?",
);

for (const usuario of usuariosSemIdentificador) {
  definirIdentificadorPublico.run(gerarIdentificadorPublico(), usuario.id);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS amizades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitante_id INTEGER NOT NULL,
    destinatario_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente'
      CHECK (status IN ('pendente', 'aceita', 'recusada')),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (solicitante_id, destinatario_id),
    CHECK (solicitante_id <> destinatario_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sugestoes_obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    dados TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente'
      CHECK (status IN ('pendente', 'aceita', 'recusada')),
    mensagem_admin TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    avaliado_em TEXT
  );
  CREATE TABLE IF NOT EXISTS catalogo_obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dados TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function usuarioEhAdministrador(usuario) {
  return Boolean(
    usuario?.eh_admin === 1 ||
      (EMAIL_ADMINISTRADOR && String(usuario?.email || "").toLowerCase() === EMAIL_ADMINISTRADOR),
  );
}

function exigirAdministrador(req, res, next) {
  const usuario = db.prepare("SELECT id, email, eh_admin FROM usuarios WHERE id = ?").get(req.usuario.id);

  if (!usuarioEhAdministrador(usuario)) {
    return responderErro(res, 403, "Acesso restrito à conta administradora");
  }

  req.usuarioAdministrador = usuario;
  next();
}

function normalizarDadosSugestao(dados) {
  const obra = dados && typeof dados === "object" ? dados : {};
  const resultado = {
    titulo: String(obra.titulo || obra.title || "").trim(),
    tipo: obra.tipo,
    status: obra.status,
    imagem: typeof obra.imagem === "string" ? obra.imagem.trim() : "",
    imagemArquivo: obra.imagemArquivo || obra.imagem_arquivo || null,
    imagemPreferencia: obra.imagemPreferencia || obra.imagem_preferencia || "url",
    linkLeitura: obra.linkLeitura || obra.link_leitura || null,
    linksLeitura: Array.isArray(obra.linksLeitura || obra.link_leituras)
      ? obra.linksLeitura || obra.link_leituras
      : [],
    temporadas: Array.isArray(obra.temporadas) ? obra.temporadas : [],
    capitulos: obra.capitulos || null,
    volumes: Array.isArray(obra.volumes) ? obra.volumes : [],
    titulosAlternativos: Array.isArray(obra.titulosAlternativos || obra.titulos_alternativos)
      ? obra.titulosAlternativos || obra.titulos_alternativos
      : [],
    tituloExibicao: obra.tituloExibicao || obra.titulo_exibicao || "principal",
  };

  if (!resultado.titulo) {
    throw new ErroAplicacao("O nome da obra é obrigatório", 400);
  }
  if (!["anime", "manga", "ambos"].includes(resultado.tipo)) {
    throw new ErroAplicacao("Selecione anime, mangá ou ambos", 400);
  }
  if (!["completa", "hiato", "lancando"].includes(resultado.status)) {
    throw new ErroAplicacao("Selecione um status válido", 400);
  }

  return resultado;
}

function dadosCatalogoParaCliente(dados, id) {
  return {
    id,
    titulo: dados.titulo,
    titulosAlternativos: dados.titulosAlternativos,
    tipo: dados.tipo,
    status: dados.status,
    imagem: dados.imagem,
    imagemArquivo: dados.imagemArquivo,
    imagemPreferencia: dados.imagemPreferencia,
    linkLeitura: dados.linkLeitura,
    linksLeitura: dados.linksLeitura,
    temporadas: dados.temporadas,
    capitulos: dados.capitulos,
    volumes: dados.volumes,
  };
}

app.post("/usuarios", async (req, res) => {
  const { nome, email, senha, aceitouTermos } = req.body;

  if (!nome || !email || !senha) {
    return responderErro(res, 400, "Nome, email e senha são obrigatórios");
  }

  if (aceitouTermos !== true) {
    return responderErro(
      res,
      400,
      "Você precisa aceitar os Termos de Serviço e a Política de Privacidade.",
    );
  }

  try {
    const inserir = db.prepare(`
      INSERT INTO usuarios (
        nome,
        email,
        senha,
        termos_aceitos,
        versao_termos,
        versao_privacidade,
        data_aceite,
        identificador_publico
      )
      VALUES (?, ?, ?, 1, ?, ?, ?, ?)
    `);

    const senhaHash = await bcrypt.hash(senha, 10);
    const dataAceite = new Date().toISOString();

    const resultado = inserir.run(
      nome,
      email,
      senhaHash,
      VERSAO_TERMOS,
      VERSAO_PRIVACIDADE,
      dataAceite,
      gerarIdentificadorPublico(),
    );

    res.json({
      id: resultado.lastInsertRowid,
      nome,
      email,
    });
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return responderErro(res, 400, "Este email já está cadastrado");
    }

    throw erro;
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return responderErro(res, 400, "Email e senha são obrigatórios");
  }

  const usuario = db
    .prepare(
      `
      SELECT *
      FROM usuarios
      WHERE email = ?
    `,
    )
    .get(email);

  if (!usuario) {
    return responderErro(res, 401, "Email ou senha incorretos");
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

  if (!senhaCorreta) {
    return responderErro(res, 401, "Email ou senha incorretos");
  }

  db.prepare("UPDATE obras SET usuario_id = ? WHERE usuario_id IS NULL").run(
    usuario.id,
  );
  normalizarOrdemDoUsuario(usuario.id);

  const token = jwt.sign(
    {
      id: usuario.id,
    },
    "chave-secreta",
  );

  res.json({
    token,
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    identificadorPublico: usuario.identificador_publico,
    bibliotecaPublica: usuario.biblioteca_publica === 1,
    fotoPerfil: usuario.foto_perfil,
    ehAdmin: usuarioEhAdministrador(usuario),
    configuracoesVisuais: JSON.parse(usuario.configuracoes_visuais || "{}"),
  });
});

app.get("/perfil", verificarToken, (req, res) => {
  const usuario = db
    .prepare(
      `
      SELECT
        nome,
        email,
        identificador_publico,
        biblioteca_publica,
        foto_perfil,
        eh_admin,
        configuracoes_visuais
      FROM usuarios
      WHERE id = ?
    `,
    )
    .get(req.usuario.id);

  if (!usuario) {
    return responderErro(res, 404, "Usuário não encontrado");
  }

  res.json({
    nome: usuario.nome,
    email: usuario.email,
    identificadorPublico: usuario.identificador_publico,
    bibliotecaPublica: usuario.biblioteca_publica === 1,
    fotoPerfil: usuario.foto_perfil,
    ehAdmin: usuarioEhAdministrador(usuario),
    configuracoesVisuais: JSON.parse(usuario.configuracoes_visuais || "{}"),
  });
});

app.patch("/perfil", verificarToken, async (req, res) => {
  const {
    nome,
    email,
    senhaAtual,
    novaSenha,
    configuracoesVisuais,
    bibliotecaPublica,
    fotoPerfil,
  } =
    req.body || {};
  const usuario = db
    .prepare("SELECT * FROM usuarios WHERE id = ?")
    .get(req.usuario.id);

  if (!usuario) {
    return responderErro(res, 404, "Usuário não encontrado");
  }

  const novoNome = typeof nome === "string" ? nome.trim() : usuario.nome;
  const novoEmail = typeof email === "string" ? email.trim() : usuario.email;

  if (!novoNome || !novoEmail) {
    return responderErro(res, 400, "Nome e email são obrigatórios");
  }

  if (
    fotoPerfil !== undefined &&
    fotoPerfil !== null &&
    (!String(fotoPerfil).startsWith("data:image/") ||
      String(fotoPerfil).length > TAMANHO_MAXIMO_FOTO_PERFIL)
  ) {
    return responderErro(res, 400, "A foto de perfil é inválida ou muito grande");
  }

  if (novaSenha || senhaAtual) {
    if (!senhaAtual || !novaSenha || novaSenha.length < 6) {
      return responderErro(
        res,
        400,
        "Informe a senha atual e uma nova senha com pelo menos 6 caracteres",
      );
    }

    if (!(await bcrypt.compare(senhaAtual, usuario.senha))) {
      return responderErro(res, 401, "A senha atual está incorreta");
    }
  }

  let novasConfiguracoes = {};

  if (configuracoesVisuais && typeof configuracoesVisuais === "object") {
    novasConfiguracoes = {
      fundo: configuracoesVisuais.fundo,
      fundoInicio: configuracoesVisuais.fundoInicio,
      fundoIntermediaria: configuracoesVisuais.fundoIntermediaria,
      fundoFim: configuracoesVisuais.fundoFim,
      fundoCelularInicio: configuracoesVisuais.fundoCelularInicio,
      fundoCelularIntermediaria: configuracoesVisuais.fundoCelularIntermediaria,
      fundoCelularFim: configuracoesVisuais.fundoCelularFim,
      estiloFundoPc: configuracoesVisuais.estiloFundoPc,
      estiloFundoCelular: configuracoesVisuais.estiloFundoCelular,
      modoFundoPc: configuracoesVisuais.modoFundoPc,
      imagemFundoPc: configuracoesVisuais.imagemFundoPc,
      modoFundoCelular: configuracoesVisuais.modoFundoCelular,
      imagemFundoCelular: configuracoesVisuais.imagemFundoCelular,
      fonte: configuracoesVisuais.fonte,
      botoes: configuracoesVisuais.botoes,
      botoesTexto: configuracoesVisuais.botoesTexto,
      textos: configuracoesVisuais.textos,
      titulos: configuracoesVisuais.titulos,
    };
  } else {
    novasConfiguracoes = JSON.parse(usuario.configuracoes_visuais || "{}");
  }

  const novaFotoPerfil = fotoPerfil === undefined ? usuario.foto_perfil : fotoPerfil;
  const novaVisibilidade =
    bibliotecaPublica === undefined
      ? usuario.biblioteca_publica
      : bibliotecaPublica === true
        ? 1
        : 0;

  try {
    const senha = novaSenha
      ? await bcrypt.hash(novaSenha, 10)
      : usuario.senha;

    db.prepare(
      `
      UPDATE usuarios
      SET
        nome = ?,
        email = ?,
        senha = ?,
        configuracoes_visuais = ?,
        biblioteca_publica = ?,
        foto_perfil = ?
      WHERE id = ?
    `,
    ).run(
      novoNome,
      novoEmail,
      senha,
      JSON.stringify(novasConfiguracoes),
      novaVisibilidade,
      novaFotoPerfil,
      req.usuario.id,
    );
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return responderErro(res, 400, "Este email já está cadastrado");
    }

    throw erro;
  }

  res.json({
    nome: novoNome,
    email: novoEmail,
    identificadorPublico: usuario.identificador_publico,
    bibliotecaPublica: novaVisibilidade === 1,
    fotoPerfil: novaFotoPerfil,
    configuracoesVisuais: novasConfiguracoes,
  });
});

function formatarAmizade(registro, usuarioId) {
  const ehSolicitante = registro.solicitante_id === usuarioId;

  return {
    id: registro.id,
    status: registro.status,
    direcao: ehSolicitante ? "enviada" : "recebida",
    identificadorPublico: ehSolicitante
      ? registro.destinatario_identificador
      : registro.solicitante_identificador,
    nome: ehSolicitante ? registro.destinatario_nome : registro.solicitante_nome,
    fotoPerfil: ehSolicitante
      ? registro.destinatario_foto
      : registro.solicitante_foto,
    bibliotecaPublica: ehSolicitante
      ? registro.destinatario_biblioteca === 1
      : registro.solicitante_biblioteca === 1,
  };
}

const consultaAmizades = `
  SELECT
    a.id,
    a.solicitante_id,
    a.destinatario_id,
    a.status,
    solicitante.identificador_publico AS solicitante_identificador,
    solicitante.nome AS solicitante_nome,
    solicitante.foto_perfil AS solicitante_foto,
    solicitante.biblioteca_publica AS solicitante_biblioteca,
    destinatario.identificador_publico AS destinatario_identificador,
    destinatario.nome AS destinatario_nome,
    destinatario.foto_perfil AS destinatario_foto,
    destinatario.biblioteca_publica AS destinatario_biblioteca
  FROM amizades a
  INNER JOIN usuarios solicitante ON solicitante.id = a.solicitante_id
  INNER JOIN usuarios destinatario ON destinatario.id = a.destinatario_id
  WHERE a.solicitante_id = ? OR a.destinatario_id = ?
  ORDER BY a.id DESC
`;

app.get("/amizades", verificarToken, (req, res) => {
  const registros = db
    .prepare(consultaAmizades)
    .all(req.usuario.id, req.usuario.id);

  res.json(registros.map((registro) => formatarAmizade(registro, req.usuario.id)));
});

app.post("/amizades", verificarToken, (req, res) => {
  const identificador = String(req.body?.identificadorPublico || "").trim();

  if (!/^\d{4}$/.test(identificador)) {
    return responderErro(res, 400, "Informe um ID público com 4 dígitos");
  }

  const destinatario = db
    .prepare(
      `
      SELECT id, nome, identificador_publico, foto_perfil, biblioteca_publica
      FROM usuarios
      WHERE identificador_publico = ?
    `,
    )
    .get(identificador);

  if (!destinatario) {
    return responderErro(res, 404, "Nenhum usuário encontrado com esse ID");
  }

  if (destinatario.id === req.usuario.id) {
    return responderErro(res, 400, "Você não pode adicionar a si mesmo");
  }

  const existente = db
    .prepare(
      `
      SELECT *
      FROM amizades
      WHERE (solicitante_id = ? AND destinatario_id = ?)
         OR (solicitante_id = ? AND destinatario_id = ?)
    `,
    )
    .get(req.usuario.id, destinatario.id, destinatario.id, req.usuario.id);

  if (existente) {
    return responderErro(res, 400, `Esta amizade já está ${existente.status}`);
  }

  const resultado = db
    .prepare(
      `
      INSERT INTO amizades (solicitante_id, destinatario_id)
      VALUES (?, ?)
    `,
    )
    .run(req.usuario.id, destinatario.id);

  res.json({
    id: resultado.lastInsertRowid,
    status: "pendente",
    nome: destinatario.nome,
    identificadorPublico: destinatario.identificador_publico,
  });
});

app.patch("/amizades/:id", verificarToken, (req, res) => {
  const status = req.body?.status;

  if (!['aceita', 'recusada'].includes(status)) {
    return responderErro(res, 400, "Status de amizade inválido");
  }

  const resultado = db
    .prepare(
      `
      UPDATE amizades
      SET status = ?
      WHERE id = ? AND destinatario_id = ? AND status = 'pendente'
    `,
    )
    .run(status, Number(req.params.id), req.usuario.id);

  if (!resultado.changes) {
    return responderErro(res, 404, "Solicitação de amizade não encontrada");
  }

  res.json({ mensagem: status === "aceita" ? "Amizade aceita" : "Solicitação recusada" });
});

app.delete("/amizades/:id", verificarToken, (req, res) => {
  const resultado = db
    .prepare(
      `
      DELETE FROM amizades
      WHERE id = ? AND (solicitante_id = ? OR destinatario_id = ?)
    `,
    )
    .run(Number(req.params.id), req.usuario.id, req.usuario.id);

  if (!resultado.changes) {
    return responderErro(res, 404, "Amizade não encontrada");
  }

  res.json({ mensagem: "Amizade removida" });
});

app.get("/usuarios/:identificadorPublico/biblioteca", verificarToken, (req, res) => {
  const identificador = String(req.params.identificadorPublico);
  const usuario = db
    .prepare(
      `
      SELECT id, nome, identificador_publico, biblioteca_publica, foto_perfil
      FROM usuarios
      WHERE identificador_publico = ?
    `,
    )
    .get(identificador);

  if (!usuario) {
    return responderErro(res, 404, "Usuário não encontrado");
  }

  const ehProprioPerfil = usuario.id === req.usuario.id;
  const amizade = db
    .prepare(
      `
      SELECT 1
      FROM amizades
      WHERE status = 'aceita'
        AND ((solicitante_id = ? AND destinatario_id = ?)
          OR (solicitante_id = ? AND destinatario_id = ?))
    `,
    )
    .get(req.usuario.id, usuario.id, usuario.id, req.usuario.id);

  if (!ehProprioPerfil && (!amizade || usuario.biblioteca_publica !== 1)) {
    return responderErro(res, 403, "Esta biblioteca não está disponível para você");
  }

  const obras = db
    .prepare(
      `
      SELECT *
      FROM obras
      WHERE usuario_id = ?
      ORDER BY ordem ASC, id ASC
    `,
    )
    .all(usuario.id);

  res.json({
    nome: usuario.nome,
    identificadorPublico: usuario.identificador_publico,
    fotoPerfil: usuario.foto_perfil,
    obras,
  });
});

app.get("/notificacoes", verificarToken, (req, res) => {
  const registros = db
    .prepare(
      `
      SELECT
        n.id,
        n.obra_id,
        n.tipo,
        n.dias_semana,
        n.dia_mes,
        n.hora,
        o.title,
        o.titulo_exibicao
      FROM notificacoes n
      INNER JOIN obras o
        ON o.id = n.obra_id
      WHERE n.usuario_id = ?
        AND o.usuario_id = ?
      ORDER BY o.ordem ASC, n.tipo ASC
    `,
    )
    .all(req.usuario.id, req.usuario.id);

  const notificacoes = registros.map((registro) => ({
    id: registro.id,
    obraId: registro.obra_id,
    tipo: registro.tipo,
    diasSemana: JSON.parse(registro.dias_semana || "[]"),
    diaMes: registro.dia_mes,
    hora: registro.hora,
    title: registro.title,
    tituloExibicao: registro.titulo_exibicao,
  }));

  res.json(notificacoes);
});

app.get("/obras", verificarToken, (req, res) => {
  const obras = db
    .prepare(
      `
      SELECT
        o.*,
        EXISTS (
          SELECT 1
          FROM notificacoes n
          WHERE n.obra_id = o.id
            AND n.usuario_id = o.usuario_id
        ) AS notificacao_ativa
      FROM obras o
      WHERE o.usuario_id = ?
      ORDER BY o.ordem ASC, o.id ASC
    `,
    )
    .all(req.usuario.id);

  res.json(obras);
});

app.get("/catalogo-obras", verificarToken, (req, res) => {
  const registros = db.prepare("SELECT id, dados FROM catalogo_obras ORDER BY id DESC").all();
  const obras = registros.map((registro) => {
    try {
      return dadosCatalogoParaCliente(JSON.parse(registro.dados), registro.id);
    } catch (erro) {
      console.error("Catálogo com dados inválidos:", erro);
      return null;
    }
  }).filter(Boolean);

  res.json(obras);
});

app.post("/sugestoes-obras", verificarToken, (req, res) => {
  let dados;

  try {
    dados = normalizarDadosSugestao(req.body);
  } catch (erro) {
    return responderErro(res, erro.status || 400, erro.message);
  }

  const resultado = db.prepare(`
    INSERT INTO sugestoes_obras (usuario_id, dados)
    VALUES (?, ?)
  `).run(req.usuario.id, JSON.stringify(dados));

  res.status(201).json({
    id: resultado.lastInsertRowid,
    mensagem: "Sugestão enviada para análise.",
  });
});

app.get("/sugestoes-obras", verificarToken, exigirAdministrador, (req, res) => {
  const sugestoes = db.prepare(`
    SELECT s.id, s.dados, s.status, s.mensagem_admin, s.criado_em,
           u.nome AS usuario_nome, u.email AS usuario_email
    FROM sugestoes_obras s
    INNER JOIN usuarios u ON u.id = s.usuario_id
    ORDER BY CASE s.status WHEN 'pendente' THEN 0 ELSE 1 END, s.id DESC
  `).all().map((sugestao) => ({
    id: sugestao.id,
    dados: JSON.parse(sugestao.dados),
    status: sugestao.status,
    mensagemAdmin: sugestao.mensagem_admin,
    criadoEm: sugestao.criado_em,
    usuarioNome: sugestao.usuario_nome,
    usuarioEmail: sugestao.usuario_email,
  }));

  res.json(sugestoes);
});

app.patch("/sugestoes-obras/:id", verificarToken, exigirAdministrador, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  const mensagem = typeof req.body?.mensagem === "string"
    ? req.body.mensagem.trim().slice(0, 1000)
    : "";

  if (!["aceita", "recusada"].includes(status)) {
    return responderErro(res, 400, "A decisão da sugestão é inválida");
  }
  if (status === "recusada" && !mensagem) {
    return responderErro(res, 400, "Informe o motivo da recusa");
  }

  const sugestao = db.prepare("SELECT * FROM sugestoes_obras WHERE id = ?").get(id);
  if (!sugestao) {
    return responderErro(res, 404, "Sugestão não encontrada");
  }
  if (sugestao.status !== "pendente") {
    return responderErro(res, 409, "Esta sugestão já foi avaliada");
  }

  const dados = JSON.parse(sugestao.dados);
  const avaliar = db.transaction(() => {
    if (status === "aceita") {
      db.prepare("INSERT INTO catalogo_obras (dados) VALUES (?)").run(JSON.stringify(dados));
    }
    db.prepare(`
      UPDATE sugestoes_obras
      SET status = ?, mensagem_admin = ?, avaliado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status === "recusada" ? mensagem : null, id);
  });
  avaliar();

  res.json({ mensagem: status === "aceita" ? "Obra adicionada ao catálogo." : "Sugestão recusada." });
});

app.post("/notificacoes/inscricao", verificarToken, (req, res) => {
  const inscricao = req.body?.inscricao;

  if (
    !inscricao ||
    !inscricao.endpoint ||
    !inscricao.keys?.p256dh ||
    !inscricao.keys?.auth
  ) {
    return responderErro(res, 400, "Inscrição Push inválida.");
  }

  db.prepare(
    `
    INSERT INTO inscricoes_push (
      usuario_id, endpoint, p256dh, auth
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      usuario_id = excluded.usuario_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `,
  ).run(
    req.usuario.id,
    inscricao.endpoint,
    inscricao.keys.p256dh,
    inscricao.keys.auth,
  );

  res.json({ mensagem: "Inscrição Push salva." });
});

app.get("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const obra = db
    .prepare(
      `
      SELECT id, tipo
      FROM obras
      WHERE id = ? AND usuario_id = ?
    `,
    )
    .get(id, req.usuario.id);

  if (!obra) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  const registros = db
    .prepare(
      `
      SELECT tipo, dias_semana, dia_mes, hora
      FROM notificacoes
      WHERE obra_id = ? AND usuario_id = ?
    `,
    )
    .all(id, req.usuario.id);

  const configuracoes = {};

  registros.forEach((registro) => {
    configuracoes[registro.tipo] = {
      diasSemana: JSON.parse(registro.dias_semana || "[]"),
      diaMes: registro.dia_mes,
      hora: registro.hora,
    };
  });

  res.json(configuracoes);
});

app.put("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const obra = db
    .prepare(
      `
      SELECT id, tipo
      FROM obras
      WHERE id = ? AND usuario_id = ?
    `,
    )
    .get(id, req.usuario.id);

  if (!obra) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  const configuracoes = req.body?.configuracoes;

  if (!configuracoes || typeof configuracoes !== "object") {
    return responderErro(res, 400, "Configuração de notificações inválida");
  }

  const tiposPermitidos = [];

  if (obra.tipo === "anime" || obra.tipo === "ambos") {
    tiposPermitidos.push("anime");
  }

  if (obra.tipo === "manga" || obra.tipo === "ambos") {
    tiposPermitidos.push("manga");
  }

  const dados = [];

  for (const tipo of tiposPermitidos) {
    const configuracao = configuracoes[tipo];

    if (!configuracao?.ativo) {
      continue;
    }

    const diasSemana = Array.isArray(configuracao.diasSemana)
      ? [
          ...new Set(
            configuracao.diasSemana
              .map(Number)
              .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6),
          ),
        ]
      : [];

    let diaMes = configuracao.diaMes;

    if (diaMes === "" || diaMes === undefined || diaMes === null) {
      diaMes = null;
    } else {
      diaMes = Number(diaMes);

      if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) {
        return responderErro(res, 400, `Dia do mês inválido para ${tipo}.`);
      }
    }

    if (!diasSemana.length && diaMes === null) {
      return responderErro(
        res,
        400,
        `Escolha semanalmente ou mensalmente para ${tipo}.`,
      );
    }

    dados.push({
      tipo,
      diasSemana,
      diaMes,
      hora: configuracao.hora,
    });
  }

  if (!dados.length) {
    return responderErro(res, 400, "Ative pelo menos um tipo de notificação.");
  }

  const salvar = db.transaction((lista) => {
    db.prepare(
      `
      DELETE FROM notificacoes
      WHERE obra_id = ? AND usuario_id = ?
    `,
    ).run(id, req.usuario.id);

    const inserir = db.prepare(`
      INSERT INTO notificacoes (
        obra_id,
        usuario_id,
        tipo,
        dias_semana,
        dia_mes,
        hora
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    lista.forEach((configuracao) => {
      inserir.run(
        id,
        req.usuario.id,
        configuracao.tipo,
        JSON.stringify(configuracao.diasSemana),
        configuracao.diaMes,
        configuracao.hora,
      );
    });
  });

  salvar(dados);

  res.json({
    mensagem: "Notificações salvas",
  });
});

app.delete("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  db.prepare(
    `
    DELETE FROM notificacoes
    WHERE obra_id = ? AND usuario_id = ?
  `,
  ).run(id, req.usuario.id);

  res.json({
    mensagem: "Notificações desativadas",
  });
});

app.get("/obras/:id", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const obra = db
    .prepare(
      `
      SELECT
        o.*,
        EXISTS (
          SELECT 1
          FROM notificacoes n
          WHERE n.obra_id = o.id
            AND n.usuario_id = o.usuario_id
        ) AS notificacao_ativa
      FROM obras o
      WHERE o.id = ?
        AND o.usuario_id = ?
      `,
    )
    .get(id, req.usuario.id);

  if (!obra) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  res.json(obra);
});

app.post("/obras/migrar-legadas", verificarToken, (req, res) => {
  const resultado = db
    .prepare("UPDATE obras SET usuario_id = ? WHERE usuario_id IS NULL")
    .run(req.usuario.id);

  res.json({
    obrasImportadas: resultado.changes,
  });
});

function preservarProgresso(itensNovos, conteudoAtual, quantidadeKey) {
  if (!Array.isArray(itensNovos) || !conteudoAtual) {
    return itensNovos;
  }

  let itensAtuais;

  try {
    itensAtuais = JSON.parse(conteudoAtual);
  } catch (erro) {
    return itensNovos;
  }

  return itensNovos.map((itemNovo, indice) => {
    const itemAtual =
      itensAtuais.find((item) => item.numero === itemNovo.numero) ||
      itensAtuais[indice];

    if (!itemAtual || !Array.isArray(itemAtual.vistos)) {
      return {
        ...itemNovo,
        vistos: Array.isArray(itemNovo.vistos) ? itemNovo.vistos : [],
      };
    }

    return {
      ...itemNovo,
      vistos: itemAtual.vistos.filter((numero) => {
        if (quantidadeKey === "capitulos") {
          return numero >= itemNovo.inicio && numero <= itemNovo.fim;
        }

        const inicio =
          quantidadeKey === "episodios" ? Number(itemNovo.inicio) || 1 : 1;
        return numero >= inicio && numero < inicio + itemNovo[quantidadeKey];
      }),
    };
  });
}

app.post("/obras", verificarToken, async (req, res) => {
  const obra = req.body;

  const resultadoOrdem = db
    .prepare(
      `
    SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima_ordem
    FROM obras
    WHERE usuario_id = ?
  `,
    )
    .get(req.usuario.id);

  const ordem = resultadoOrdem.proxima_ordem;

  if (!obra.title) {
    return responderErro(res, 400, "O nome da obra é obrigatório");
  }

  if (!["anime", "manga", "ambos"].includes(obra.tipo)) {
    return responderErro(res, 400, "Selecione anime, mangá ou ambos");
  }

  const imagemArquivo =
    obra.imagem_arquivo || (await baixarImagemComoDataUrl(obra.imagem));

  const inserir = db.prepare(`
    INSERT INTO obras (
      title,
      usuario_id,
      ordem,
      tipo,
      status,
      imagem,
      imagem_arquivo,
      imagem_preferencia,
      link_leitura,
      link_leituras,
      temporadas,
      capitulos,
      volumes,
      titulos_alternativos,
      favorito,
      titulo_exibicao
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const resultado = inserir.run(
    obra.title,
    req.usuario.id,
    ordem,
    obra.tipo,
    obra.status,
    obra.imagem,
    imagemArquivo || null,
    obra.imagem_preferencia || "url",
    obra.link_leitura ? String(obra.link_leitura).trim() : null,
    Array.isArray(obra.link_leituras)
      ? JSON.stringify(obra.link_leituras)
      : "[]",
    obra.temporadas ? JSON.stringify(obra.temporadas) : null,
    obra.capitulos || null,
    obra.volumes ? JSON.stringify(obra.volumes) : null,
    obra.titulos_alternativos
      ? JSON.stringify(obra.titulos_alternativos)
      : "[]",
    obra.favorito || 0,
    obra.titulo_exibicao || "principal",
  );

  res.json({
    id: resultado.lastInsertRowid,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
    imagem_arquivo: imagemArquivo || null,
    imagem_preferencia: obra.imagem_preferencia || "url",
    link_leitura: obra.link_leitura ? String(obra.link_leitura).trim() : null,
    link_leituras: Array.isArray(obra.link_leituras) ? obra.link_leituras : [],
    temporadas: obra.temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: obra.volumes || null,
    titulos_alternativos: Array.isArray(obra.titulos_alternativos)
      ? obra.titulos_alternativos
      : [],
    favorito: obra.favorito || 0,
    titulo_exibicao: obra.titulo_exibicao || "principal",
    done: 0,
  });
});

app.get("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const obra = db
    .prepare(
      `
      SELECT id, tipo
      FROM obras
      WHERE id = ? AND usuario_id = ?
    `,
    )
    .get(id, req.usuario.id);

  if (!obra) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  const registros = db
    .prepare(
      `
      SELECT tipo, dias_semana, dia_mes
      FROM notificacoes
      WHERE obra_id = ? AND usuario_id = ?
    `,
    )
    .all(id, req.usuario.id);

  const configuracoes = {};

  registros.forEach((registro) => {
    configuracoes[registro.tipo] = {
      diasSemana: JSON.parse(registro.dias_semana || "[]"),
      diaMes: registro.dia_mes,
    };
  });

  res.json(configuracoes);
});

app.put("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const obra = db
    .prepare(
      `
      SELECT id, tipo
      FROM obras
      WHERE id = ? AND usuario_id = ?
    `,
    )
    .get(id, req.usuario.id);

  if (!obra) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  const configuracoes = req.body?.configuracoes;

  if (!configuracoes || typeof configuracoes !== "object") {
    return responderErro(res, 400, "Configuração de notificações inválida");
  }

  const tiposPermitidos = [];

  if (obra.tipo === "anime" || obra.tipo === "ambos") {
    tiposPermitidos.push("anime");
  }

  if (obra.tipo === "manga" || obra.tipo === "ambos") {
    tiposPermitidos.push("manga");
  }

  const tiposConfigurados = Object.keys(configuracoes).filter((tipo) =>
    tiposPermitidos.includes(tipo),
  );

  if (!tiposConfigurados.length) {
    return responderErro(
      res,
      400,
      "Configure pelo menos um tipo de notificação.",
    );
  }

  const dadosProntos = [];

  for (const tipo of tiposConfigurados) {
    const configuracao = configuracoes[tipo];

    const ativo = configuracao?.ativo === true;

    if (!ativo) {
      continue;
    }

    const hora = configuracao?.hora;

    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      return responderErro(
        res,
        400,
        `Informe um horário válido para ${tipo === "anime" ? "Anime" : "Mangá"}.`,
      );
    }

    // Tipo desativado não precisa de frequência.
    if (!ativo) {
      continue;
    }

    const diasSemana = Array.isArray(configuracao.diasSemana)
      ? [
          ...new Set(
            configuracao.diasSemana
              .map(Number)
              .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6),
          ),
        ]
      : [];

    let diaMes = configuracao.diaMes;

    if (diaMes === "" || diaMes === undefined || diaMes === null) {
      diaMes = null;
    } else {
      diaMes = Number(diaMes);

      if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) {
        return responderErro(res, 400, `Dia do mês inválido para ${tipo}.`);
      }
    }

    if (!diasSemana.length && diaMes === null) {
      return responderErro(
        res,
        400,
        `Configure semanalmente ou mensalmente para ${tipo}.`,
      );
    }

    dadosProntos.push({
      tipo,
      diasSemana,
      diaMes,
      hora,
    });
  }

  const salvar = db.transaction((dados) => {
    db.prepare(
      `
      DELETE FROM notificacoes
      WHERE obra_id = ? AND usuario_id = ?
    `,
    ).run(id, req.usuario.id);

    const inserir = db.prepare(`
      INSERT INTO notificacoes (
        obra_id,
        usuario_id,
        tipo,
        dias_semana,
        dia_mes, hora
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    dados.forEach((configuracao) => {
      inserir.run(
        id,
        req.usuario.id,
        configuracao.tipo,
        JSON.stringify(configuracao.diasSemana),
        configuracao.diaMes,
        configuracao.hora,
      );
    });
  });

  salvar(dadosProntos);

  res.json({
    mensagem: "Notificações salvas",
  });
});

app.put("/obras/:id", verificarToken, async (req, res) => {
  const id = req.params.id;
  const obra = req.body;

  if (!["anime", "manga", "ambos"].includes(obra.tipo)) {
    return responderErro(res, 400, "Selecione anime, mangá ou ambos");
  }

  const obraAtual = db
    .prepare(
      "SELECT tipo, temporadas, volumes FROM obras WHERE id = ? AND usuario_id = ?",
    )
    .get(id, req.usuario.id);

  const temporadas = ["anime", "ambos"].includes(obra.tipo)
    ? preservarProgresso(
        obra.temporadas,
        ["anime", "ambos"].includes(obraAtual?.tipo)
          ? obraAtual.temporadas
          : null,
        "episodios",
      )
    : null;

  const volumes = ["manga", "ambos"].includes(obra.tipo)
    ? preservarProgresso(
        obra.volumes,
        ["manga", "ambos"].includes(obraAtual?.tipo) ? obraAtual.volumes : null,
        "capitulos",
      )
    : null;

  const imagemArquivo =
    obra.imagem_arquivo || (await baixarImagemComoDataUrl(obra.imagem));

  const atualizar = db.prepare(`
    UPDATE obras
    SET
      title = ?,
      tipo = ?,
      status = ?,
      imagem = ?,
      imagem_arquivo = ?,
      imagem_preferencia = ?,
      link_leitura = ?,
      link_leituras = ?,
      temporadas = ?,
      capitulos = ?,
      volumes = ?,
      titulos_alternativos = ?,
      titulo_exibicao = ?
    WHERE id = ? AND usuario_id = ?
  `);

  const resultado = atualizar.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
    imagemArquivo || null,
    obra.imagem_preferencia || "url",
    obra.link_leitura ? String(obra.link_leitura).trim() : null,
    Array.isArray(obra.link_leituras)
      ? JSON.stringify(obra.link_leituras)
      : "[]",
    temporadas ? JSON.stringify(temporadas) : null,
    obra.capitulos || null,
    volumes ? JSON.stringify(volumes) : null,
    Array.isArray(obra.titulos_alternativos)
      ? JSON.stringify(obra.titulos_alternativos)
      : "[]",
    obra.titulo_exibicao || "principal",
    id,
    req.usuario.id,
  );

  if (resultado.changes === 0) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  res.json({
    id: id,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
    imagem_arquivo: imagemArquivo || null,
    imagem_preferencia: obra.imagem_preferencia || "url",
    link_leitura: obra.link_leitura ? String(obra.link_leitura).trim() : null,
    link_leituras: Array.isArray(obra.link_leituras) ? obra.link_leituras : [],
    temporadas: temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: volumes || null,
    titulos_alternativos: Array.isArray(obra.titulos_alternativos)
      ? obra.titulos_alternativos
      : [],
    titulo_exibicao: obra.titulo_exibicao || "principal",
    favorito: obra.favorito || 0,
  });
});

app.patch("/obras/:id/favorito", verificarToken, (req, res) => {
  const id = Number(req.params.id);
  const favorito = req.body.favorito ? 1 : 0;

  const atualizar = db.prepare(`
    UPDATE obras
    SET favorito = ?
    WHERE id = ? AND usuario_id = ?
  `);

  const resultado = atualizar.run(favorito, id, req.usuario.id);

  if (resultado.changes === 0) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  res.json({
    id,
    favorito,
  });
});

app.patch("/obras/ordem", verificarToken, (req, res) => {
  const { obras } = req.body;

  if (!Array.isArray(obras)) {
    return responderErro(res, 400, "Ordem das obras inválida");
  }

  const atualizarOrdem = db.prepare(`
    UPDATE obras
    SET ordem = ?
    WHERE id = ? AND usuario_id = ?
  `);

  const salvarOrdem = db.transaction((lista) => {
    lista.forEach((obra, indice) => {
      atualizarOrdem.run(indice + 1, obra.id, req.usuario.id);
    });
  });

  salvarOrdem(obras);
  normalizarOrdemDoUsuario(req.usuario.id);

  res.json({
    mensagem: "Ordem das obras atualizada",
  });
});

app.patch("/obras/:id", verificarToken, (req, res) => {
  const id = Number(req.params.id);
  const obra = req.body;

  const campos = [];
  const valores = [];

  if (obra.temporadas !== undefined) {
    campos.push("temporadas = ?");
    valores.push(JSON.stringify(obra.temporadas));
  }

  if (obra.volumes !== undefined) {
    campos.push("volumes = ?");
    valores.push(JSON.stringify(obra.volumes));
  }

  if (campos.length > 0) {
    valores.push(id, req.usuario.id);
    const resultado = db
      .prepare(
        `
      UPDATE obras
      SET ${campos.join(", ")}
      WHERE id = ? AND usuario_id = ?
    `,
      )
      .run(...valores);

    if (resultado.changes === 0) {
      return responderErro(res, 404, "Obra não encontrada");
    }
  }

  if (obra.done !== undefined) {
    const atualizarConclusao = db.prepare(`
      UPDATE obras
      SET done = ?
      WHERE id = ? AND usuario_id = ?
    `);

    const resultado = atualizarConclusao.run(obra.done, id, req.usuario.id);

    if (resultado.changes === 0) {
      return responderErro(res, 404, "Obra não encontrada");
    }
  }

  res.json({
    id: Number(id),
    done: obra.done,
    temporadas: obra.temporadas,
    volumes: obra.volumes,
  });
});

app.delete("/obras/:id", verificarToken, (req, res) => {
  const id = req.params.id;

  const apagar = db.prepare(`
        DELETE FROM obras
        WHERE id = ? AND usuario_id = ?
    `);

  const resultado = apagar.run(id, req.usuario.id);

  if (resultado.changes === 0) {
    return responderErro(res, 404, "Obra não encontrada");
  }

  res.json({
    mensagem: "Obra apagada",
  });
});

app.delete("/obras/:id/notificacoes", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  const resultado = db
    .prepare(
      `
      DELETE FROM notificacoes
      WHERE obra_id = ? AND usuario_id = ?
    `,
    )
    .run(id, req.usuario.id);

  if (resultado.changes === 0) {
    return responderErro(
      res,
      404,
      "Nenhuma notificação encontrada para esta obra.",
    );
  }

  res.json({
    mensagem: "Notificações desativadas",
  });
});

app.use(tratarErro);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const servidor = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });

  servidor.on("error", (erro) => {
    if (erro.code === "EADDRINUSE") {
      console.error(`A porta ${PORT} já está em uso por outro servidor.`);
      servidor.close();
      process.exitCode = 1;
      return;
    }

    throw erro;
  });
}

module.exports = { app, db };
