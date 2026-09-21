const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();

const VERSAO_TERMOS = "1.0";
const VERSAO_PRIVACIDADE = "1.0";

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

function tratarErro(erro, req, res, next) {
  if (res.headersSent) {
    return next(erro);
  }

  if (erro.type === "entity.parse.failed") {
    return responderErro(res, 400, "JSON inválido");
  }

  const status = erro instanceof ErroAplicacao ? erro.status : 500;
  const mensagem =
    status >= 500 ? "Erro interno do servidor" : erro.message;

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

const caminhoBanco =
  process.env.DB_PATH || path.join(__dirname, "obras.db");
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
    temporadas TEXT,
    capitulos INTEGER
  );
`);

for (const coluna of [
  "ALTER TABLE obras ADD COLUMN usuario_id INTEGER",
  "ALTER TABLE obras ADD COLUMN temporadas TEXT",
  "ALTER TABLE obras ADD COLUMN capitulos INTEGER",
  "ALTER TABLE obras ADD COLUMN volumes TEXT",
  "ALTER TABLE obras ADD COLUMN imagem_arquivo TEXT",
  "ALTER TABLE obras ADD COLUMN imagem_preferencia TEXT DEFAULT 'url'",
  "ALTER TABLE obras ADD COLUMN link_leitura TEXT",
]) {
  try {
    db.exec(coluna);
  } catch (erro) {
    // A coluna já existe
  }
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

  db.prepare(
    "UPDATE obras SET usuario_id = ? WHERE usuario_id IS NULL",
  ).run(usuario.id);

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
    .prepare(`
      SELECT *
      FROM obras
      WHERE usuario_id = ?
    `)
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

        const inicio = quantidadeKey === "episodios" ? Number(itemNovo.inicio) || 1 : 1;
        return numero >= inicio && numero < inicio + itemNovo[quantidadeKey];
      }),
    };
  });
}

app.post("/obras", verificarToken, (req, res) => {
  const obra = req.body;

  if (!obra.title) {
    return responderErro(res, 400, "O nome da obra é obrigatório");
  }

  const inserir = db.prepare(`
    INSERT INTO obras (
      title,
      usuario_id,
      tipo,
      status,
      imagem,
      imagem_arquivo,
      imagem_preferencia,
      link_leitura,
      temporadas,
      capitulos,
      volumes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const resultado = inserir.run(
    obra.title,
    req.usuario.id,
    obra.tipo,
    obra.status,
    obra.imagem,
    obra.imagem_arquivo || null,
    obra.imagem_preferencia || "url",
    obra.link_leitura ? String(obra.link_leitura).trim() : null,
    obra.temporadas ? JSON.stringify(obra.temporadas) : null,
    obra.capitulos || null,
    obra.volumes ? JSON.stringify(obra.volumes) : null,
  );

  res.json({
    id: resultado.lastInsertRowid,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
    imagem_arquivo: obra.imagem_arquivo || null,
    imagem_preferencia: obra.imagem_preferencia || "url",
    link_leitura: obra.link_leitura ? String(obra.link_leitura).trim() : null,
    temporadas: obra.temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: obra.volumes || null,
    done: 0,
  });
});

app.put("/obras/:id", verificarToken, (req, res) => {
  const id = req.params.id;
  const obra = req.body;
  const obraAtual = db
    .prepare("SELECT tipo, temporadas, volumes FROM obras WHERE id = ? AND usuario_id = ?")
    .get(id, req.usuario.id);

  const temporadas =
    obra.tipo === "anime"
      ? preservarProgresso(
          obra.temporadas,
          obraAtual?.tipo === "anime" ? obraAtual.temporadas : null,
          "episodios",
        )
      : null;

  const volumes =
    obra.tipo === "manga"
      ? preservarProgresso(
          obra.volumes,
          obraAtual?.tipo === "manga" ? obraAtual.volumes : null,
          "capitulos",
        )
      : null;

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
      temporadas = ?,
      capitulos = ?,
      volumes = ?
    WHERE id = ? AND usuario_id = ?
  `);

  const resultado = atualizar.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
    obra.imagem_arquivo || null,
    obra.imagem_preferencia || "url",
    obra.link_leitura ? String(obra.link_leitura).trim() : null,
    temporadas ? JSON.stringify(temporadas) : null,
    obra.capitulos || null,
    volumes ? JSON.stringify(volumes) : null,
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
    imagem_arquivo: obra.imagem_arquivo || null,
    imagem_preferencia: obra.imagem_preferencia || "url",
    link_leitura: obra.link_leitura ? String(obra.link_leitura).trim() : null,
    temporadas: temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: volumes || null,
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
    const resultado = db.prepare(
      `
      UPDATE obras
      SET ${campos.join(", ")}
      WHERE id = ? AND usuario_id = ?
    `,
    ).run(...valores);

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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = { app, db };
