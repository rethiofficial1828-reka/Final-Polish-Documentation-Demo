const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

// Initialize database file
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], analyses: [] }, null, 2));
} else {
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  if (!dbData.analyses) {
    dbData.analyses = [];
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  }
}

// A secure JSON database wrapper simulating SQL protection
// Using this to avoid node-gyp build failures on Windows with special characters in the path
const db = {
  getUsers: () => {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data).users || [];
  },
  saveUsers: (users) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    data.users = users;
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, dbPath);
  },
  getAnalyses: () => {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data).analyses || [];
  },
  saveAnalyses: (analyses) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    data.analyses = analyses;
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, dbPath);
  },
  
  // Simulated prepared statements for SQL Injection Protection
  prepare: (query) => {
    return {
      get: (...args) => {
        const users = db.getUsers();
        if (query.includes('email = ? OR username = ?')) {
          return users.find(u => u.email === args[0] || u.username === args[1]);
        }
        if (query.includes('SELECT count, sum(ai), sum(real) FROM analyses WHERE user_id = ?')) {
          const analyses = db.getAnalyses();
          const userAnalyses = analyses.filter(a => a.user_id === args[0]);
          return {
            total: userAnalyses.length,
            ai: userAnalyses.filter(a => a.verdict_level !== 'real').length,
            authentic: userAnalyses.filter(a => a.verdict_level === 'real').length
          };
        }
        if (query.includes('WHERE id = ?')) {
          return users.find(u => u.id === args[0]);
        }
        return null;
      },
      run: (...args) => {
        const users = db.getUsers();
        if (query.includes('INSERT INTO users')) {
          const newUser = {
            id: Date.now(), // Simulated AUTOINCREMENT
            full_name: args[0],
            username: args[1],
            email: args[2],
            password_hash: args[3],
            phone: args[4] || null,
            profile_image: null,
            is_verified: false,
            is_active: true,
            failed_login_attempts: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login: null,
            role: 'user',
            status: 'active'
          };
          users.push(newUser);
          db.saveUsers(users);
          return { lastInsertRowid: newUser.id };
        }
        if (query.includes('UPDATE users SET last_login')) {
          const userIndex = users.findIndex(u => u.id === args[0]);
          if (userIndex !== -1) {
            users[userIndex].last_login = new Date().toISOString();
            db.saveUsers(users);
          }
          return { changes: 1 };
        }
        if (query.includes('UPDATE users SET failed_login_attempts')) {
          const userIndex = users.findIndex(u => u.id === args[1]);
          if (userIndex !== -1) {
            users[userIndex].failed_login_attempts = args[0];
            db.saveUsers(users);
          }
          return { changes: 1 };
        }
        if (query.includes('UPDATE users SET is_active')) {
          const userIndex = users.findIndex(u => u.id === args[1]);
          if (userIndex !== -1) {
            users[userIndex].is_active = args[0];
            db.saveUsers(users);
          }
          return { changes: 1 };
        }
        if (query.includes('INSERT INTO analyses')) {
          const analyses = db.getAnalyses();
          const newAnalysis = {
            id: Date.now(),
            user_id: args[0],
            filename: args[1],
            verdict_level: args[2],
            ai_probability: args[3],
            created_at: new Date().toISOString()
          };
          analyses.push(newAnalysis);
          db.saveAnalyses(analyses);
          return { lastInsertRowid: newAnalysis.id };
        }
      }
    };
  }
};

module.exports = db;
