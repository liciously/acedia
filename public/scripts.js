document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔄 Fetching VM Hosts, Datastores, and VMs on page load...");
    await fetchVMHosts();
    //await fetchDatastores();
    //await fetchVMs();
});

async function fetchVMHosts(forceReload = false) {
    try {
        const url = forceReload ? "/vsphere/vmhosts?forceRefresh=true" : "/vsphere/vmhosts";
        const response = await fetch(url);
        const data = await response.json();

        const tableBody = document.getElementById("vmhost-list");
        tableBody.innerHTML = ""; // Clear previous data

        if (!data.success) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">${data.error}</td></tr>`;
            return;
        }

        if (data.vmhosts.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No VM Hosts found.</td></tr>`;
            return;
        }

        data.vmhosts.forEach(host => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${host.name}</td><td>${host.connection_state}</td><td>${host.cpu}</td><td>${host.memory}</td>`;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error fetching VM Hosts:", err);
        document.getElementById("vmhost-list").innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading VM Hosts.</td></tr>`;
    }
}

async function rescanStorage() {
    const rescanBtn = document.getElementById("rescanBtn");
    const loadingSpinner = document.getElementById("loadingSpinner");

    // Disable button and show spinner
    rescanBtn.disabled = true;
    loadingSpinner.style.display = "inline-block";

    try {
        const response = await fetch("/vsphere/rescan_storage", { method: "POST" });
        const result = await response.json();

        if (result.success) {
            alert("✅ Storage rescan completed!");
        } else {
            alert("❌ Storage rescan failed: " + result.message);
        }
    } catch (error) {
        console.error("Error during rescan:", error);
        alert("❌ Error: Could not complete the rescan.");
    } finally {
        // Re-enable button and hide spinner
        rescanBtn.disabled = false;
        loadingSpinner.style.display = "none";
    }
}




async function fetchDatastores() {
    try {
        const response = await fetch("/vsphere/datastores");
        const data = await response.json();
        if (data.success) {
            const tableBody = document.getElementById("datastore-list");
            tableBody.innerHTML = "";
            data.datastores.forEach(ds => {
                const row = document.createElement("tr");
                row.innerHTML = `<td>${ds.Name}</td><td>${ds.CapacityGB}</td><td>${ds.UsedGB}</td>`;
                tableBody.appendChild(row);
            });
        } else {
            alert("Failed to fetch Datastores: " + data.error);
        }
    } catch (err) {
        console.error("Error fetching Datastores:", err);
    }
}

async function fetchVMs() {
    try {
        const response = await fetch("/vsphere/vms");
        const data = await response.json();
        
        const tableBody = document.getElementById("vm-list");
        tableBody.innerHTML = ""; // Clear previous data

        if (!data.success) {
            // Show error message if the backend reports a failure
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">${data.error}</td></tr>`;
            return;
        }

        if (data.vms.length === 0) {
            // This case should no longer happen due to backend fix, but added for extra safety
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No Virtual Machines found.</td></tr>`;
            return;
        }

        // Populate table if VMs exist
        data.vms.forEach(vm => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${vm.Name}</td><td>${vm.PowerState}</td><td>${vm.CPU}</td><td>${vm.Memory}</td>`;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error fetching Virtual Machines:", err);
        document.getElementById("vm-list").innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading VMs.</td></tr>`;
    }
}


