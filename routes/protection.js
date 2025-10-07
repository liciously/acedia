const express = require('express');
const db = require('../config/database');
const { getApiToken, getAuthToken } = require('../services/flasharray');
const { restoreVolumeFromSnapshot } = require('../services/flasharray');
const { connectVolumeToHostGroup } = require('../services/flasharray');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Parser } = require("json2csv");
const upload = multer({ dest: '../uploads/' });
const router = express.Router();
const pureStorageIP = process.env.PURE_STORAGE_IP;

// Route to display the "Add Protection Group" form
router.get('/add-protection-group', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('add-protection-group'); // Ensure this matches your EJS file name
});


router.post('/import-csv', upload.single('csvFile'), (req, res) => {
    if (!req.session.user) return res.redirect('/');

    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = req.file.path;
    const protectionGroups = [];

    // Read CSV file
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            if (row.name) {
                protectionGroups.push(row.name);
            }
        })
        .on('end', () => {
            fs.unlinkSync(filePath); // Remove file after processing

            if (protectionGroups.length === 0) {
                return res.status(400).send('CSV file is empty or invalid.');
            }

            // Filter out already existing protection groups from the database
            const query = `SELECT name FROM protection_groups WHERE name IN (${protectionGroups.map(() => '?').join(',')})`;
            db.all(query, protectionGroups, (err, existingGroups) => {
                if (err) {
                    console.error('Error checking existing protection groups:', err);
                    return res.status(500).send('Error checking protection groups.');
                }

                // Get only the protection groups that are not already in the database
                const newGroups = protectionGroups.filter(group => !existingGroups.some(existing => existing.name === group));

                if (newGroups.length === 0) {
                    return res.status(400).send('All protection groups already exist.');
                }

                // Insert new protection groups into the database
                const placeholders = newGroups.map(() => '(?)').join(',');
                db.run(`INSERT INTO protection_groups (name) VALUES ${placeholders}`, newGroups, (err) => {
                    if (err) {
                        console.error('Error inserting CSV data:', err);
                        return res.status(500).send('Error inserting CSV data.');
                    }

                    console.log(`Successfully imported protection groups: ${newGroups.join(', ')}`);

                    // Send the response with an alert
                    res.redirect('/dashboard?alert=importSuccess&names=' + encodeURIComponent(newGroups.join(', ')));
                });
            });
        });
});


// Add Protection Group
router.post('/add-protection-group', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const { name } = req.body;
    console.log(`Received request to add Protection Group: ${name}`);

    // Check if the protection group already exists
    db.get(`SELECT * FROM protection_groups WHERE name = ?`, [name], async (err, row) => {
        if (err) {
            console.error("Error checking protection group:", err);
            return res.status(500).send("Internal server error");
        }

        if (row) {
            console.log(`Protection group "${name}" already exists. Skipping insertion.`);
            //return res.redirect('/dashboard'); // Skip addition if name already exists
            return res.redirect(`/dashboard?alert=exists&name=${encodeURIComponent(name)}`);
        }

    // Insert into DB first
    db.run(`INSERT INTO protection_groups (name) VALUES (?)`, [name], async function (err) {
        if (err) {
            console.error("Error inserting protection group:", err);
            return res.status(500).send("Internal server error");
        }

        console.log(`Protection group "${name}" added successfully with ID: ${this.lastID}`);

        // Fetch snapshot data AFTER inserting
        const snapshotData = await fetchProtectionGroupDataSnapshot(name);

        if (!snapshotData) {
            console.error(`No snapshot data found for ${name}`);
        } else {
            console.log(`Snapshot data received for ${name}:`, snapshotData);
        }

        res.redirect('/dashboard'); // Redirect after insertion
    });
    });
});

// Delete Protection Group
router.post('/delete-protection-group/:id', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    console.log(`Received request to delete Protection Group ID: ${req.params.id}`);

    db.run('DELETE FROM protection_groups WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error("Error deleting protection group:", err);
            return res.status(500).send("Internal server error");
        }
        console.log(`Protection group ID ${req.params.id} deleted successfully`);
        res.redirect('/dashboard');
    });
});



