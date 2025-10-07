const fetch = require('node-fetch');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
async function getApiToken() {
    const response = await fetch(`https://${ process.env.PURE_STORAGE_IP }/api/1.17/auth/apitoken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: process.env.PURE_STORAGE_USERNAME, password: process.env.PURE_STORAGE_PASSWORD }),
    });

    const data = await response.json();
    return data.api_token;
}

async function getAuthToken(apiToken) {
    const response = await fetch(`https://${ process.env.PURE_STORAGE_IP }/api/2.17/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-token': apiToken },
    });

    return response.headers.get('X-Auth-Token');
}

async function fetchFlashArrayData(authToken) {
    const response = await fetch(`https://${ process.env.PURE_STORAGE_IP }/api/2.17/arrays`, {
        method: 'GET',
        headers: { 'x-auth-token': authToken },
    });

    return response.json();
}

async function restoreVolumeFromSnapshot(snapshotName, volumeName) {
    try {
        if (!process.env.PURE_STORAGE_IP) throw new Error("PURE_STORAGE_IP is not set.");

        console.log(`Restoring snapshot "${snapshotName}" to volume "${volumeName}"`);

        const apiToken = await getApiToken();
        const authToken = await getAuthToken(apiToken);

        const url = `https://${ process.env.PURE_STORAGE_IP }/api/2.17/volumes?names=${ volumeName }&overwrite=0&with_default_protection=0`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': authToken
            },
            body: JSON.stringify({
                destroyed: "0",
                source: { name: snapshotName }
            })
        });

        if (!response.ok) throw new Error(`Restore failed: ${response.statusText}`);

        const data = await response.json();
        console.log(`Successfully restored snapshot "${snapshotName}" to "${volumeName}"`, data);

        return data;
    } catch (error) {
        console.error(`Error restoring snapshot "${snapshotName}":`, error);
        return { error: error.message };
    }
}

async function connectVolumeToHostGroup(volumeName, hostGroupName) {
    try {
        if (!process.env.PURE_STORAGE_IP) throw new Error("PURE_STORAGE_IP is not set.");

        console.log(`Connecting volume "${volumeName}" to host group ${ process.env.PURE_STORAGE_HOSTGROUP }`);

        const apiToken = await getApiToken();
        const authToken = await getAuthToken(apiToken);

        const url = `https://${process.env.PURE_STORAGE_IP}/api/2.17/connections?volume_names=${volumeName}&host_group_names=${ process.env.PURE_STORAGE_HOSTGROUP }`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': authToken
            },
            body: JSON.stringify({})
        });

        if (!response.ok) throw new Error(`Connection failed: ${response.statusText}`);

        const data = await response.json();
        console.log(`Successfully connected volume "${volumeName}" to host group "${ process.env.PURE_STORAGE_HOSTGROUP }"`, data);

        return data;
    } catch (error) {
        console.error(`Error connecting volume "${volumeName}" to host group "${ process.env.PURE_STORAGE_HOSTGROUP }":`, error);
        return { error: error.message };
    }
}

async function disconnectVolumeToHostGroup(volumeName, hostGroupName) {
    try {
        if (!process.env.PURE_STORAGE_IP) throw new Error("PURE_STORAGE_IP is not set.");

        console.log(`Disconnecting volume "${volumeName}" from host group ${ process.env.PURE_STORAGE_HOSTGROUP }`);

        const apiToken = await getApiToken();
        const authToken = await getAuthToken(apiToken);

        const url = `https://${process.env.PURE_STORAGE_IP}/api/2.17/connections?volume_names=${volumeName}&host_group_names=${ process.env.PURE_STORAGE_HOSTGROUP }`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': authToken
            },
            body: JSON.stringify({})
        });

        if (!response.ok) throw new Error(`Disconnection failed: ${response.statusText}`);

        const data = await response.json();
        console.log(`Successfully disconnected volume "${volumeName}" from host group "${ process.env.PURE_STORAGE_HOSTGROUP }"`, data);

        return data;
    } catch (error) {
        console.error(`Error disconnecting volume "${volumeName}" from host group "${ process.env.PURE_STORAGE_HOSTGROUP }":`, error);
        return { error: error.message };
    }
}

async function destroyVolume(volumeName) {
    try {
        if (!process.env.PURE_STORAGE_IP) throw new Error("PURE_STORAGE_IP is not set.");

        console.log(`Destroying volume "${volumeName}"`);

        const apiToken = await getApiToken();
        const authToken = await getAuthToken(apiToken);

        const url = `https://${process.env.PURE_STORAGE_IP}/api/2.17/volumes?names=${volumeName}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': authToken
            },
            body: JSON.stringify({
                destroyed: "0"
            })
        });

        if (!response.ok) throw new Error(`Destroy failed: ${response.statusText}`);

        const data = await response.json();
        console.log(`Successfully Destroyed volume "${volumeName}"`, data);

        return data;
    } catch (error) {
        console.error(`Error destroying volume "${volumeName}"${ process.env.PURE_STORAGE_HOSTGROUP }":`, error);
        return { error: error.message };
    }
}




module.exports = { getApiToken, getAuthToken, fetchFlashArrayData, restoreVolumeFromSnapshot, connectVolumeToHostGroup, disconnectVolumeToHostGroup, destroyVolume };
