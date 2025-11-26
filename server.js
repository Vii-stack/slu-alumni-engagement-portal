const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Initialize Database
const db = new sqlite3.Database('./alumni.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize Database Tables
function initializeDatabase() {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        gradYear TEXT,
        careerField TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Events table
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        date TEXT,
        image TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Insert default events if table is empty
        db.get('SELECT COUNT(*) as count FROM events', (err, row) => {
            if (!err && row.count === 0) {
                const defaultEvents = [
                    ['Alumni Networking Night', 'Connect with fellow alumni across different fields', 'Campus Center', '2025-02-25', 'images/Networking.jpeg'],
                    ['Career Growth Workshop', 'Resume polishing, LinkedIn optimization, and interview preparation', 'Online (Zoom)', '2025-03-10', 'images/Career.jpeg'],
                    ['Annual Alumni Gala', 'Formal celebration honoring achievements of alumni', 'City Event Hall', '2025-04-20', 'images/Gala.jpeg']
                ];
                const stmt = db.prepare('INSERT INTO events (title, description, location, date, image) VALUES (?, ?, ?, ?, ?)');
                defaultEvents.forEach(event => stmt.run(event));
                stmt.finalize();
            }
        });
    });

    // Event registrations table
    db.run(`CREATE TABLE IF NOT EXISTS event_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        eventId INTEGER NOT NULL,
        registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, eventId),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (eventId) REFERENCES events(id)
    )`);

    // Mentors table
    db.run(`CREATE TABLE IF NOT EXISTS mentors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        title TEXT,
        company TEXT,
        image TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Insert default mentors if table is empty
        db.get('SELECT COUNT(*) as count FROM mentors', (err, row) => {
            if (!err && row.count === 0) {
                const defaultMentors = [
                    ['Sarah Thompson', 'Software Engineer', 'Microsoft', 'images/mentor1.jpeg'],
                    ['James Anderson', 'Data Analyst', 'Deloitte', 'images/mentor2.jpeg'],
                    ['Olivia Martinez', 'Marketing Lead', 'Nike', 'images/mentor3.jpeg'],
                    ['Michael Lee', 'Business Consultant', 'IBM', 'images/mentor4.jpeg'],
                    ['Rachel Kim', 'Healthcare Management', 'Mayo Clinic', 'images/mentor5.jpeg'],
                    ['Anthony Brown', 'Financial Advisor', 'Wells Fargo', 'images/mentor6.jpeg']
                ];
                const stmt = db.prepare('INSERT INTO mentors (name, title, company, image) VALUES (?, ?, ?, ?)');
                defaultMentors.forEach(mentor => stmt.run(mentor));
                stmt.finalize();
            }
        });
    });

    // Mentor requests table
    db.run(`CREATE TABLE IF NOT EXISTS mentor_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        mentorId INTEGER NOT NULL,
        careerField TEXT,
        gradYear TEXT,
        status TEXT DEFAULT 'pending',
        requestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (mentorId) REFERENCES mentors(id)
    )`);

    // Donations table
    db.run(`CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        fund TEXT NOT NULL,
        amount REAL NOT NULL,
        donatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    // Feedback table
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        message TEXT NOT NULL,
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Alumni Portal API is running' });
});

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
    const { fullName, email, password, gradYear, careerField } = req.body;

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (fullName, email, password, gradYear, careerField) VALUES (?, ?, ?, ?, ?)',
            [fullName, email, hashedPassword, gradYear || null, careerField || null],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email already registered' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }

                const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ 
                    token, 
                    user: { id: this.lastID, fullName, email, gradYear, careerField } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        try {
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    fullName: user.fullName, 
                    email: user.email, 
                    gradYear: user.gradYear, 
                    careerField: user.careerField 
                } 
            });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });
});

// User Routes
app.get('/api/user/profile', authenticateToken, (req, res) => {
    db.get('SELECT id, fullName, email, gradYear, careerField FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    });
});

app.put('/api/user/profile', authenticateToken, (req, res) => {
    const { fullName, gradYear, careerField } = req.body;
    
    db.run(
        'UPDATE users SET fullName = ?, gradYear = ?, careerField = ? WHERE id = ?',
        [fullName, gradYear, careerField, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

// Events Routes
app.get('/api/events', authenticateToken, (req, res) => {
    db.all('SELECT * FROM events ORDER BY date ASC', (err, events) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(events);
    });
});

app.get('/api/events/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM events WHERE id = ?', [req.params.id], (err, event) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json(event);
    });
});

app.post('/api/events/:id/register', authenticateToken, (req, res) => {
    // Check if already registered
    db.get(
        'SELECT * FROM event_registrations WHERE userId = ? AND eventId = ?',
        [req.user.id, req.params.id],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (row) {
                return res.status(400).json({ error: 'Already registered for this event' });
            }
            
            // Register for event
            db.run(
                'INSERT INTO event_registrations (userId, eventId) VALUES (?, ?)',
                [req.user.id, req.params.id],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return res.status(400).json({ error: 'Already registered for this event' });
                        }
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ message: 'Successfully registered for event' });
                }
            );
        }
    );
});

