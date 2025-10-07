const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../config/vsphere.db');

// Function to insert/update VM Hosts
async function storeVMHosts(vmhosts) {
    const insertQuery = `
        INSERT INTO vmhosts (name, connection_state, cpu, memory) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
        connection_state=excluded.connection_state, 
        cpu=excluded.cpu, 
        memory=excluded.memory;
    `;

    vmhosts.forEach(host => {
        db.run(insertQuery, [host.Name, host.ConnectionState, host.CPU, host.Memory], (err) => {
            if (err) console.error("DB Insert Error (VM Hosts):", err);
        });
    });
}

// Fetch VM Hosts and store in DB
async function getVMHosts(req, res) {
    try {
        const vmhosts = await fetchVMHosts(); // Your function to fetch from vSphere
        await storeVMHosts(vmhosts);

        res.json({ success: true, vmhosts });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
}

module.exports = { getVMHosts };

async function storeDatastores(datastores) {
    const insertQuery = `
        INSERT INTO datastores (name, capacity_gb, used_gb) 
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
        capacity_gb=excluded.capacity_gb, 
        used_gb=excluded.used_gb;
    `;

    datastores.forEach(ds => {
        db.run(insertQuery, [ds.Name, ds.CapacityGB, ds.UsedGB], (err) => {
            if (err) console.error("DB Insert Error (Datastores):", err);
        });
    });
}

async function getDatastores(req, res) {
    try {
        const datastores = await fetchDatastores(); // Your function to fetch from vSphere
        await storeDatastores(datastores);

        res.json({ success: true, datastores });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
}

module.exports = { getDatastores };

async function storeVMs(vms) {
    const insertQuery = `
        INSERT INTO vms (name, power_state, cpu, memory) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
        power_state=excluded.power_state, 
        cpu=excluded.cpu, 
        memory=excluded.memory;
    `;

    vms.forEach(vm => {
        db.run(insertQuery, [vm.Name, vm.PowerState, vm.CPU, vm.Memory], (err) => {
            if (err) console.error("DB Insert Error (VMs):", err);
        });
    });
}

async function getVMs(req, res) {
    try {
        const vms = await fetchVMs(); // Your function to fetch from vSphere
        await storeVMs(vms);

        res.json({ success: true, vms });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
}

module.exports = { getVMs };