// route for restoring snapshots
router.post('/restore-snapshot', async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    const { snapshotName, newVolumeName } = req.body;
    console.log(snapshotName, newVolumeName);

    if (!snapshotName || !newVolumeName) {
        return res.status(400).json({ error: "Snapshot name and new volume name are required" });
    }

    console.log(`Received restore request for snapshot "${snapshotName}" as volume "${newVolumeName}"`);

    // Step 1: Restore the snapshot
    const result = await restoreVolumeFromSnapshot(snapshotName, newVolumeName);

    if (result.error) {
        return res.status(500).json({ error: result.error });
    }

    // Step 2: Extract the serial number of the newly created volume
    const volumeData = result.items?.[0];
    const volumeSerial = volumeData?.serial || null;

    // Step 3: Connect the volume to the host group
        const connectionResult = await connectVolumeToHostGroup(newVolumeName, process.env.PURE_STORAGE_HOSTGROUP);
        
        if (connectionResult.error) {
            return res.status(500).json({ error: connectionResult.error });
        }

        // Extract LUN
        const lun = connectionResult.items?.[0]?.lun || null;

    // Step 4: Extract the LUN from the connection response
    if (lun === undefined) {
        return res.status(500).json({ error: "LUN not initialized or missing from API response" });
    }
    console.log(`Volume "${newVolumeName}" connected with LUN: ${lun}`);

    // Step 5: Insert the data into the database
    try {
        await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO restored_volumes (volume_name, snapshot_name, serial, lun) VALUES (?, ?, ?, ?)", 
                [newVolumeName, snapshotName, volumeSerial, lun], 
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
    });

        res.json({ 
            success: true, 
            message: `Snapshot "${snapshotName}" restored as volume "${newVolumeName}", connected to host group "${ process.env.PURE_STORAGE_HOSTGROUP }", and stored in DB with Serial: ${volumeSerial}, LUN: ${lun}.`
        });

    } catch (err) {
        res.status(500).json({ error: "Database error: " + err.message });
    }
});

router.get("/reload-restored-volumes", async (req, res) => {
    try {
        // 1️⃣ Fetch all restored volumes from the database
        const volumes = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM restored_volumes", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log("Raw restored volumes from DB:", volumes);

        // 2️⃣ Fetch latest status for each volume and update DB
        const updatedVolumes = await Promise.all(volumes.map(async (row) => {
            try {
                console.log(`🌍 Fetching status from Pure Storage for volume: ${row.volume_name}`);
                const apiToken = await getApiToken();
                const authToken = await getAuthToken(apiToken);

                const response = await fetch(`https://${process.env.PURE_STORAGE_IP}/api/2.17/volumes?names=${row.volume_name}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-token': authToken
                    },
                });

                console.log("📥 Received response status:", response.status);
                const result = await response.json();

                let status = "Missing or Deleted";
                if (result.items && result.items.length > 0) {
                    status = result.items[0].destroyed === false
                        ? (result.items[0].connection_count === 0 ? "Disconnected" : "Connected")
                        : "Missing or Deleted";
                }

                console.log(`✅ Status for ${row.volume_name}: ${status}`);

                // 3️⃣ Insert or Update the status in the database
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO restored_volumes (volume_name, snapshot_name, serial, lun, status)
                         VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(volume_name) DO UPDATE SET status = ?`,
                        [row.volume_name, row.snapshot_name, row.serial, row.lun, status, status],
                        (updateErr) => {
                            if (updateErr) reject(updateErr);
                            else resolve();
                        }
                    );
                });

                return { ...row, status };

            } catch (error) {
                console.error(`❌ Error fetching status for ${row.volume_name}:`, error);
                return { ...row, status: "Error fetching status" };
            }
        }));

        console.log("DEBUG: Updated volumes with latest statuses:", updatedVolumes);

        // 4️⃣ Fetch the latest updated records from DB
        const refreshedVolumes = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM restored_volumes", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({ success: true, data: refreshedVolumes });

    } catch (error) {
        console.error("❌ Error in reload-restored-volumes:", error);
        res.status(500).json({ success: false, error: "Failed to reload restored volumes" });
    }
});


