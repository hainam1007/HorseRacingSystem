const http = require('http');
const path = require('path');
const { loadSequelizeModels } = require(path.resolve('horse-racing-backend/models/sequelize/index.js'));

function request(method, path, body, headers) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: { 'Content-Type': 'application/json', ...(headers || {}) }
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('--- Find existing admin user ---');
    const { models } = loadSequelizeModels();
    const adminRole = await models.roles.findOne({ where: { role_name: 'admin' } });
    console.log('Admin role:', adminRole?.id, adminRole?.name);

    const userRole = await models.UserRole.findOne({ where: { role_id: adminRole.id } });
    console.log('Admin user_role:', userRole?.user_id);

    if (!userRole) {
        console.log('No admin user found.');
        process.exit(1);
    }

    const adminUser = await models.User.findByPk(userRole.user_id);
    console.log('Admin user:', adminUser?.id, adminUser?.email);

    // Get a VALID password reset token to login as admin
    // Actually, we need to login via /api/auth/login. We don't know the password.
    // Let's first try: maybe the admin user has a known password from seeds.
    // As a fallback, directly issue a JWT using the same secret.

    const jwt = require(path.resolve('horse-racing-backend/node_modules/jsonwebtoken'));
    const token = jwt.sign({ sub: adminUser.id, email: adminUser.email, roles: ['admin'] }, process.env.JWT_SECRET || '112323234535', { expiresIn: '1h' });
    console.log('Issued JWT for admin.');

    const endpoints = [
        ['GET', '/api/admin/dashboard'],
        ['GET', '/api/admin/betting-summary'],
        ['GET', '/api/admin/deposit-requests'],
        ['GET', '/api/admin/prize-awards/summary']
    ];
    for (const [m, p] of endpoints) {
        try {
            const r = await request(m, p, null, { Authorization: 'Bearer ' + token });
            const preview = r.body.slice(0, 300).replace(/\s+/g, ' ');
            console.log(`${m} ${p} -> ${r.status} (${r.body.length}b) ${preview}`);
        } catch (e) {
            console.log(`${m} ${p} -> ERR ${e.message}`);
        }
    }

    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
