const express = require("express");
const Database = require("better-sqlite3");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const db = new Database(process.env.DB_PATH || "obras.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
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

app.get("/obras", (req, res) => {
  const obras = db
    .prepare(
      `
        SELECT * FROM obras
    `,
    )
    .all();

  res.json(obras);
});

app.get("/obras/:id", (req, res) => {
  const id = req.params.id;

  const obra = db
    .prepare(
      `
    SELECT * FROM obras
    WHERE id = ?
  `,
    )
    .get(id);

  res.json(obra);
});

app.post("/obras", (req, res) => {
  const obra = req.body;

  if (!obra.title) {
    return res.status(400).json({
      erro: "O nome da obra é obrigatório",
    });
  }

  const inserir = db.prepare(`
    INSERT INTO obras (
      title,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const resultado = inserir.run(
    obra.title,
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

app.put("/obras/:id", (req, res) => {
  const id = req.params.id;
  const obra = req.body;

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
    WHERE id = ?
  `);

  const resultado = atualizar.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
    obra.imagem_arquivo || null,
    obra.imagem_preferencia || "url",
    obra.link_leitura ? String(obra.link_leitura).trim() : null,
    obra.temporadas ? JSON.stringify(obra.temporadas) : null,
    obra.capitulos || null,
    obra.volumes ? JSON.stringify(obra.volumes) : null,
    id,
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
    temporadas: obra.temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: obra.volumes || null,
  });
});

app.patch("/obras/:id", (req, res) => {
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
    valores.push(id);
    db.prepare(
      `
      UPDATE obras
      SET ${campos.join(", ")}
      WHERE id = ?
    `,
    ).run(...valores);
  }

  if (obra.done !== undefined) {
    const atualizarConclusao = db.prepare(`
      UPDATE obras
      SET done = ?
      WHERE id = ?
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

app.delete("/obras/:id", (req, res) => {
  const id = req.params.id;

  const apagar = db.prepare(`
        DELETE FROM obras
        WHERE id = ?
    `);

  apagar.run(id);

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
