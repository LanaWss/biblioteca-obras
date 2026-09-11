const Database = require("better-sqlite3");

const db = new Database("obras.db");

db.exec(`
    ALTER TABLE obras ADD COLUMN tipo TEXT;
    ALTER TABLE obras ADD COLUMN status TEXT;
    ALTER TABLE obras ADD COLUMN imagem TEXT;
`);

console.log("Banco atualizado!");