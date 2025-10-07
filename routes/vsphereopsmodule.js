//claude
const { spawn } = require('child_process');

// Utility function to execute PowerCLI commands
function executePowerCLI(script) {
    return new Promise((resolve, reject) => {
        const powershell = spawn('powershell.exe', ['-Command', script]);
        let output = '';
        let error = '';

        powershell.stdout.on('data', (data) => {
            output += data.toString();
        });

        powershell.stderr.on('data', (data) => {
            error += data.toString();
        });

        powershell.on('exit', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                reject(new Error(`PowerShell Error: ${error}`));
            }
        });
    });
}

// 1A. Rescan Storage
async function rescanStorage(hostName) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        Get-VMHost "${hostName}" | Get-VMHostStorage -RescanAllHba
        Get-VMHost "${hostName}" | Get-VMHostStorage -RescanVmfs
        Disconnect-VIServer -Confirm:$false
    `;
    return executePowerCLI(script);
}

// 1B. Get Volume by LUN and Serial
async function getVolumeByLUNSerial(hostName, lunId, serialNumber) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        $host = Get-VMHost "${hostName}"
        $scsiLun = Get-ScsiLun -VMHost $host | Where-Object { 
            $_.RuntimeName -like "*${lunId}*" -and $_.SerialNumber -eq "${serialNumber}"
        }
        $scsiLun | ConvertTo-Json -Depth 10
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// 1C & 1D. Create Datastore and Assign Signature
async function createDatastore(hostName, lunId, datastoreName) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        $host = Get-VMHost "${hostName}"
        $ds = New-Datastore -VMHost $host -Name "${datastoreName}" -Path "${lunId}" -Vmfs -FileSystemVersion 6
        $ds | ConvertTo-Json -Depth 5
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// 1E & 2A. Get and Rename Datastore
async function getAndRenameDatastore(oldName, newName) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        $ds = Get-Datastore -Name "${oldName}"
        $ds | Set-Datastore -Name "${newName}"
        Get-Datastore -Name "${newName}" | ConvertTo-Json -Depth 5
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// 3A-E. Browse and Register VM
async function browseAndRegisterVM(datastoreName, clusterName) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        $ds = Get-Datastore -Name "${datastoreName}"
        $cluster = Get-Cluster -Name "${clusterName}"
        
        # Search for VMX files
        $dsView = Get-View -Id $ds.Id
        $dsb = Get-View -Id $dsView.Browser
        $searchSpec = New-Object VMware.Vim.HostDatastoreBrowserSearchSpec
        $searchSpec.matchPattern = "*.vmx"
        $searchResult = $dsb.SearchDatastoreSubFolders("[${datastoreName}]", $searchSpec)
        
        # Get the first VMX file
        $vmxPath = $searchResult | ForEach-Object {
            $_.FolderPath + ($_.File | Where-Object {$_.Path -like "*.vmx"}).Path
        } | Select-Object -First 1
        
        if ($vmxPath) {
            # Register the VM
            $vm = New-VM -VMFilePath $vmxPath -ResourcePool $cluster -Location $cluster
            $vm | ConvertTo-Json -Depth 10
        } else {
            Write-Error "No VMX files found"
        }
        
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// 4A-C. Reconfigure VM Hardware
async function reconfigureVMHardware(vmName) {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        
        # Get VM and its network adapters
        $vm = Get-VM -Name "${vmName}"
        $networkAdapters = Get-NetworkAdapter -VM $vm
        
        # Disconnect all network adapters
        foreach ($adapter in $networkAdapters) {
            Set-NetworkAdapter -NetworkAdapter $adapter -Connected:$false -Confirm:$false
        }
        
        # Get updated VM info
        $updatedVM = Get-VM -Name "${vmName}"
        $updatedVM | ConvertTo-Json -Depth 10
        
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// 5A-C. Power Management
async function managePowerState(vmName, action = 'poweron') {
    const script = `
        Connect-VIServer -Server $env:VCENTER_SERVER -User $env:VCENTER_USER -Password $env:VCENTER_PASS
        
        $vm = Get-VM -Name "${vmName}"
        $initialState = $vm.PowerState
        
        if ('${action}' -eq 'poweron') {
            Start-VM -VM $vm -Confirm:$false
        } elseif ('${action}' -eq 'poweroff') {
            Stop-VM -VM $vm -Confirm:$false
        }
        
        # Wait for power state change and get final state
        Start-Sleep -Seconds 5
        $updatedVM = Get-VM -Name "${vmName}"
        
        @{
            initialState = $initialState
            currentState = $updatedVM.PowerState
            name = $updatedVM.Name
        } | ConvertTo-Json
        
        Disconnect-VIServer -Confirm:$false
    `;
    const result = await executePowerCLI(script);
    return JSON.parse(result);
}

// Complete workflow handler
async function handleCompleteWorkflow(req, res) {
    const {
        hostName,
        lunId,
        serialNumber,
        initialDatastoreName,
        finalDatastoreName,
        clusterName,
        vmName
    } = req.body;

    try {
        // Step 1: Create Datastore
        await rescanStorage(hostName);
        const volume = await getVolumeByLUNSerial(hostName, lunId, serialNumber);
        const newDatastore = await createDatastore(hostName, volume.CanonicalName, initialDatastoreName);
        
        // Step 2: Rename Datastore
        const renamedDatastore = await getAndRenameDatastore(initialDatastoreName, finalDatastoreName);
        
        // Step 3: Register VM
        const registeredVM = await browseAndRegisterVM(finalDatastoreName, clusterName);
        
        // Step 4: Reconfigure Hardware
        const reconfiguredVM = await reconfigureVMHardware(registeredVM.Name);
        
        // Step 5: Power On
        const powerState = await managePowerState(registeredVM.Name, 'poweron');
        
        res.json({
            success: true,
            workflow: {
                datastore: renamedDatastore,
                vm: reconfiguredVM,
                powerState: powerState
            }
        });
    } catch (error) {
        console.error('Error in workflow:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    rescanStorage,
    getVolumeByLUNSerial,
    createDatastore,
    getAndRenameDatastore,
    browseAndRegisterVM,
    reconfigureVMHardware,
    managePowerState,
    handleCompleteWorkflow
};