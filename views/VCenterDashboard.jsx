// VCenterDashboard.jsx
import React from 'react';

const styles = `
  .dashboard-container {
    min-height: 100vh;
    background-color: #f5f5f5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  .header {
    background-color: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .vcenter-info {
    display: flex;
    gap: 2rem;
  }

  .info-group {
    display: flex;
    flex-direction: column;
  }

  .info-label {
    font-size: 0.875rem;
    color: #666;
  }

  .info-value {
    font-weight: 500;
    color: #333;
  }

  .nav-tabs {
    border-bottom: 1px solid #e5e5e5;
    background: white;
  }

  .nav-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    gap: 2rem;
  }

  .nav-tab {
    padding: 1rem 0.5rem;
    color: #666;
    text-decoration: none;
    position: relative;
  }

  .nav-tab.active {
    color: #2563eb;
  }

  .nav-tab.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background-color: #2563eb;
  }

  .main-content {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e5e5e5;
  }

  .card-title {
    font-size: 1.25rem;
    font-weight: 500;
    color: #333;
  }

  .reload-button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .reload-button:hover {
    background: #f5f5f5;
  }

  .hosts-table {
    width: 100%;
    border-collapse: collapse;
  }

  .hosts-table th {
    text-align: left;
    padding: 1rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #666;
    border-bottom: 1px solid #e5e5e5;
  }

  .hosts-table td {
    padding: 1rem;
    border-bottom: 1px solid #e5e5e5;
  }

  .hosts-table tr:hover {
    background-color: #f5f5f5;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background-color: #dcfce7;
    color: #166534;
  }

  @media (max-width: 768px) {
    .vcenter-info {
      flex-direction: column;
      gap: 1rem;
    }

    .hosts-table {
      display: block;
      overflow-x: auto;
    }
  }
`;

const VCenterDashboard = () => {
  const hosts = [
    { name: 'pgd-jkt-srd-svr-01.pegadaian.co.id', status: 'Connected', cpu: 48, memory: 1791.41 },
    { name: 'pgd-jkt-srd-svr-03.pegadaian.co.id', status: 'Connected', cpu: 48, memory: 1791.41 },
    { name: 'pgd-jkt-srd-svr-02.pegadaian.co.id', status: 'Connected', cpu: 48, memory: 1791.41 }
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="dashboard-container">
        <header className="header">
          <div className="header-content">
            <div className="vcenter-info">
              <div className="info-group">
                <span className="info-label">vCenter Name</span>
                <span className="info-value">JKT-VCENTER</span>
              </div>
              <div className="info-group">
                <span className="info-label">vCenter IP</span>
                <span className="info-value">10.254.254.77</span>
              </div>
            </div>
          </div>
        </header>

        <nav className="nav-tabs">
          <div className="nav-content">
            <a href="#" className="nav-tab active">VM Hosts</a>
            <a href="#" className="nav-tab">Datastores</a>
            <a href="#" className="nav-tab">Virtual Machines</a>
          </div>
        </nav>

        <main className="main-content">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">ESXi Hosts</h2>
              <button className="reload-button" onClick={() => fetchVMHosts(true)}>
                Reload ESXi Hosts
              </button>
            </div>
            <table className="hosts-table">
              <thead>
                <tr>
                  <th>Host Name</th>
                  <th>Status</th>
                  <th>CPU</th>
                  <th>Memory (GB)</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((host, index) => (
                  <tr key={index}>
                    <td>{host.name}</td>
                    <td>
                      <span className="status-badge">{host.status}</span>
                    </td>
                    <td>{host.cpu}</td>
                    <td>{host.memory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  );
};

export default VCenterDashboard;