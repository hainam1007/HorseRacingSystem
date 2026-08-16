require('dotenv').config();
const axios = require('axios');

async function testAllAdminAPIs() {
  // Login
  const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
    email: 'admin@racing.test',
    password: 'Password123'
  });
  const token = loginRes.data.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  
  console.log('Testing all admin API endpoints...\n');
  
  const endpoints = [
    { name: 'Dashboard', url: '/api/admin/dashboard' },
    { name: 'Betting Summary', url: '/api/admin/betting-summary' },
    { name: 'Deposit Requests', url: '/api/admin/deposit-requests' },
    { name: 'Users', url: '/api/admin/users' },
    { name: 'Tournaments', url: '/api/tournaments' },
    { name: 'Rounds', url: '/api/rounds' },
    { name: 'Races', url: '/api/races' },
    { name: 'Registrations', url: '/api/registrations' },
    { name: 'Race Results', url: '/api/race-results' },
    { name: 'Violations', url: '/api/violations' },
    { name: 'Jockey Assignments', url: '/api/jockey-assignments' },
    { name: 'Horse Checks', url: '/api/horse-checks' },
    { name: 'Referee Reports', url: '/api/referee-reports' },
    { name: 'Rewards', url: '/api/admin/rewards' },
    { name: 'Role Applications', url: '/api/admin/role-applications' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const res = await axios.get(`http://localhost:3000${endpoint.url}`, { headers });
      const keys = Object.keys(res.data);
      let dataInfo = '';
      
      if (Array.isArray(res.data)) {
        dataInfo = `Array length: ${res.data.length}`;
      } else if (res.data.data && Array.isArray(res.data.data)) {
        dataInfo = `data is Array length: ${res.data.data.length}`;
      } else if (res.data.data && typeof res.data.data === 'object') {
        const dataKeys = Object.keys(res.data.data);
        dataInfo = `data keys: ${dataKeys.slice(0, 5).join(', ')}${dataKeys.length > 5 ? '...' : ''}`;
      } else if (typeof res.data === 'object') {
        dataInfo = `keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
      }
      
      console.log(`✅ ${endpoint.name}: Status ${res.status} - ${dataInfo}`);
    } catch (e) {
      if (e.response) {
        console.log(`❌ ${endpoint.name}: Status ${e.response.status} - ${e.response.data?.message || e.message}`);
      } else {
        console.log(`❌ ${endpoint.name}: Error - ${e.message}`);
      }
    }
  }
}

testAllAdminAPIs().catch(console.error);
