#!/usr/bin/env node

const http = require('http');
const https = require('https');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testSecurityHeaders() {
  console.log('🔒 Testing Security Headers...');

  const response = await makeRequest(`${BASE_URL}/api/healthz`, {
    method: 'HEAD',
  });

  const requiredHeaders = [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection',
    'cross-origin-resource-policy',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
  ];

  let passed = 0;
  requiredHeaders.forEach(header => {
    if (response.headers[header]) {
      console.log(`  ✅ ${header}: ${response.headers[header]}`);
      passed++;
    } else {
      console.log(`  ❌ Missing header: ${header}`);
    }
  });

  console.log(`Security Headers: ${passed}/${requiredHeaders.length} passed\n`);
  return passed === requiredHeaders.length;
}

async function testCORS() {
  console.log('🌐 Testing CORS Configuration...');

  const response = await makeRequest(`${BASE_URL}/api/healthz`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
    },
  });

  const corsHeaders = [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-max-age',
  ];

  let passed = 0;
  corsHeaders.forEach(header => {
    if (response.headers[header]) {
      console.log(`  ✅ ${header}: ${response.headers[header]}`);
      passed++;
    } else {
      console.log(`  ❌ Missing CORS header: ${header}`);
    }
  });

  console.log(`CORS Headers: ${passed}/${corsHeaders.length} passed\n`);
  return passed === corsHeaders.length;
}

async function testHealthEndpoint() {
  console.log('🏥 Testing Health Check Endpoint...');

  const response = await makeRequest(`${BASE_URL}/api/healthz`);

  if (response.statusCode === 200) {
    try {
      const data = JSON.parse(response.data);
      const requiredFields = [
        'status',
        'buildSHA',
        'uptime',
        'timestamp',
        'version',
      ];

      let passed = 0;
      requiredFields.forEach(field => {
        if (data[field] !== undefined) {
          console.log(`  ✅ ${field}: ${data[field]}`);
          passed++;
        } else {
          console.log(`  ❌ Missing field: ${field}`);
        }
      });

      console.log(
        `Health Check: ${passed}/${requiredFields.length} fields present\n`
      );
      return passed === requiredFields.length;
    } catch (error) {
      console.log(`  ❌ Invalid JSON response: ${error.message}\n`);
      return false;
    }
  } else {
    console.log(
      `  ❌ Health check failed with status: ${response.statusCode}\n`
    );
    return false;
  }
}

async function testRateLimiting() {
  console.log('⏱️  Testing Rate Limiting...');

  const response = await makeRequest(`${BASE_URL}/api/test-rate-limit`);

  if (response.headers['x-ratelimit-limit']) {
    console.log(`  ✅ Rate limit headers present`);
    console.log(`  ✅ Limit: ${response.headers['x-ratelimit-limit']}`);
    console.log(`  ✅ Remaining: ${response.headers['x-ratelimit-remaining']}`);
    console.log(`Rate Limiting: Working\n`);
    return true;
  } else {
    console.log(`  ❌ Rate limiting headers not found\n`);
    return false;
  }
}

async function testMethodNotAllowed() {
  console.log('🚫 Testing Method Not Allowed...');

  const response = await makeRequest(`${BASE_URL}/api/healthz`, {
    method: 'POST',
  });

  if (response.statusCode === 405) {
    console.log(`  ✅ POST method correctly rejected with 405`);
    console.log(`  ✅ Allow header: ${response.headers.allow}`);
    console.log(`Method Restrictions: Working\n`);
    return true;
  } else {
    console.log(`  ❌ Expected 405, got ${response.statusCode}\n`);
    return false;
  }
}

async function runAllTests() {
  console.log(`🧪 Security Verification Tests for ${BASE_URL}\n`);

  const tests = [
    testSecurityHeaders,
    testCORS,
    testHealthEndpoint,
    testRateLimiting,
    testMethodNotAllowed,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
    } catch (error) {
      console.log(`  ❌ Test failed: ${error.message}\n`);
    }
  }

  console.log(`\n📊 Overall Results: ${passed}/${tests.length} tests passed`);

  if (passed === tests.length) {
    console.log('🎉 All security features are working correctly!');
    process.exit(0);
  } else {
    console.log('⚠️  Some security features need attention.');
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };
