const http = require('http');

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
    console.log('--- Test admin dashboard endpoints ---');
    const endpoints = [
        ['GET', '/api/auth/roles'],
        ['GET', '/api/tournaments'],
        ['GET', '/api/races'],
        ['GET', '/api/admin/dashboard'],
        ['GET', '/api/admin/betting-summary'],
        ['GET', '/api/admin/deposit-requests'],
        ['GET', '/api/admin/prize-awards/summary']
    ];
    for (const [m, p] of endpoints) {
        try {
            const r = await request(m, p);
            const len = r.body.length;
            const preview = r.body.slice(0, 200).replace(/\s+/g, ' ');
            console.log(`${m} ${p} -> ${r.status} (${len}b) ${preview}`);
        } catch (e) {
            console.log(`${m} ${p} -> ERR ${e.message}`);
        }
    }
}

main();
