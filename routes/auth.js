const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();

// ✅ Root Route for Login Page
router.get("/", (req, res) => {
    if (req.session.user) {
        // ✅ If already logged in, redirect to the Choose Environment page
        return res.redirect("/choose-environment");
    }
    res.render("login"); // Otherwise, show the login page
});



// Login Route
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) return res.status(500).send("Internal server error");
        if (!row) return res.status(400).send("Invalid username or password");

        bcrypt.compare(password, row.password, (err, isMatch) => {
            if (err) return res.status(500).send("Internal server error");
            if (isMatch) {
                req.session.user = row;
                return res.redirect('/choose-environment');
            } else {
                res.status(400).send("Invalid username or password");
            }
        });
    });
});

router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).send("Error logging out.");
        }
        res.redirect("/"); // Redirect to login page after logout
    });
});


// Register Route
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
        if (err) return res.status(500).send("Internal server error");
        if (row) return res.status(400).send("Username already exists.");

        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
            if (err) return res.status(500).send("Internal server error");
            res.redirect('/');
        });
    });
});
router.get('/choose-environment', (req, res) => {
    res.render('choose-environment'); // Create 'choose-environment.ejs'
});

router.post('/set-environment', (req, res) => {
    const { environment } = req.body;

    if (!environment || !['jkt', 'sby', 'ini'].includes(environment)) {
        return res.status(400).send('Invalid environment selection');
    }

    req.session.environment = environment;
    res.redirect('/choose-dashboard');
});


router.get('/choose-dashboard', (req, res) => {
    res.render('choose-Dashboard', { environment: req.session.environment || "Not Selected" });
});

module.exports = router;
