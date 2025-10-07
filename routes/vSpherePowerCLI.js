const express = require("express");
const { spawn } = require("child_process");
require("dotenv").config({ path: "./ini.env" });

const db = require("../config/vsphereDB");  // Import SQLite setup
const multer = require("multer");
const csvParser = require("csv-parser");
const fs = require("fs");
const upload = multer({ dest: "../uploads/" });


const router = express.Router();


router.get("/", (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('layout', { 
        title: 'vSphere Dashboard',
        vcenterName: process.env.VCENTER_NAME,
        vcenterIP: process.env.VCENTER_IP
    });
});

// Load vCenter credentials
const vCenterIP = process.env.VCENTER_IP;
const vCenterUser = process.env.VCENTER_USER;
const vCenterPass = process.env.VCENTER_PASS;
const vCenterDC = process.env.VCENTER_DATACENTER;

function runPowerCLICommand(command, callback) {
    console.log("⚡ Running PowerCLI Command:\n", command);

    const fullCommand = `
        Set-PowerCLIConfiguration -DefaultVIServerMode Single -Confirm:\$false | Out-Null;
        if (-not $global:DefaultVIServer) { 
            Write-Output "🔄 Not connected. Connecting..."; 
            Connect-VIServer -Server ${vCenterIP} -User ${vCenterUser} -Password ${vCenterPass} -WarningAction Ignore; 
        }
        ${command}
    `;

    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", fullCommand]);

    let output = "";
    let error = "";

    child.stdout.on("data", (data) => {
        output += data.toString();
        console.log("📜 PowerCLI Output:", data.toString().trim());
    });

    child.stderr.on("data", (data) => {
        error += data.toString();
        console.error("❌ PowerCLI Error:", data.toString().trim());
    });

    child.on("close", (code) => {
        console.log(`⚙️ PowerCLI Process Exited with Code: ${code}`);
        if (code === 0) {
            callback(null, output.trim());
        } else {
            callback(error.trim(), null);
        }
    });
}


// Get list of ESXi Hosts
router.get("/vmhosts", (req, res) => {
    const forceRefresh = req.query.forceRefresh === "true"; // Check if reload is triggered

    if (!forceRefresh) {
        // Normal case: Check if DB has existing data
        db.all("SELECT name, connection_state, cpu, memory FROM vmhosts", (err, rows) => {
            if (err) {
                return res.json({ success: false, error: "Database query failed." });
            }

            if (rows.length > 0) {
                return res.json({ success: true, vmhosts: rows });
            }

            // If no data exists, proceed to PowerCLI execution
            vmHostsFromPowerCLI(res);
        });
    } else {
        // Forced reload: Bypass DB and fetch fresh data from PowerCLI
        vmHostsFromPowerCLI(res);
    }
});

function vmHostsFromPowerCLI(res){
    const command = `
        $vmHosts = Get-Cluster -Name PGD-JKT-SRD-01 | Get-VMHost | 
        Select-Object Name, @{Name="ConnectionState"; Expression={$_.ConnectionState.ToString()}}, 
                      @{Name='CPU';Expression={$_.NumCpu}}, 
                      @{Name='Memory';Expression={[math]::round($_.MemoryTotalGB, 2)}}
        $vmHosts | ConvertTo-Json -Depth 1
    `;
    runPowerCLICommand(command, (err, output) => {
        if (err) return res.json({ success: false, error: "Failed to fetch VM hosts." });

        let lines = output.trim().split("\n");
        let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
        if (jsonStartIndex === -1) return res.json({ success: false, error: "Parsing error. No valid JSON found." });

        let cleanOutput = lines.slice(jsonStartIndex).join("\n");

        try {
            const vmHosts = JSON.parse(cleanOutput);
            const hostList = Array.isArray(vmHosts) ? vmHosts : [vmHosts];

            // Insert or update DB
            const insertStmt = db.prepare(`
                INSERT INTO vmhosts (name, connection_state, cpu, memory) 
                VALUES (?, ?, ?, ?) 
                ON CONFLICT(name) DO UPDATE SET 
                    connection_state = excluded.connection_state, 
                    cpu = excluded.cpu, 
                    memory = excluded.memory
            `);

            hostList.forEach(host => {
                insertStmt.run(host.Name, host.ConnectionState, host.CPU, host.Memory);
            });

            insertStmt.finalize();
            res.json({ success: true, vmhosts: hostList });

        } catch (parseError) {
            console.error("❌ JSON Parsing Error:", parseError);
            res.json({ success: false, error: "Parsing error." });
        }
    });
}

// Get list of Datastores
router.get("/datastores", (req, res) => {

    const forceRefresh = req.query.forceRefresh === "true"; // Check if reload is triggered

    if (!forceRefresh) {
        // Normal case: Check if DB has existing data
        db.all("SELECT name, capacity_gb, used_gb FROM datastores", (err, rows) => {
            if (err) {
                return res.json({ success: false, error: "Database query failed." });
            }

            if (rows.length > 0) {
                return res.json({ success: true, vmhosts: rows });
            }

            // If no data exists, proceed to PowerCLI execution
            dsFromPowerCLI(res);
        });
    } else {
        // Forced reload: Bypass DB and fetch fresh data from PowerCLI
        dsFromPowerCLI(res);
    }

});

