const express = require("express");
const { spawn } = require("child_process");
const db = require('../config/database');
const { getRestoredDatastore, mountVolumetoDatastore } = require('../services/vsphereFunctions'); // Import PowerCLI function
require("dotenv").config({ path: "./ini.env" });


const router = express.Router();
const vCenterIP = process.env.VCENTER_IP;
//console.log(vCenterIP, process.env.VCENTER_IP);
const vCenterUser = process.env.VCENTER_USER;
const vCenterPass = process.env.VCENTER_PASS;

router.get('/restored-datastores', async (req, res) => {
    db.all("SELECT * FROM restored_volumes", async (err, rows) => {
        if (err) return res.json({ error: "Database error: " + err.message });
        console.log("Raw restored volumes from DB:", rows); // Log fetched data

         try {

            const mountedVolumes = rows.filter(row => row.mount_status !== "Not Mounted");
            console.log("Filtered Volumes (Mounted only):", mountedVolumes);
            const updatedDatastores = await Promise.all(mountedVolumes.map(async (row) => {
                const datastore = await getRestoredDatastore(row.volume_name); // Call PowerCLI function
                console.log(datastore);
                // 🛠 Handle both array and object cases
                    const ds = Array.isArray(datastore) ? datastore[0] : datastore;

                    return {
                        Datastore: ds?.Name || "Unknown", // Use correct key
                        CanonicalName: ds?.CanonicalName || "Unknown"
                    };
            }));

            console.log("Updated Datastores:", updatedDatastores); // Debugging log
            res.json(updatedDatastores);
        } catch (error) {
            console.error("Error fetching restored datastores:", error);
            res.status(500).json({ error: 'Failed to fetch restored datastores' });
        }
    });

});

router.post('/mount-volume', async (req, res) => {
    console.log("vsphereops route triggered");
    const { volume_name, serial, lun } = req.body;

    if (!volume_name || !serial || lun == null) {
        return res.status(400).json({ message: "Missing volume_name or serial or lun" });
    }
    console.log(volume_name);
    console.log(serial);
    console.log(lun);
    try {
        // Call the function to mount the volume and create datastore
        const mountedDatastore = await mountVolumetoDatastore(volume_name, serial, lun);

        if (!mountedDatastore) {
            return res.status(500).json({ message: "Failed to mount volume or create datastore" });
        }

        // Update the mount status in restored_volumes table
        console.log("mountedDatastore",mountedDatastore);
        const updateStatusQuery = `UPDATE restored_volumes SET mount_status = 'Mounted', datastore_name = ? WHERE volume_name = ?`;
        console.log("updateStatusQuery");
        await db.run(updateStatusQuery, [mountedDatastore, volume_name]);

        // Send success response with the datastore name
        res.json({ success: true, message: `Volume mounted successfully. Datastore: ${mountedDatastore}` });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: "Error during mounting process" });
    }
});



module.exports = router;

