require('dotenv').config();
const axios = require('axios');

async function test() {
  const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
    email: 'admin@racing.test',
    password: 'Password123'
  });
  const token = loginRes.data.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  
  console.log('=== Testing Cancellation Tickets ===\n');
  
  try {
    const res = await axios.get('http://localhost:3000/api/admin/registration-cancellation-tickets', { headers });
    console.log('✅ Success:', res.data.message || 'OK');
    console.log('Tickets:', res.data.data?.length || 0);
  } catch (e) {
    console.log('❌ Error:', e.response?.data?.message || e.message);
  }
}

test();
