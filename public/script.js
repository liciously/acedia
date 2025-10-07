document.addEventListener('DOMContentLoaded', () => {
  // Sample data
  const data = [
    {
      array: "PGD-JKT-DEV-STR01",
      os: "Purity//FA",
      version: "6.3.15",
      alerts: "-",
      dataReduction: "5.0 : 1",
      capacity: "145.0 TiB",
      freeSpace: "127.9 TiB",
      utilization: 11.8
    },
    {
      array: "PGD-SBY-PS",
      os: "Purity//FA",
      version: "6.3.15",
      alerts: 1,
      dataReduction: "2.8 : 1",
      capacity: "43.4 TiB",
      freeSpace: "6.4 TiB",
      utilization: 85.3
    },
    {
      array: "PGD-JKT-PS",
      os: "Purity//FA",
      version: "6.3.15",
      alerts: 1,
      dataReduction: "3.0 : 1",
      capacity: "43.4 TiB",
      freeSpace: "5.5 TiB",
      utilization: 87.4
    }
  ];

  const dashboard = document.getElementById('dashboard-data');

  // Populate table with data
  data.forEach(row => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${row.array}</td>
      <td>${row.os}</td>
      <td>${row.version}</td>
      <td>${row.alerts}</td>
      <td>${row.dataReduction}</td>
      <td>${row.capacity}</td>
      <td>${row.freeSpace}</td>
      <td>
        <div class="capacity-bar">
          <div class="capacity-bar-fill" style="width: ${row.utilization}%;"></div>
        </div>
        ${row.utilization}%
      </td>
    `;

    dashboard.appendChild(tr);
  });
});
