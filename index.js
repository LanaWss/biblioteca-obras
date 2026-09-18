const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

function verificarToken(req, res, next) {
  const autorizacao = req.headers.authorization;

  if (!autorizacao) {
    return res.status(401).json({
      erro: "Token não informado",
    });
  }

  const token = autorizacao.split(" ")[1];

  try {
    const usuario = jwt.verify(token, "chave-secreta");

    req.usuario = usuario;

    next();
  } catch (erro) {
    return res.status(401).json({
      erro: "Token inválido",
    });
  }
}

const db = new Database(process.env.DB_PATH || "obras.db");

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
    senha TEXT NOT NULL
  );
`);

app.post("/usuarios", async (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({
      erro: "Nome, email e senha são obrigatórios",
    });
  }

  try {
    const inserir = db.prepare(`
      INSERT INTO usuarios (nome, email, senha)
      VALUES (?, ?, ?)
    `);

    const senhaHash = await bcrypt.hash(senha, 10);

    const resultado = inserir.run(nome, email, senhaHash);

    res.json({
      id: resultado.lastInsertRowid,
      nome,
      email,
    });
  } catch (erro) {
    if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({
        erro: "Este email já está cadastrado",
      });
    }

    res.status(500).json({
      erro: "Erro ao criar usuário",
    });
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({
      erro: "Email e senha são obrigatórios",
    });
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
    return res.status(401).json({
      erro: "Email ou senha incorretos",
    });
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

  if (!senhaCorreta) {
    return res.status(401).json({
      erro: "Email ou senha incorretos",
    });
  }

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

        return numero >= 1 && numero <= itemNovo[quantidadeKey];
      }),
    };
  });
}

app.post("/obras", verificarToken, (req, res) => {
  const obra = req.body;

  if (!obra.title) {
    return res.status(400).json({
      erro: "O nome da obra é obrigatório",
    });
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
    return res.status(404).json({
      erro: "Obra não encontrada",
    });
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
    db.prepare(
      `
      UPDATE obras
      SET ${campos.join(", ")}
      WHERE id = ? AND usuario_id = ?
    `,
    ).run(...valores);
  }

  if (obra.done !== undefined) {
    const atualizarConclusao = db.prepare(`
      UPDATE obras
      SET done = ?
      WHERE id = ? AND usuario_id = ?
    `);

    atualizarConclusao.run(obra.done, id);
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

  apagar.run(id, req.usuario.id);

  res.json({
    mensagem: "Obra apagada",
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = { app, db };
