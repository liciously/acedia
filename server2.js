process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
//const fetch = require('node-fetch'); // Ensure fetch is imported
const app = express();
const port = 3000;
const https = require('https');

// Check if the app is packaged
const isPackaged = process.pkg !== undefined;

// Determine the correct path for the SQLite database
const dbPath = isPackaged
  ? path.join(process.cwd(), 'data', 'users.db')
  : path.join(__dirname, 'data', 'users.db');

/*const agent = new https.Agent({
    rejectUnauthorized: false, // Disable SSL verification
});*/


console.log("Database path:", dbPath);

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set the views directory

// Serve static files from the "public" directory
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set up SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Ensure the users table is ready
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT)");
    // Create protection_groups table
    db.run(`CREATE TABLE IF NOT EXISTS protection_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL)`);
});

// session handler
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Route to serve the login page
app.get('/', (req, res) => {
    res.render('login'); // Render the login.ejs view
});

// Serve the register page
app.get('/register', (req, res) => {
    res.render('register'); // Render the register.ejs view
});

// Route to handle user login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error("Error checking username:", err);
            return res.status(500).send("Internal server error");
        }

        if (!row) {
            return res.status(400).send("Invalid username or password");
        }

        // Compare the entered password with the stored hashed password
        bcrypt.compare(password, row.password, (err, isMatch) => {
            if (err) {
                console.error("Error comparing passwords:", err);
                return res.status(500).send("Internal server error");
            }

            if (isMatch) {
                // Store user data in session
                req.session.user = row;
                console.log('Login successful, session data:', req.session.user);
                return res.redirect('/dashboard');
            } else {
                res.status(400).send("Invalid username or password");
            }
        });
    });
});

// Dashboard route
/*app.get('/dashboard', async (req, res) => {


    if (!req.session.user) {
        return res.redirect('/');
    }


    // Fetch FlashArray data dynamically
    fetchFlashArrayData()
        .then(flashArrayData => {
            res.render('dashboard', { user: req.session.user, flashArrayData }); // Pass user data and FlashArray data to the view
        })
        .catch(error => {
            console.error("Error fetching FlashArray data:", error);
            res.render('dashboard', { user: req.session.user, flashArrayData: null });
        });
//});*/
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    try {
        // Step 1: Obtain API Token
        const response = await fetch('https://10.254.1.173/api/1.17/auth/apitoken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'mtc-server',
                password: 'k3W07iGGASwkBfh',
            }),
            //agent: agent, // Add the custom HTTPS agent
        });


        const responseText = await response.text(); 
        console.log("Raw Response Text:", responseText);

        let apiTokenData;
        try {
            apiTokenData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse response:', e);
            return res.status(500).json({ error: 'Failed to parse FlashArray API response' });
        }

        console.log("Parsed API Token Data:", apiTokenData);
        if (!apiTokenData.api_token) {
            return res.status(400).json({ error: 'API Token not found in response' });
        }

        const apiToken = apiTokenData.api_token;

        // Step 2: Login to FlashArray with API Token
        const loginResponse = await fetch('https://10.254.1.173/api/2.17/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-token': apiToken, 
            },
        });

        if (!loginResponse.ok) {
            console.error('Login request failed with status:', loginResponse.status);
            return res.status(500).json({ error: 'Failed to log in to FlashArray' });
        }

        // Extract X-Auth-Token
        const xAuthToken = loginResponse.headers.get('X-Auth-Token');
        console.log('X-Auth-Token:', xAuthToken);
        if (!xAuthToken) {
            return res.status(500).json({ error: 'X-Auth-Token not received from login response' });
        }

        // Step 3: Fetch FlashArray Data
        const flashArrayData = await fetchFlashArrayData(xAuthToken);
        console.log(flashArrayData);

        // Add PG DB
        db.all('SELECT * FROM protection_groups', (err, rows) => {
            if (err) {
                console.error("Error fetching protection groups:", err);
                return res.status(500).send("Internal server error");
            }
            const protectionGroups = rows;

        // Step 4: Render Dashboard

        //const protectionGroups = [];
        res.render('dashboard', { user: req.session.user, flashArrayData, protectionGroups });
    }); 
    }catch (error) {
        console.error('Error during FlashArray API calls:', error);
        res.status(500).json({ error: 'Failed to process FlashArray API calls' });
    }
});




// Fetch FlashArray data from the API
async function fetchFlashArrayData(xAuthToken) {
    try {
        const response = await fetch('https://10.254.1.173/api/2.17/arrays', {
            method: 'GET',
            headers: {
                'x-auth-token': xAuthToken, // Replace with actual API token or method to fetch it
            },
        });

        const data = await response.json();
        if (!data || !data.items) {
            throw new Error("Failed to fetch valid data.");
        }

        return data.items; // Return the arrays data
    } catch (error) {
        console.error('Error fetching FlashArray data:', error);
        throw error;
    }
}
// Route to render the form for adding protection group
app.get('/add-protection-group', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.render('add-protection-group'); // Render the add-protection-group.ejs view
});

// Route to handle adding protection group
app.post('/add-protection-group', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const { name, type, source, target, status } = req.body;

    // Insert the protection group into the database
    db.run(`INSERT INTO protection_groups (name) VALUES (?)`,
        [name],
        function(err) {
            if (err) {
                console.error("Error inserting protection group:", err);
                return res.status(500).send("Internal server error");
            }

            console.log('Protection group added with ID:', this.lastID);
            res.redirect('/dashboard'); // Redirect to the dashboard after successful insertion
        });
});

// Route to delete a protection group
app.post('/delete-protection-group/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const protectionGroupId = req.params.id;

    // Delete the protection group from the database
    db.run('DELETE FROM protection_groups WHERE id = ?', [protectionGroupId], function(err) {
        if (err) {
            console.error("Error deleting protection group:", err);
            return res.status(500).send("Internal server error");
        }

        if (this.changes === 0) {
            console.log(`Protection group with ID ${protectionGroupId} not found.`);
            return res.status(404).send("Protection group not found");
        }

        console.log(`Protection group with ID ${protectionGroupId} deleted.`);
        res.redirect('/dashboard'); // Redirect to dashboard after deletion
    });
});



// Route to handle user registration
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
        if (err) {
            console.error("Error checking username:", err);
            return res.status(500).send("Internal server error");
        }

        if (row) {
            return res.status(400).send("Username already exists.");
        }

        // Hash the password before saving to the database
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save the new user to the database
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
            if (err) {
                console.error("Error saving user:", err);
                return res.status(500).send("Internal server error");
            }

            res.redirect('/'); // Redirect to login page after successful registration
        });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