function dsFromPowerCLI(res){
    const command = `
        $datastores = Get-Datastore | Where {$_.Name -like "DATASTORE-DEV*"} 
        Select-Object Name, @{Name="CapacityGB"; Expression={[math]::round($_.CapacityGB, 2)}}, 
                        @{Name="UsedGB"; Expression={[math]::round($_.UsedSpaceGB, 2)}}
        $datastores | ConvertTo-Json -Depth 1
    `;

    runPowerCLICommand(command, (err, output) => {
        if (err) return res.json({ success: false, error: "Failed to fetch Datastores." });

        let lines = output.trim().split("\n");
        let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
        if (jsonStartIndex === -1) return res.json({ success: false, error: "Parsing error. No valid JSON found." });

        let cleanOutput = lines.slice(jsonStartIndex).join("\n");

        try {
            const datastores = JSON.parse(cleanOutput);
            const dsList = Array.isArray(datastores) ? datastores : [datastores];

            // Insert or update DB
            const insertStmt = db.prepare(`
                INSERT INTO datastores (name, capacity_gb, used_gb) 
                VALUES (?, ?, ?) 
                ON CONFLICT(name) DO UPDATE SET 
                    capacity_gb = excluded.capacity_gb, 
                    used_gb = excluded.used_gb
            `);

            dsList.forEach(ds => {
                insertStmt.run(ds.Name, ds.CapacityGB, ds.UsedGB);
            });

            insertStmt.finalize();
            res.json({ success: true, datastores: dsList });

        } catch (parseError) {
            console.error("❌ JSON Parsing Error:", parseError);
            res.json({ success: false, error: "Parsing error." });
        }
    });
}


// Get list of Virtual Machines
router.get("/vms", (req, res) => {
    const forceRefresh = req.query.forceRefresh === "true"; // Check if reload is triggered

    if (!forceRefresh) {
        // Normal case: Check if DB has existing data
        db.all("SELECT name, power_state, cpu, memory FROM vms", (err, rows) => {
            if (err) {
                return res.json({ success: false, error: "Database query failed." });
            }

            if (rows.length > 0) {
                return res.json({ success: true, vmhosts: rows });
            }

            // If no data exists, proceed to PowerCLI execution
            vmsFromPowerCLI(res);
        });
    } else {
        // Forced reload: Bypass DB and fetch fresh data from PowerCLI
        vmsFromPowerCLI(res);
    }

});

function vmsFromPowerCLI(res){
    const command = `
        $vms = Get-VM | Where {$_.Name -like "VM-RESTEST*"}
        Select-Object Name, @{Name="PowerState"; Expression={$_.PowerState}}, 
                      @{Name="CPU"; Expression={$_.NumCpu}}, 
                      @{Name="Memory"; Expression={[math]::round($_.MemoryGB, 2)}}
        $vms | ConvertTo-Json -Depth 1
    `;

    runPowerCLICommand(command, (err, output) => {
        if (err) return res.json({ success: false, error: "Failed to fetch Virtual Machines." });

        // Trim and check if output is empty
        if (!output || !output.trim()) {
            return res.json({ success: false, error: "No VM data returned from PowerCLI." });
        }

        let lines = output.trim().split("\n");
        let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
        if (jsonStartIndex === -1) {
            return res.json({ success: false, error: "No VMs matched the filter." });
        }

        let cleanOutput = lines.slice(jsonStartIndex).join("\n");

        // Check again in case cleanOutput is empty after extraction
        if (!cleanOutput.trim()) {
            return res.json({ success: false, error: "Extracted JSON data is empty." });
        }

        try {
            const vms = JSON.parse(cleanOutput);
            if (!vms || (Array.isArray(vms) && vms.length === 0)) {
                return res.json({ success: false, error: "No VMs matched the filter." });
            }

            const vmList = Array.isArray(vms) ? vms : [vms];

            // Insert or update DB
            const insertStmt = db.prepare(`
                INSERT INTO vms (name, power_state, cpu, memory) 
                VALUES (?, ?, ?, ?) 
                ON CONFLICT(name) DO UPDATE SET 
                    power_state = excluded.power_state, 
                    cpu = excluded.cpu, 
                    memory = excluded.memory
            `);

            vmList.forEach(vm => {
                insertStmt.run(vm.Name, vm.PowerState, vm.CPU, vm.Memory);
            });

            insertStmt.finalize();
            res.json({ success: true, vms: vmList });

        } catch (parseError) {
            console.error("❌ JSON Parsing Error:", parseError);
            res.json({ success: false, error: "Parsing error." });
        }
    });
}

router.post('/presented_volumes', async (req, res) => {
    const { volumeName, serial, lun } = req.body;
    console.log("Received data:", volumeName, serial, lun);
    try {
        await db.run("INSERT OR REPLACE INTO presented_volumes (volume_name, serial, lun) VALUES (?, ?, ?)", 
            [volumeName, serial, lun]);
        res.status(200).send("Inserted Successfully");
    } catch (error) {
        console.error("DB Error:", error);
        res.status(500).send("Database Error");
    }
});

router.delete('/presented_volumes', async (req, res) => {
    console.log("⚠️ Deleting all entries from presented_volumes...");
    try {
        await db.run(`DELETE FROM presented_volumes`);
        await db.run(`DELETE FROM checked_volumes`);
        res.json({ message: `✅ Reinitialized.` });
    } catch (error) {
        console.error("❌ DB Error:", error);
        res.status(500).send("Database Error");
    }
});



