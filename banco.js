const Database = require("better-sqlite3");

const db = new Database("obras.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS obras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0
    );
`);

const inserir = db.prepare(`
    INSERT INTO obras (title)
    VALUES (?)
`);

inserir.run("Aprender SQLite");

const obras = db.prepare(`
    SELECT * FROM obras
`).all();

console.log(obras);