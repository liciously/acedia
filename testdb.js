const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const vsphereDBPath = path.resolve(__dirname, 'vsphere.db');
const pureStorageDBPath = path.resolve(__dirname, 'purestorage.db');

const vsphereDB = new sqlite3.Database(vsphereDBPath, (err) => {
    if (err) return console.error("❌ vSphere DB Connection Failed:", err.message);
    console.log("✅ vSphere DB Connected Successfully.");
    vsphereDB.close();
});

const pureStorageDB = new sqlite3.Database(pureStorageDBPath, (err) => {
    if (err) return console.error("❌ Pure Storage DB Connection Failed:", err.message);
    console.log("✅ Pure Storage DB Connected Successfully.");
    pureStorageDB.close();
});