router.get('/presented_volumes', (req, res) => {
    db.all(`SELECT volume_name, serial, lun FROM presented_volumes`, [], (err, rows) => {
        if (err) {
            console.error("Database Read Error:", err.message);
            res.status(500).json({ error: "Failed to fetch presented volumes" });
        } else {
            res.json(rows);
        }
    });
});
router.get('/check_valid_lun', async (req, res) => {
    try {
        // Fetch data from presented_volumes
        const presentedVolumes = await new Promise((resolve, reject) => {
                    db.all("SELECT * FROM presented_volumes", (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
        console.log("Fetched volumes:", presentedVolumes);

        if (!Array.isArray(presentedVolumes)) {
                    console.error("Error: presentedVolumes is not an array", presentedVolumes);
                    return res.status(500).json({ error: "Invalid data format for presented volumes" });
                }

        let checkedVolumes = [];
            let status = await validateLUN(presentedVolumes);
            console.log("✅ Success:", status);
             // Validate `status.luns` exists
                if (!status.success || !status.luns) {
                    throw new Error("Invalid LUN validation response");
                }

                // Insert each validated volume into `checked_volumes`
                await Promise.all(
                    status.luns.map(async (volume) => {
                        await db.run(
                            `INSERT OR REPLACE INTO checked_volumes (volume_name, canonical, status)
                             VALUES (?, ?, ?)`,
                            [volume.volume_name, `naa.624a9370${volume.serial}`, volume.status]
                        );

                        checkedVolumes.push({
                            volume_name: volume.volume_name,
                            canonical: `naa.624a9370${volume.serial}`, // Constructed Canonical Name
                            status: volume.status
                        });
                    })
                );

                console.log("this is checkedVolumes", checkedVolumes);
                res.json(checkedVolumes);
            } catch (error) {
                console.error("Error checking LUNs:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
});

// Example validation logic function
function validateLUN(volumes) {
    return new Promise((resolve, reject) => {
        let prefix = "naa.624a9370";
        let volumesJson = JSON.stringify(volumes); // Convert array to JSON string
        
        console.log("Processing volumes:", volumes);

        const command = `
        $volumes = '${volumesJson}'
        $volumesObject = $volumes | ConvertFrom-Json
        $esxHost = Get-VMHost -Name "pgd-jkt-srd-svr-01.pegadaian.co.id"
        $dsView = Get-View $esxHost.ExtensionData.ConfigManager.DatastoreSystem
        $results = @()

        # Get all unresolved VMFS volumes once
        $UnBound = $dsView.QueryUnresolvedVmfsVolumes()

        foreach ($volume in $volumesObject) {
                    $checkDS = Get-Datastore -Name $volume.volume_name | Select Name
                    if ($checkDS){
                        $results += [PSCustomObject]@{
                            id           = $volume.id
                            volume_name  = $volume.volume_name
                            serial       = $volume.serial
                            lun          = $volume.lun
                            status       = "Presented"
                        }
                    }else{  
                    $targetCanonicalName = "naa.624a9370" + $volume.serial
                    Write-Host "Checking Serial: $volume.serial"
                    $targetSerial = "/vmfs/devices/disks/" + $targetCanonicalName.ToLower()
                    $status = "No Need to Resignature / Not Present"

                    foreach ($ub in $UnBound) {
                        $extPaths = $ub.Extent | ForEach-Object { $_.DevicePath }

                        if ($extPaths -match [regex]::Escape($targetSerial)) {
                            Write-Host "🔹 Found matching Serial: $targetSerial, proceeding with resignature..."
                            $status = "Need to Resignature"
                            break  # Stop checking other unresolved volumes once a match is found
                        }
                    }

                    # Add result to array (only once per volume)
                    $results += [PSCustomObject]@{
                        id           = $volume.id
                        volume_name  = $volume.volume_name
                        serial       = $volume.serial
                        lun          = $volume.lun
                        status       = $status
                    }}
                }

        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No LUN matched the filter." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted LUN JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed LUN Data:", parsedData);

                resolve({ success: true, luns: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.get('/checkedVolumes', (req, res) => {
    db.all(`SELECT volume_name, canonical, status FROM checked_volumes`, [], (err, rows) => {
        if (err) {
            console.error("Database Read Error:", err.message);
            res.status(500).json({ error: "Failed to fetch checked_volumes" });
        } else {
            res.json(rows);
        }
    });
});

router.post('/rescan_storage', async (req, res) => {
    try {
        console.log("🔄 Rescanning Storage on all Hosts...");

        const command = `
        $vmHosts = Get-Cluster -Name PGD-JKT-SRD-01 | Get-VMHost
        Get-VMHostStorage -VMHost $vmHosts -RescanAllHba -RescanVmfs
        `;

        runPowerCLICommand(command, (err, output) => {
            if (err) {
                console.error("❌ PowerCLI Rescan Error:", err);
                return res.status(500).json({ success: false, message: "Rescan failed", error: err });
            }

            console.log("✅ Storage Rescan Completed:", output);
            res.json({ success: true, message: "Storage rescan completed.", output });
        });

    } catch (error) {
        console.error("❌ Error running rescan:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});


router.get('/presentedDatastores', async (req, res) => {
    try {
        const datastoreQuery = `SELECT datastore_name, canonical, status FROM presented_datastores`;
        const datastores = await new Promise((resolve, reject) => {
            db.all(datastoreQuery, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const result = await Promise.all(
            datastores.map(async (datastore) => {
                const { datastore_name } = datastore;

                // Fetch folders for each datastore
                const foldersQuery = `SELECT folder_path FROM datastore_folders WHERE datastore_name = ?`;
                const folders = await new Promise((resolve, reject) => {
                    db.all(foldersQuery, [datastore_name], (err, folderRows) => {
                        if (err) reject(err);
                        else resolve(folderRows);
                    });
                });

                const folderDetails = await Promise.all(
                    folders.map(async ({ folder_path }) => {
                        // Fetch VMX files for each folder
                        const vmxQuery = `
                            SELECT vmx_file_name, vmx_path, status 
                            FROM datastore_vmx_files 
                            WHERE datastore_name = ? AND folder_path = ?`;

                        const vmxFiles = await new Promise((resolve, reject) => {
                            db.all(vmxQuery, [datastore_name, folder_path], (err, vmxRows) => {
                                if (err) reject(err);
                                else resolve(vmxRows);
                            });
                        });
                        console.log(vmxFiles);
                        return {
                            folder_path,
                            vmxFiles
                        };
                    })
                );

                return {
                    ...datastore,
                    folders: folderDetails
                };
            })
        );

        res.json(result);
    } catch (error) {
        console.error("Database Error:", error.message);
        res.status(500).json({ error: "Failed to fetch presented datastores" });
    }
});

router.delete('/presentedDatastores', async (req, res) => {
    console.log("⚠️ Deleting all entries from presented Datastores...");
    try {
        await db.run(`DELETE FROM datastore_vmx_files`);
        await db.run(`DELETE FROM datastore_folders`);
        await db.run(`DELETE FROM datastore_details`);
        await db.run(`DELETE FROM presented_datastores`);


        res.json({ message: `✅ Reinitialized.` });
    } catch (error) {
        console.error("❌ DB Error:", error);
        res.status(500).send("Database Error");
    }
});


router.post('/presentDatastoresResignatured', async(req, res) =>{
    try{
        // Fetch data from presented_volumes
        const checkedVolumes = await new Promise((resolve, reject) => {
                    db.all("SELECT * FROM checked_volumes WHERE status != ?", ['Presented'], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
        console.log("Checked volumes:", checkedVolumes);
        if (!Array.isArray(checkedVolumes)) {
                    console.error("Error: checkedVolumes is not an array", checkedVolumes);
                    return res.status(500).json({ error: "Invalid data format for checked volumes" });
                }
        let resignaturedDatastores = [];
        let status = await presentAllVolumesResignatured(checkedVolumes);
        console.log("✅ Success:", status);
             // Validate `status.luns` exists
                if (!status.success || !status.luns) {
                    throw new Error("Invalid LUN validation response");
                }

                // Insert each validated volume into `resignatured_datastores`
                await Promise.all(
                    status.luns.map(async (volume) => {
                        await db.run(
                            `INSERT OR REPLACE INTO presented_datastores (datastore_name, canonical, status)
                             VALUES (?, ?, ?)`,
                            [volume.datastore_name, volume.canonical, volume.status]
                        );

                        resignaturedDatastores.push({
                            datastore_name: volume.datastore_name,
                            canonical: volume.canonical,
                            status: volume.status
                        });
                    })
                );

                console.log("this is resignaturedDatastores", resignaturedDatastores);
                res.json(resignaturedDatastores);

    } catch (error){

    }
});

function presentAllVolumesResignatured(volumes) {
    return new Promise((resolve, reject) => {
        //let prefix = "naa.624a9370";
        let volumesJson = JSON.stringify(volumes); // Convert array to JSON string
        
        console.log("Processing volumes:", volumes);

        const command = `
        $volumes = '${volumesJson}'
        $volumesObject = $volumes | ConvertFrom-Json
        $esxHost = Get-VMHost -Name "pgd-jkt-srd-svr-01.pegadaian.co.id"
        $dsView = Get-View $esxHost.ExtensionData.ConfigManager.DatastoreSystem
        $results = @()

        # Get all unresolved VMFS volumes once
        $UnBound = $dsView.QueryUnresolvedVmfsVolumes()

        foreach ($volume in $volumesObject) { 
            $targetCanonicalName = $volume.canonical
            Write-Host "Checking Serial: $volume.canonical"
            $targetSerial = "/vmfs/devices/disks/" + $targetCanonicalName.ToLower()
            $status = "Not Presented"
            $TargetVMCenterDatastoreName = $volume.volume_name

            foreach ($ub in $UnBound) {
                $extPaths = $ub.Extent | ForEach-Object { $_.DevicePath }

                if ($extPaths -match [regex]::Escape($targetSerial)) {
                    Write-Host "🔹 Found matching Serial: $targetSerial, proceeding with resignature..."
                    $status = "Presented"
                    # Create a resignature spec
                    $res = New-Object VMware.Vim.HostUnresolvedVmfsResignatureSpec
                    $res.ExtentDevicePath = $extPaths

                    # Perform the resignature
                    $sigProcess = $dsView.ResignatureUnresolvedVmfsVolume($res)
                    #$sigProcess
                    #$sigProcess.result
                    $resigDS = Get-Datastore -Id $sigProcess.Result | Select Name
                    $mountedDS = Set-Datastore -Datastore $resigDS.Name -Name $TargetVMCenterDatastoreName | Select Name
                    Write-Host "✅ Resignature completed for Serial: $targetSerial, Signatured DS Name :$mountedDS.Name"
                    break  # Stop checking other unresolved volumes once a match is found
                }
            }

            # Add result to array (only once per volume)
            $results += [PSCustomObject]@{
                id           = $volume.id
                datastore_name = $mountedDS.Name
                volume_name  = $volume.volume_name
                canonical    = $volume.canonical
                status       = $status
            }
        }

        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No Datastore presented." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Datastore JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Datastore Data:", parsedData);

                resolve({ success: true, luns: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.get('/allDatastoreDetails', async (req, res) => {
    try {
        //Get all presented datastores
        const presentedDatastores = await new Promise((resolve, reject) => {
            db.all("SELECT datastore_name FROM presented_datastores", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log("Fetched datastores:", presentedDatastores);

        if (!Array.isArray(presentedDatastores)) {
            console.error("Error: presentedDatastores is not an array", presentedDatastores);
            return res.status(500).json({ error: "Invalid data format for presented datastores" });
        }

        // 2️⃣ Fetch details from PowerCLI (assuming this returns a structure similar to your expected output)
        let details = await fetchAllDatastoreDetailsFromPowerCLI(presentedDatastores);
        console.log("✅ Success:", details);

        if (!details.success || !Array.isArray(details.datastoresDetails)) {
            throw new Error("Invalid Datastore Details response");
        }

        let datastoresDetails = [];

    
        await Promise.all(details.datastoresDetails.map(async (datastore) => {
            const { datastore_name, folders } = datastore;

            // Insert Datastore
            await db.run(
                `INSERT INTO datastore_details (datastore_name) 
                VALUES (?) 
                ON CONFLICT(datastore_name) DO NOTHING`,
                [datastore_name]
            );

            for (const folder of folders) {
                const { folderName, vmxFiles } = folder;

                // Insert Folder
                await db.run(
                    `INSERT INTO datastore_folders (datastore_name, folder_path) 
                    VALUES (?, ?)
                    ON CONFLICT(folder_path) DO NOTHING`,
                    [datastore_name, folderName]
                );

                // ✅ Check if vmxFiles is an object
                if (vmxFiles && typeof vmxFiles === "object") {
                    const { VMXFileName, FullPath } = vmxFiles;
                    console.log(FullPath);
                    console.log(vmxFiles.FullPath);

                    // Insert VMX File
                    await db.run(
                        `INSERT INTO datastore_vmx_files (datastore_name, folder_path, vmx_file_name, vmx_path) 
                        VALUES (?, ?, ?, ?) 
                        ON CONFLICT(datastore_name, folder_path, vmx_file_name, vmx_path) DO NOTHING`,
                        [datastore_name, folderName, VMXFileName, FullPath]
                    );

                    // Trying to Append Status
                    const result = await new Promise((resolve, reject) => {
                        db.all(
                            `SELECT status FROM datastore_vmx_files 
                             WHERE datastore_name = ? 
                             AND folder_path = ? 
                             AND vmx_file_name = ? 
                             AND vmx_path = ?`,
                            [datastore_name, folderName, VMXFileName, FullPath],
                            (err, rows) => {
                                if (err) reject(err);
                                else resolve(rows);
                            }
                        );
                    });

                    // ✅ Use find() to get the first match
                    const status = result.find(row => row.status) || {};

                    console.log(`Fetched Status: ${status}`);
                    vmxFiles.status = status;

                }
            }
            datastoresDetails.push({
                datastore_name,
                folders,
            });

        }));


        console.log("✅ Stored Datastore Details:", datastoresDetails);
        res.json({ message: `✅ Fetched All Datastores Details.` });

    } catch (error) {
        console.error("❌ Error fetching all datastore details:", error);
        res.status(500).json({ error: "Failed to retrieve datastore details." });
    }
});

function fetchAllDatastoreDetailsFromPowerCLI(datastores) {
    return new Promise((resolve, reject) => {
        let datastoresJson = JSON.stringify(datastores); // Convert array to JSON string
        
        console.log("Processing datastores:", datastores);

        const command = `
        $datastores = '${datastoresJson}'
        $datastoresObject = $datastores | ConvertFrom-Json
        $vCenterIP = '${vCenterIP}'
        $datacenterName = '${vCenterDC}'
        $esxHost = Get-VMHost -Name "pgd-jkt-srd-svr-01.pegadaian.co.id"
        $results = @()
        foreach ($datastore in $datastoresObject){
                    $datastoreName = $datastore.datastore_name
                    # Get only folders, excluding system folders
                    $vmxFolders = Get-ChildItem -Path "vmstores:\\$vCenterIP@443\\$datacenterName\\$datastoreName\\" | Where-Object { $_.Name -notin @(".sdd.sf", ".dvsData", ".vSphere-HA") -and $_.PSIsContainer}|Select-Object -ExpandProperty Name
                    $datastoreEntry = [PSCustomObject]@{
                            datastore_name = $datastoreName
                            folders        = @()
                        }
                    foreach ($folder in $vmxFolders){
                        # Get VMX files inside each folder
                        $statusinit = "unregistered"
                        $vmxFiles =  Get-ChildItem -Path "vmstores:\\$vCenterIP@443\\$datacenterName\\$datastoreName\\$folder\\" -Filter "*.vmx"|
                        ForEach-Object {
                                            [PSCustomObject]@{
                                                VMXFileName = $_.Name
                                                FullPath    = $_.DatastoreFullPath
                                            }
                                        }
                        # Append folder and its VMX files to the datastore entry
                                $datastoreEntry.folders += [PSCustomObject]@{
                                    folderName = $folder
                                    vmxFiles   = $vmxFiles
                                }
                        }
                # Store the structured datastore entry in the results array
                $results += $datastoreEntry  
                }

        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 4
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No Details Found." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Datastore Details JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Datastore Details Data:", parsedData);

                resolve({ success: true, datastoresDetails: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

/*router.post('/restoreSelectedVMs', async (req, res) => {
    const { vmxPaths } = req.body;
    console.log(`Restoring VMX: ${vmxPaths}`);
    let status = await registerSelectedVM(vmxPaths);
    let restoredVM = [];
    console.log("✅ Success:", status);
             // Validate `status` exists
                if (!status) {
                    throw new Error("Invalid Register VM validation response");
                }

                // Insert each validated volume into `resignatured_datastores`
                await Promise.all(
                    status.registeredvm.map(async (registeredvm) => {
                        console.log(registeredvm.VM_Path);
                        await db.run( "UPDATE datastore_vmx_files SET status = 'registered' WHERE vmx_path = ?", [registeredvm.VM_Path]);
                        await db.run(
                                        `INSERT INTO registered_vm (vm_name, vmx_path, status) 
                                         VALUES (?, ?, ?) 
                                         ON CONFLICT(vmx_path) DO UPDATE SET status = ?`,
                                        [registeredvm.VM_Name, registeredvm.VM_Path, registeredvm.status, registeredvm.status]
                                    );
                    })
                );
                res.json({ message: `✅ ${vmxPaths.length} VMX files restored.` });;
});*/

router.post('/restoreSelectedVMs', async (req, res) => {
    const { vmxPaths } = req.body;
    console.log(`Restoring VMX: ${vmxPaths}`);

    try {
        let status = await registerSelectedVM(vmxPaths);
        console.log("✅ Success:", status);

        // Validate `status.registeredvm` exists
        if (!status || !status.registeredvm) {
            throw new Error("Invalid Register VM validation response");
        }

        // Ensure `status.registeredvm` is an array
        const registeredVMs = Array.isArray(status.registeredvm) ? status.registeredvm : [status.registeredvm];

        // Insert each validated VM into `registered_vm`
        await Promise.all(
            registeredVMs.map(async (registeredvm) => {
                console.log(registeredvm.VM_Path);
                await db.run("UPDATE datastore_vmx_files SET status = 'registered' WHERE vmx_path = ?", [registeredvm.VM_Path]);
                await db.run(
                    `INSERT INTO registered_vm (vm_name, vmx_path, status) 
                     VALUES (?, ?, ?) 
                     ON CONFLICT(vmx_path) DO UPDATE SET status = ?`,
                    [registeredvm.VM_Name, registeredvm.VM_Path, registeredvm.status, registeredvm.status]
                );
            })
        );

        res.json({ message: `✅ ${registeredVMs.length} VMX file(s) restored.` });

    } catch (error) {
        console.error("❌ Error restoring VMX:", error);
        res.status(500).json({ error: error.message });
    }
});


router.post('/restoreAllVMs', async (req, res) => {
    console.log(`Restoring All VMX Files...`);
    //await db.run("UPDATE vmx_files SET status = 'registered' WHERE status = 'unregistered'");
    res.json({ message: "✅ All VMX files restored." });
});

function registerSelectedVM(vmxPaths) {
    return new Promise((resolve, reject) => {
        let vmxPathsJson = JSON.stringify(vmxPaths); // Convert array to JSON string
        
        console.log("Processing VMX:", vmxPaths);

        const command = `
        $vmxPaths = '${vmxPathsJson}'
        $vmxPathsObject = $vmxPaths | ConvertFrom-Json
        $esxHost = Get-VMHost -Name "pgd-jkt-srd-svr-01.pegadaian.co.id"
        $results = @()

        foreach ($vmx in $vmxPathsObject) {
            $VM = New-VM -VMFilePath $vmx -Host $esxHost
            $VMName = $VM.Name
            Write-Host "VM $VM registered successfully from: $($vmx)"
            $status = "registered"

            # Add result to array
            $results += [PSCustomObject]@{
                VM_Name = $VMName
                VM_Path  = $vmx
                status   = $status
            }
        }


        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No VM Registered." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Registered VM JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Registered VM Data:", parsedData);

                resolve({ success: true, registeredvm: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.get('/registeredVMs', async (req, res) => {
    try {
        const registeredVMs = await new Promise((resolve, reject) => {
            db.all("SELECT vm_name, vmx_path, status, nic1_vlan, nic2_vlan FROM registered_vm", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log("✅ Fetched Registered VMs:", registeredVMs);
        res.json(registeredVMs);
    } catch (error) {
        console.error("❌ Error fetching registered VMs:", error);
        res.status(500).json({ error: "Failed to fetch registered VMs." });
    }
});

/*router.get("/nicOptions", async (req, res) => {
    db.all("SELECT pgNameMGMT AS vlan_name FROM nic_mgmt UNION SELECT pgNameDATA AS vlan_name FROM nic_data", (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json(rows.map(row => row.vlan_name));
    });
});*/

router.get("/nicOptions", async (req, res) => {
    db.all("SELECT pgName AS vlan_name FROM nic_surr1", (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json(rows.map(row => row.vlan_name));
    });
});

/*router.post("/commitNICs", async (req, res) => {
    const { vms } = req.body;

    if (!Array.isArray(vms)) {
        return res.status(400).json({ error: "Invalid data format" });
    }

    try {
        const stmt = db.prepare(`
            UPDATE registered_vm
            SET nic1_vlan = ?, nic2_vlan = ?
            WHERE vmx_path = ?
        `);

        vms.forEach(({ vmx_path, nic1_vlan, nic2_vlan }) => {
            stmt.run(nic1_vlan, nic2_vlan, vmx_path);
        });

        stmt.finalize();

        console.log("✅ NIC VLANs updated successfully.");
        res.json({ message: "NIC VLANs updated successfully." });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Database error: " + err.message });
    }
});*/
router.post("/commitNICs", async (req, res) => {
    const vms = req.body; // Directly expecting array from FE

    if (!Array.isArray(vms) || vms.length === 0) {
        return res.status(400).json({ error: "Invalid or empty VM data." });
    }

    try {
        const stmt = db.prepare(`
            UPDATE registered_vm
            SET nic1_vlan = ?, nic2_vlan = ?
            WHERE vm_name = ?
        `);

        vms.forEach(({ vm_name, nic1_vlan, nic2_vlan }) => {
            stmt.run(nic1_vlan, nic2_vlan, vm_name);
        });

        stmt.finalize();

        console.log("✅ NIC VLAN configurations committed successfully.");
        res.json({ message: "NIC VLAN configurations committed successfully." });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Database error: " + err.message });
    }
});


router.post("/uploadVMData", async (req, res) => {
    const vmData = req.body;

    if (!Array.isArray(vmData)) {
        return res.status(400).json({ message: "Invalid CSV data format." });
    }

    try {
        for (const { vm_name, nic1_vlan, nic2_vlan } of vmData) {
            await db.run(
                `UPDATE registered_vm SET nic1_vlan = ?, nic2_vlan = ? WHERE vm_name = ?`,
                [nic1_vlan, nic2_vlan, vm_name]
            );
        }

        res.json({ message: "✅ CSV data uploaded successfully." });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ message: "❌ Failed to update VMs." });
    }
});

router.get("/lastConfiguredVMs", async (req, res) => {
    db.all("SELECT * FROM last_configured_vms_nic", (err, rows) => {
        if (err) {
            console.error("Error fetching last configured VMs:", err);
            return res.status(500).json({ error: "Failed to fetch last configured VMs" });
        }
        res.json(rows);
    });
});


router.post('/reconfigNicAll', async(req, res) =>{
    try{
        // Fetch data from presented_volumes
        const registeredVMSNIC = await new Promise((resolve, reject) => {
                    db.all("SELECT vm_name, nic1_vlan, nic2_vlan FROM registered_vm", [], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
        console.log("Registered VM NICS:", registeredVMSNIC);
        if (!Array.isArray(registeredVMSNIC)) {
                    console.error("Error: registeredVMSNIC is not an array", registeredVMSNIC);
                    return res.status(500).json({ error: "Invalid data format for registered VM NIC" });
                }
        let lastConfiguredVMSNIC = [];
        status = await reconfigallVMNIC(registeredVMSNIC);
        console.log("✅ Success:", status);
             // Validate `status.nicConf` exists
                if (!status.success || !status.nicConf) {
                    throw new Error("Invalid nic Config validation response");
                }

                // Insert each validated volume into `lastConfiguredVMSNIC`
                await Promise.all(
                    status.nicConf.map(async (nicConf) => {
                        await db.run(
                            `INSERT OR REPLACE INTO last_configured_vms_nic (vm_name, nic1_vlan, nic2_vlan)
                             VALUES (?, ?, ?)`,
                            [nicConf.vm_name, nicConf.nic1_vlan, nicConf.nic2_vlan]
                        );

                        lastConfiguredVMSNIC.push({
                            vm_name: nicConf.vm_name,
                            nic1_vlan: nicConf.nic1_vlan,
                            nic2_vlan: nicConf.nic2_vlan
                        });
                    })
                );

                console.log("this is lastConfiguredVMSNIC", lastConfiguredVMSNIC);
                res.json({message: "NIC VLANs configured successfully." });

    } catch (error){

    }
});

function reconfigallVMNIC(vmNICs) {
    return new Promise((resolve, reject) => {
        let vmNICsJson = JSON.stringify(vmNICs); // Convert array to JSON string
        
        console.log("Processing VM NICS:", vmNICs);

        const command = `
        $vmNICs = '${vmNICsJson}'
        $vmNICsObject = $vmNICs| ConvertFrom-Json
        $results = @()

        foreach ($vmNIC in $vmNICsObject) {
            $vmNIC.vm_name
            $nic1 = Get-VM $vmNIC.vm_name | Get-NetworkAdapter -Name "Network adapter 1"
            Set-NetworkAdapter $nic1 -NetworkName $vmNIC.nic1_vlan -Confirm:$false
            Write-Host "$vmNIC.vm_name nic1 successfully Change to : $($vmNIC.nic1_vlan)"
            $vmNIC.vm_name
            $nic2 = Get-VM $vmNIC.vm_name | Get-NetworkAdapter -Name "Network adapter 2"
            Set-NetworkAdapter $nic2 -NetworkName $vmNIC.nic2_vlan -Confirm:$false
            Write-Host "$vmNIC.vm_name nic2 successfully Change to : $($vmNIC.nic2_vlan)"

            # Add result to array
            $results += [PSCustomObject]@{
                vm_name = $vmNIC.vm_name
                nic1_vlan = $vmNIC.nic1_vlan
                nic2_vlan = $vmNIC.nic2_vlan
            }
        }


        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No VM Registered." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Registered VM JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Last Configured VM NICS:", parsedData);

                resolve({ success: true, nicConf: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.post('/powerOnVMs', async(req, res) =>{
    const { vms } = req.body;
    console.log(`Powering VM: ${vms}`);
    let status = await powerSelectedVM(vms);
    let poweredVM = [];
    console.log("✅ Success:", status);
             // Validate `status` exists
                if (!status) {
                    throw new Error("Invalid Power VM validation response");
                }
                //ensure status.poweredvm is an array
                const statusVM = Array.isArray(status.poweredvm) ? status.poweredvm : [status.poweredvm]; 
                // Insert each validated volume into `resignatured_datastores`
                await Promise.all(
                    statusVM.map(async (poweredvm) => {
                        await db.run( "UPDATE registered_vm SET status = 'powered ON' WHERE vm_name = ?", [poweredvm.VM_Name]);
                        //await db.run( "UPDATE datastore_vmx_files SET status = 'powered ON' WHERE vm_name = ?", [poweredvm.VM_Name]);
                        /*await db.run(
                                        `INSERT INTO registered_vm (vm_name, vmx_path, status) 
                                         VALUES (?, ?, ?) 
                                         ON CONFLICT(vmx_path) DO UPDATE SET status = ?`,
                                        [poweredvm.VM_Name, registeredvm.VM_Path, registeredvm.status, registeredvm.status]
                                    );*/

                    })
                );

                //console.log("this is restoredVM", restoredVM);
                res.json({ message: `✅ ${vms.length} VMS Powered ON.` });;
});

function powerSelectedVM(vms) {
    return new Promise((resolve, reject) => {
        let vmsJson = JSON.stringify(vms); // Convert array to JSON string
        
        console.log("Processing VMX:", vms);

        const command = `
        $vms = '${vmsJson}'
        $vmsObject = $vms | ConvertFrom-Json
        $results = @()

        foreach ($vm in $vmsObject) {
            $VM = Get-VM -Name $vm
            $VMName = $VM.Name
            Start-VM -VM $VM -Confirm:$false
            Get-VMQuestion | Set-VMQuestion -Confirm:$false -Option "button.uuid.movedTheVM"
            $status = "powered ON"

            # Add result to array
            $results += [PSCustomObject]@{
                VM_Name = $VMName
                status   = $status
            }
        }


        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No VM Powered." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Powered VM JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Powered VM Data:", parsedData);

                resolve({ success: true, poweredvm: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.post('/powerOffVMs', async(req, res) =>{
    const { vms } = req.body;
    console.log(`Powering Off VM: ${vms}`);
    let status = await powerOffSelectedVM(vms);
    let poweredVM = [];
    console.log("✅ Success:", status);
             // Validate `status` exists
                if (!status) {
                    throw new Error("Invalid Power VM validation response");
                }
                //ensure status.poweredvm is an array
                const statusVM = Array.isArray(status.poweredvm) ? status.poweredvm : [status.poweredvm]; 
                // Insert each validated volume into `resignatured_datastores`
                await Promise.all(
                    statusVM.map(async (poweredvm) => {
                        await db.run( "UPDATE registered_vm SET status = 'powered OFF' WHERE vm_name = ?", [poweredvm.VM_Name]);
                        //await db.run( "UPDATE datastore_vmx_files SET status = 'powered ON' WHERE vm_name = ?", [poweredvm.VM_Name]);
                        /*await db.run(
                                        `INSERT INTO registered_vm (vm_name, vmx_path, status) 
                                         VALUES (?, ?, ?) 
                                         ON CONFLICT(vmx_path) DO UPDATE SET status = ?`,
                                        [poweredvm.VM_Name, registeredvm.VM_Path, registeredvm.status, registeredvm.status]
                                    );*/

                    })
                );

                //console.log("this is restoredVM", restoredVM);
                res.json({ message: `✅ ${vms.length} VMS Powered OFF.` });;
});

function powerOffSelectedVM(vms) {
    return new Promise((resolve, reject) => {
        let vmsJson = JSON.stringify(vms); // Convert array to JSON string
        
        console.log("Processing VMX:", vms);

        const command = `
        $vms = '${vmsJson}'
        $vmsObject = $vms | ConvertFrom-Json
        $results = @()

        foreach ($vm in $vmsObject) {
            $VM = Get-VM -Name $vm
            $VMName = $VM.Name
            Shutdown-VMGuest -VM $VM -Confirm:$false
            $status = "powered OFF"

            # Add result to array
            $results += [PSCustomObject]@{
                VM_Name = $VMName
                status   = $status
            }
        }


        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No VM Powered." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Powered VM JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Powered VM Data:", parsedData);

                resolve({ success: true, poweredvm: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}

router.post('/removeVMs', async(req, res) =>{
    const { vms } = req.body;
    console.log(`Removing VM: ${vms}`);
    let status = await removeSelectedVM(vms);
    let poweredVM = [];
    console.log("✅ Success:", status);
             // Validate `status` exists
                if (!status) {
                    throw new Error("Invalid Power VM validation response");
                }
                //ensure status.poweredvm is an array
                const statusVM = Array.isArray(status.poweredvm) ? status.poweredvm : [status.poweredvm]; 
                // Insert each validated volume into `resignatured_datastores`
                await Promise.all(
                    statusVM.map(async (poweredvm) => {
                        vmx_file_name = poweredvm.VM_Name + '.vmx';
                        console.log(vmx_file_name);
                        await db.run("UPDATE datastore_vmx_files SET status = 'unregistered' WHERE vmx_file_name = ?", [vmx_file_name])
                        await db.run( "DELETE FROM registered_vm WHERE vm_name = ?", [poweredvm.VM_Name]);
                        await db.run( "DELETE FROM last_configured_vms_nic WHERE vm_name = ?", [poweredvm.VM_Name]);
                    })
                );

                //console.log("this is restoredVM", restoredVM);
                res.json({ message: `✅ ${vms.length} VMS Removed.` });;
});

function removeSelectedVM(vms) {
    return new Promise((resolve, reject) => {
        let vmsJson = JSON.stringify(vms); // Convert array to JSON string
        
        console.log("Processing VMX:", vms);

        const command = `
        $vms = '${vmsJson}'
        $vmsObject = $vms | ConvertFrom-Json
        $results = @()

        foreach ($vm in $vmsObject) {
            $VM = Get-VM -Name $vm
            $VMName = $VM.Name
            Remove-VM $VM -Confirm:$false
            $status = "unregistered"

            # Add result to array
            $results += [PSCustomObject]@{
                VM_Name = $VMName
                status   = $status
            }
        }


        # Convert results to JSON and print
        $resultsJson = $results | ConvertTo-Json -Depth 2
        Write-Output $resultsJson
        `;

        runPowerCLICommand(command, (err, output) => {
            let lines = output.trim().split("\n");
            let jsonStartIndex = lines.findIndex(line => line.trim().startsWith("{") || line.trim().startsWith("["));
            if (jsonStartIndex === -1) {
                return reject({ success: false, error: "No VM Powered." });
            }

            let cleanOutput = lines.slice(jsonStartIndex).join("\n").trim();

            // Ensure extracted output is not empty
            if (!cleanOutput) {
                return reject({ success: false, error: "Extracted Powered VM JSON data is empty." });
            }

            try {
                // **Fix JSON Formatting**
                let fixedJson = cleanOutput
                    .replace(/(\w+):/g, '"$1":') // Add missing quotes to object keys
                    .replace(/'/g, '"'); // Convert single quotes to double quotes

                console.log("🔹 Fixed JSON Output:", fixedJson);

                // Parse JSON safely
                const parsedData = JSON.parse(fixedJson);
                console.log("✅ Parsed Powered VM Data:", parsedData);

                resolve({ success: true, poweredvm: parsedData });

            } catch (parseError) {
                console.error("❌ JSON Parsing Error:", parseError);
                reject({ success: false, error: "Invalid JSON output from PowerCLI." });
            }
        });
    });
}




module.exports = router;