async function getRestoredVolumes() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM restored_volumes", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Route to get restored volumes
router.get("/restored-volumes", async (req, res) => {
    try {
        const restoredVolumes = await getRestoredVolumes();
        res.json({ success: true, data: restoredVolumes });
    } catch (error) {
        console.error("Database Read Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch restored volumes" });
    }
});



router.get("/export-restored-volumes", async (req, res) => {
    db.all("SELECT volume_name, serial, lun FROM restored_volumes", (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });

        if (rows.length === 0) {
            return res.status(404).json({ error: "No restored volumes found" });
        }

        try {

            const formattedRows = rows.map(row => ({
                volume_name: row.volume_name.replace(/"/g, ""),  // Strip quotes
                serial: row.serial.replace(/"/g, ""),            // Strip quotes
                lun: row.lun                                      // LUN is numeric, no quotes
            }));
            const fields = ['volume_name', 'serial', 'lun'];
            const opts = { fields, quote: "" };
            const parser = new Parser(opts);
            const csv = parser.parse(rows);

            res.header("Content-Type", "text/csv");
            res.attachment("restored_volumes.csv");
            res.send(csv);
        } catch (error) {
            console.error("Error generating CSV:", error);
            res.status(500).json({ error: "Error generating CSV" });
        }
    });
});





//Delete entries from DB
router.post("/delete-restored-volume", async (req, res) => {
    console.log("🛑 Delete Restored Volume API Hit! (Check if this is triggered on startup)");
    const { volume_name } = req.body;
    
    if (!volume_name) {
        return res.json({ success: false, error: "Missing volume name." });
    }

    db.run("DELETE FROM restored_volumes WHERE volume_name = ?", [volume_name], function(err) {
        if (err) {
            return res.json({ success: false, error: "Database error: " + err.message });
        }
        res.json({ success: true });
    });
});



// Function to fetch snapshots for a Protection Group
async function fetchProtectionGroupDataSnapshot(protectionGroupName) {
    try {
        console.log(`Fetching snapshots for Protection Group: ${protectionGroupName}`);

        const apiToken = await getApiToken();
        console.log(`Received API Token: ${apiToken}`);

        const authToken = await getAuthToken(apiToken);
        console.log(`Received Auth Token: ${authToken}`);

        const response = await fetch(`https://${ process.env.PURE_STORAGE_IP }/api/2.17/volume-snapshots?names=${protectionGroupName}*`, {
            method: 'GET',
            headers: { 'x-auth-token': authToken },
        });   
        const data = await response.json();

        return data;
    } catch (error) {
        console.error(`Error fetching snapshot data for ${protectionGroupName}:`, error);
        return null;
    }
}



// Fetch snapshots for ALL protection groups
router.get('/protection-groups/snapshots', async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    console.log("Fetching snapshots for all Protection Groups...");

    // Fetch all protection groups from the database
    db.all('SELECT name FROM protection_groups', async (err, rows) => {
        if (err) {
            console.error("Error fetching protection groups from database:", err);
            return res.status(500).send("Internal server error");
        }

        if (!rows || rows.length === 0) {
            console.warn("No protection groups found in database");
            return res.status(404).send("No protection groups found");
        }

        const snapshots = {};

        // Fetch snapshots for each protection group
        for (const row of rows) {
            //console.log(`Fetching snapshots for: ${row.name}`);
            const snapshotData = await fetchProtectionGroupDataSnapshot(row.name);
            snapshots[row.name] = snapshotData || { error: "Failed to fetch snapshots" };
        }

        console.log("All snapshots fetched successfully:"/*, snapshots*/);
        res.json(snapshots);
    });
});


module.exports = router; 
module.exports.fetchProtectionGroupDataSnapshot = fetchProtectionGroupDataSnapshot;

