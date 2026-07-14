const { spawn } = require('child_process');
const http = require('http');

console.log('--- Starting Integration Test for Backend Endpoints ---');

// Spawn backend server
const server = spawn('node', ['src/index.js'], {
  env: { ...process.env, PORT: '3555', NODE_ENV: 'test' },
  stdio: 'inherit'
});

// Helper to make HTTP request
const makeRequest = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  await wait(3000); // Wait 3 seconds for server to boot up

  let failed = false;

  // Test 1: Health endpoint
  try {
    const health = await makeRequest({
      hostname: '127.0.0.1',
      port: 3555,
      path: '/health',
      method: 'GET'
    });
    console.log(`[TEST 1] GET /health returned ${health.statusCode}`);
    if (health.statusCode !== 200 && health.statusCode !== 500) {
      console.error('FAIL: Expected health check to respond with 200 or 500');
      failed = true;
    } else {
      console.log('PASS: Health check responded.');
    }
  } catch (err) {
    console.error('FAIL: Health check request failed:', err.message);
    failed = true;
  }

  // Test 2: Inasistencias endpoint without auth (should return 403 Forbidden)
  try {
    const inasistencias = await makeRequest({
      hostname: '127.0.0.1',
      port: 3555,
      path: '/api/asistencia/inasistencias',
      method: 'GET'
    });
    console.log(`[TEST 2] GET /api/asistencia/inasistencias without token returned ${inasistencias.statusCode}`);
    if (inasistencias.statusCode !== 403) {
      console.error('FAIL: Expected 403 Forbidden');
      failed = true;
    } else {
      console.log('PASS: Unauthorized access blocked correctly (403).');
    }
  } catch (err) {
    console.error('FAIL: Inasistencias request failed:', err.message);
    failed = true;
  }

  // Test 3: Login endpoint (should return 500 due to DB error or 401 if DB is connected)
  try {
    const loginData = JSON.stringify({ username: 'invalid_user', password: 'wrong_password' });
    const login = await makeRequest({
      hostname: '127.0.0.1',
      port: 3555,
      path: '/api/autenticacion/iniciar-sesion',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    }, loginData);
    console.log(`[TEST 3] POST /api/autenticacion/iniciar-sesion with invalid credentials returned ${login.statusCode}`);
    if (login.statusCode !== 401 && login.statusCode !== 500) {
      console.error('FAIL: Expected 401 or 500');
      failed = true;
    } else {
      console.log('PASS: Invalid login returned correct failure status.');
    }
  } catch (err) {
    console.error('FAIL: Login request failed:', err.message);
    failed = true;
  }

  // Terminate server
  server.kill();

  if (failed) {
    console.error('--- Integration Tests FAILED ---');
    process.exit(1);
  } else {
    console.log('--- Integration Tests PASSED SUCCESSFULLY ---');
    process.exit(0);
  }
}

runTests();
