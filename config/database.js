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
    // Create a single default table for backwards compatibility
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT NOT NULL)`
        );
    // Also create environment-specific protection group tables so each
    // environment can store its own list if needed.
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups_jkt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups_sby (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups_ini (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS restored_volumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_name TEXT NOT NULL,
        snapshot_name TEXT NOT NULL,
        serial TEXT NOT NULL UNIQUE,
        lun INTEGER NOT NULL,
        status TEXT )`
        );
});

    // Helper to return the protection groups table name for an environment.
    // Returns legacy 'protection_groups' when env is not specified to preserve
    // backward compatibility with existing data and queries.
    db.getProtectionTableName = function (env) {
        if (!env) return 'protection_groups';
        const e = String(env).toLowerCase();
        if (e === 'jkt') return 'protection_groups_jkt';
        if (e === 'sby') return 'protection_groups_sby';
        if (e === 'ini') return 'protection_groups_ini';
        return 'protection_groups';
    };

module.exports = db;
