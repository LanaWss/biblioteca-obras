const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();

const VERSAO_TERMOS = "1.0";
const VERSAO_PRIVACIDADE = "1.0";
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;

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

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    termos_aceitos INTEGER NOT NULL DEFAULT 0,
    versao_termos TEXT,
    versao_privacidade TEXT,
    data_aceite TEXT
  );
`);

for (const coluna of [
  "ALTER TABLE usuarios ADD COLUMN termos_aceitos INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usuarios ADD COLUMN versao_termos TEXT",
  "ALTER TABLE usuarios ADD COLUMN versao_privacidade TEXT",
  "ALTER TABLE usuarios ADD COLUMN data_aceite TEXT",
]) {
  try {
    db.exec(coluna);
  } catch (erro) {
    // A coluna já existe
  }
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
        data_aceite
      )
      VALUES (?, ?, ?, 1, ?, ?, ?)
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
  });
});

app.get("/obras", verificarToken, (req, res) => {
  const obras = db
    .prepare(
      `
      SELECT *
      FROM obras
      WHERE usuario_id = ?
      ORDER BY ordem ASC, id ASC
    `,
    )
    .all(req.usuario.id);

  res.json(obras);
});

app.get("/obras/:id", verificarToken, (req, res) => {
  const id = req.params.id;

  const obra = db
    .prepare(
      `
    SELECT * FROM obras
    WHERE id = ? AND usuario_id = ?
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
