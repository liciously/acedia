const express = require('express');
const router = express.Router();
const vSphereOps = require('./vsphereopsmodule');

// Complete workflow endpoint
router.post('/workflow', vSphereOps.handleCompleteWorkflow);

// Individual operation endpoints
router.post('/storage/rescan', async (req, res) => {
    try {
        await vSphereOps.rescanStorage(req.body.hostName);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/storage/volume', async (req, res) => {
    try {
        const { hostName, lunId, serialNumber } = req.body;
        const volume = await vSphereOps.getVolumeByLUNSerial(hostName, lunId, serialNumber);
        res.json({ success: true, volume });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/datastore/create', async (req, res) => {
    try {
        const { hostName, lunId, datastoreName } = req.body;
        const datastore = await vSphereOps.createDatastore(hostName, lunId, datastoreName);
        res.json({ success: true, datastore });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/datastore/rename', async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        const datastore = await vSphereOps.getAndRenameDatastore(oldName, newName);
        res.json({ success: true, datastore });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vm/register', async (req, res) => {
    try {
        const { datastoreName, clusterName } = req.body;
        const vm = await vSphereOps.browseAndRegisterVM(datastoreName, clusterName);
        res.json({ success: true, vm });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vm/reconfigure', async (req, res) => {
    try {
        const { vmName } = req.body;
        const vm = await vSphereOps.reconfigureVMHardware(vmName);
        res.json({ success: true, vm });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vm/power', async (req, res) => {
    try {
        const { vmName, action } = req.body;
        const powerState = await vSphereOps.managePowerState(vmName, action);
        res.json({ success: true, powerState });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;