// Disable TLS certificate validation (not recommended for production)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Import required modules
const express = require('express');
const session = require('./config/session');
const path = require('path');
const dotenv = require('dotenv');
// Load default environment file at startup (can be overridden per-session)
dotenv.config({ path: './ini.env', override: false }); // load defaults for initial logs
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const protectionRoutes = require('./routes/protection');
const vSphereRoutes = require('./routes/vSpherePowerCLI');

//require('dotenv').config({ path: './ini.env' }); //load env var

// Debug: Log environment variables to verify they are loaded
console.log('Pure Storage IP:', process.env.PURE_STORAGE_IP);
console.log('Port:', process.env.PORT);

// Initialize Express application
const app = express();
const port = process.env.PORT || 3000; // Use PORT from .env or fallback to 3000

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session);
app.set('view cache', false);

app.use((req, res, next) => {
    if (req.session.environment) {
        const envPath = `./${req.session.environment}.env`; // Example: env1.env, env2.env
        console.log(envPath);
        dotenv.config({ path: envPath, override: true });
        console.log('Pure Storage IP:', process.env.PURE_STORAGE_IP);
        console.log('vCenter IP:', process.env.VCENTER_IP);
        console.log(`🔄 Loaded Environment: ${req.session.environment}`);
    }
    next();
});



// Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/protection', protectionRoutes);
app.use('/vsphere', vSphereRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});