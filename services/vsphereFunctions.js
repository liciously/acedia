// Use shared vsphere DB module which exposes helper functions
const db = require('../config/vspheredb');

// Function to insert/update VM Hosts
// storeVMHosts stores/updates vmhosts into the specified tableName (default: 'vmhosts')
async function storeVMHosts(vmhosts, tableName = 'vmhosts') {
    const insertQuery = `
        INSERT INTO ${tableName} (name, connection_state, cpu, memory) 
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
        const tableName = db.getVMHostsTableName(req.session && req.session.environment);
        await storeVMHosts(vmhosts, tableName);

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

