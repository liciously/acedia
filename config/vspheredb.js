const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const isPackaged = process.pkg !== undefined;
const dbPath = isPackaged 
    ? path.join(process.cwd(), 'data', 'vsphere.db') 
    : path.join(__dirname, '../data', 'vsphere.db');

console.log(dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Error opening database:", err.message);
    else console.log("Connected to SQLite - vsphere database.");
});
// Initialize tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS vmhosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        connection_state TEXT,
        cpu INTEGER,
        memory REAL
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS datastores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        capacity_gb REAL,
        used_gb REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        power_state TEXT,
        cpu INTEGER,
        memory REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS presented_volumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_name TEXT NOT NULL,
        serial TEXT NOT NULL UNIQUE,
        lun INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS checked_volumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_name TEXT NOT NULL,
        canonical TEXT NOT NULL UNIQUE,
        status INTEGER NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS presented_datastores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datastore_name TEXT NOT NULL,
        canonical TEXT NOT NULL UNIQUE,
        status INTEGER NOT NULL
    )`);
    db.run(`
        CREATE TABLE IF NOT EXISTS datastore_details (
            datastore_name TEXT PRIMARY KEY
        );
    `);

    // 🟢 Table: datastore_folders (Stores folders per datastore)
    db.run(`
        CREATE TABLE IF NOT EXISTS datastore_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datastore_name TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            FOREIGN KEY (datastore_name) REFERENCES datastore_details(datastore_name) ON DELETE CASCADE
            UNIQUE(folder_path)
        );
    `);

    // 🟢 Table: datastore_vmx_files (Stores .vmx files per folder)
    db.run(`
        CREATE TABLE IF NOT EXISTS datastore_vmx_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datastore_name TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            vmx_file_name TEXT NOT NULL,
            vmx_path TEXT NOT NULL,
            status TEXT DEFAULT 'unregistered',
            FOREIGN KEY (datastore_name) REFERENCES datastore_details(datastore_name) ON DELETE CASCADE,
            FOREIGN KEY (folder_path) REFERENCES datastore_folders(folder_path) ON DELETE CASCADE
            UNIQUE(datastore_name, folder_path, vmx_file_name, vmx_path)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS registered_vm (
            vm_name TEXT,
            vmx_path TEXT PRIMARY KEY,
            status TEXT,
            nic1_vlan TEXT DEFAULT 'not connected',
            nic2_vlan TEXT DEFAULT 'not connected'
        );

    `);

    db.run(`
       CREATE TABLE IF NOT EXISTS last_configured_vms_nic (
           vm_name TEXT PRIMARY KEY,
           nic1_vlan TEXT DEFAULT 'not connected',
           nic2_vlan TEXT DEFAULT 'not connected',
           FOREIGN KEY (vm_name) REFERENCES registered_vm(vm_name) ON DELETE CASCADE ON UPDATE CASCADE
       );
    `);



});

module.exports = db;
