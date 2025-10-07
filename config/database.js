const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const isPackaged = process.pkg !== undefined;
const dbPath = isPackaged 
    ? path.join(process.cwd(), 'data', 'users.db') 
    : path.join(__dirname, '../data', 'users.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Error opening database:", err.message);
    else console.log("Connected to SQLite FlashArray Database.");
});

// Ensure required tables exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        username TEXT, 
        password TEXT)
        `);
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT NOT NULL)`
        );
    db.run(`CREATE TABLE IF NOT EXISTS restored_volumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_name TEXT NOT NULL,
        snapshot_name TEXT NOT NULL,
        serial TEXT NOT NULL UNIQUE,
        lun INTEGER NOT NULL,
        status TEXT )`
        );
});

module.exports = db;