app.get('/api/events/registrations/my', authenticateToken, (req, res) => {
    db.all(
        `SELECT e.*, er.registeredAt 
         FROM events e 
         INNER JOIN event_registrations er ON e.id = er.eventId 
         WHERE er.userId = ? 
         ORDER BY er.registeredAt DESC`,
        [req.user.id],
        (err, registrations) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(registrations);
        }
    );
});

// Mentors Routes
app.get('/api/mentors', authenticateToken, (req, res) => {
    db.all('SELECT * FROM mentors ORDER BY name ASC', (err, mentors) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(mentors);
    });
});

app.get('/api/mentors/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM mentors WHERE id = ?', [req.params.id], (err, mentor) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!mentor) {
            return res.status(404).json({ error: 'Mentor not found' });
        }
        res.json(mentor);
    });
});

app.post('/api/mentors/:id/request', authenticateToken, (req, res) => {
    const { careerField, gradYear } = req.body;
    
    db.run(
        'INSERT INTO mentor_requests (userId, mentorId, careerField, gradYear) VALUES (?, ?, ?, ?)',
        [req.user.id, req.params.id, careerField, gradYear],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Mentor request submitted successfully' });
        }
    );
});

app.get('/api/mentors/requests/my', authenticateToken, (req, res) => {
    db.all(
        `SELECT mr.*, m.name as mentorName, m.title as mentorTitle, m.company as mentorCompany 
         FROM mentor_requests mr 
         INNER JOIN mentors m ON mr.mentorId = m.id 
         WHERE mr.userId = ? 
         ORDER BY mr.requestedAt DESC`,
        [req.user.id],
        (err, requests) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(requests);
        }
    );
});

// Donations Routes
app.post('/api/donations', authenticateToken, (req, res) => {
    const { fund, amount } = req.body;

    if (!fund || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid fund and amount are required' });
    }

    db.run(
        'INSERT INTO donations (userId, fund, amount) VALUES (?, ?, ?)',
        [req.user.id, fund, amount],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                message: 'Donation recorded successfully',
                donation: { id: this.lastID, fund, amount, donatedAt: new Date().toISOString() }
            });
        }
    );
});

app.get('/api/donations/my', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM donations WHERE userId = ? ORDER BY donatedAt DESC',
        [req.user.id],
        (err, donations) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(donations);
        }
    );
});

// Feedback Routes
app.post('/api/feedback', authenticateToken, (req, res) => {
    const { message } = req.body;

    if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Feedback message is required' });
    }

    db.run(
        'INSERT INTO feedback (userId, message) VALUES (?, ?)',
        [req.user.id, message.trim()],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                message: 'Feedback submitted successfully',
                feedback: { id: this.lastID, message: message.trim(), submittedAt: new Date().toISOString() }
            });
        }
    );
});

app.get('/api/feedback/my', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM feedback WHERE userId = ? ORDER BY submittedAt DESC',
        [req.user.id],
        (err, feedbacks) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(feedbacks);
        }
    );
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    // Get event registrations count
    db.get('SELECT COUNT(*) as count FROM event_registrations WHERE userId = ?', [userId], (err, eventRow) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        // Get mentor requests count
        db.get('SELECT COUNT(*) as count FROM mentor_requests WHERE userId = ?', [userId], (err, mentorRow) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            // Get total donations
            db.get('SELECT SUM(amount) as total FROM donations WHERE userId = ?', [userId], (err, donationRow) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                
                // Calculate engagement score (simple calculation)
                const eventCount = eventRow.count || 0;
                const mentorCount = mentorRow.count || 0;
                const donationTotal = donationRow.total || 0;
                const engagementScore = Math.min(100, Math.round((eventCount * 15) + (mentorCount * 10) + (donationTotal / 10)));
                
                res.json({
                    engagementScore,
                    eventsAttended: eventCount,
                    mentorRequests: mentorCount,
                    totalDonations: donationTotal || 0
                });
            });
        });
    });
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, req.path === '/' ? 'index.html' : req.path));
});

// Start server
app.listen(PORT, () => {
    console.log(`Alumni Portal server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

