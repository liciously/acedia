const express = require('express');
const { getApiToken, getAuthToken, fetchFlashArrayData } = require('../services/flashArray');
const { fetchProtectionGroupDataSnapshot } = require('./protection'); // Import function
const db = require('../config/database');

const router = express.Router();

router.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');

    try {
        const apiToken = await getApiToken();
        const authToken = await getAuthToken(apiToken);
        const flashArrayDataItems = await fetchFlashArrayData(authToken);
        const flashArrayData = flashArrayDataItems.items;


        const tableName = db.getProtectionTableName(req.session && req.session.environment);
        db.all(`SELECT * FROM ${tableName}`, async (err, protectionGroups) => {
            if (err) return res.status(500).send("Internal server error");

            const snapshots = {};
            for (const group of protectionGroups) {
                snapshots[group.name] = await fetchProtectionGroupDataSnapshot(group.name) || { error: "Failed to fetch snapshots" };
            }

            // 🔥 Pass snapshots to EJS
            res.render('dashboard', { 
                user: req.session.user, 
                flashArrayData, 
                protectionGroups, 
                snapshots
            });
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

module.exports = router;
