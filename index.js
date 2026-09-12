const express = require("express");
const Database = require("better-sqlite3");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const db = new Database(process.env.DB_PATH || "obras.db");

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

app.post("/obras", (req, res) => {
  const obra = req.body;

  const inserir = db.prepare(`
    INSERT INTO obras (title, tipo, status, imagem)
    VALUES (?, ?, ?, ?)
`);

  const resultado = inserir.run(
    obra.title,
    obra.tipo,
    obra.status,
    obra.imagem,
  );

  res.json({
    id: resultado.lastInsertRowid,
    title: obra.title,
    tipo: obra.tipo,
    status: obra.status,
    imagem: obra.imagem,
    done: 0,
  });
});

app.put("/obras/:id", (req, res) => {
  const id = req.params.id;
  const obra = req.body;

  const atualizar = db.prepare(`
        UPDATE obras
        SET title = ?
        WHERE id = ?
    `);

  atualizar.run(obra.title, id);

  res.json({
    id: id,
    title: obra.title,
  });
});

app.patch("/obras/:id", (req, res) => {
  const id = req.params.id;
  const obra = req.body;

  const atualizar = db.prepare(`
        UPDATE obras
        SET done = ?
        WHERE id = ?
    `);

  atualizar.run(obra.done, id);

  res.json({
    id: id,
    done: obra.done,
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