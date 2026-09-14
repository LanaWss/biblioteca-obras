const express = require("express");
const Database = require("better-sqlite3");

const app = express();

app.use(express.json());
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
    temporadas TEXT,
    capitulos INTEGER
  );
`);

for (const coluna of [
  "ALTER TABLE obras ADD COLUMN temporadas TEXT",
  "ALTER TABLE obras ADD COLUMN capitulos INTEGER",
  "ALTER TABLE obras ADD COLUMN volumes TEXT",
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

  const obra = db.prepare(`
    SELECT * FROM obras
    WHERE id = ?
  `).get(id);

  res.json(obra);
});

app.post("/obras", (req, res) => {
  const obra = req.body;

  const inserir = db.prepare(`
    INSERT INTO obras (
      title,
      tipo,
      status,
      imagem,
      temporadas,
      capitulos,
      volumes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const resultado = inserir.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
    obra.temporadas ? JSON.stringify(obra.temporadas) : null,
    obra.capitulos || null,
    obra.volumes ? JSON.stringify(obra.volumes) : null
  );

  res.json({
    id: resultado.lastInsertRowid,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
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
      temporadas = ?,
      capitulos = ?,
      volumes = ?
    WHERE id = ?
  `);

  atualizar.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
    obra.temporadas ? JSON.stringify(obra.temporadas) : null,
    obra.capitulos || null,
    obra.volumes ? JSON.stringify(obra.volumes) : null,
    id
  );

  res.json({
    id: id,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
    temporadas: obra.temporadas || null,
    capitulos: obra.capitulos || null,
    volumes: obra.volumes || null,
  });
});


app.patch("/obras/:id", (req, res) => {
  const id = req.params.id;
  const obra = req.body;

  if (obra.temporadas !== undefined || obra.volumes !== undefined) {
    const atualizarProgresso = db.prepare(`
      UPDATE obras
      SET temporadas = ?, volumes = ?
      WHERE id = ?
    `);

    atualizarProgresso.run(
      obra.temporadas !== undefined ? JSON.stringify(obra.temporadas) : null,
      obra.volumes !== undefined ? JSON.stringify(obra.volumes) : null,
      id,
    );
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
    id: id,
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});