// Comprehensive WebSocket Testing Tool
import WebSocket from 'ws';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testWebSocketConnection(url, testName) {
  log(colors.blue, `\n🧪 ${testName}`);
  log(colors.yellow, `🔗 Testing: ${url}`);
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    let connected = false;
    let error = null;
    
    try {
      const ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close();
          log(colors.red, `❌ ${testName} - Timeout after 5 seconds`);
          resolve({ success: false, error: 'Timeout', duration: Date.now() - startTime });
        }
      }, 5000);
      
      ws.on('open', () => {
        connected = true;
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        log(colors.green, `✅ ${testName} - Connected successfully in ${duration}ms`);
        ws.close();
        resolve({ success: true, duration });
      });
      
      ws.on('error', (err) => {
        error = err;
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        log(colors.red, `❌ ${testName} - Connection failed`);
        log(colors.red, `   Error: ${err.message}`);
        log(colors.red, `   Code: ${err.code || 'N/A'}`);
        resolve({ success: false, error: err.message, duration });
      });
      
      ws.on('close', (code, reason) => {
        if (connected) {
          log(colors.yellow, `🔌 ${testName} - Connection closed (code: ${code})`);
        }
      });
      
      ws.on('message', (data) => {
        log(colors.green, `📨 ${testName} - Received: ${data.toString()}`);
      });
      
    } catch (err) {
      log(colors.red, `❌ ${testName} - Exception: ${err.message}`);
      resolve({ success: false, error: err.message, duration: Date.now() - startTime });
    }
  });
}

async function runTests() {
  log(colors.bold, '🔧 WebSocket Connection Testing Tool');
  log(colors.bold, '=====================================');
  
  const tests = [
    {
      url: 'ws://localhost:3000/ws?region=us&room=1',
      name: 'Main Server WebSocket'
    },
    {
      url: 'ws://localhost:3000/ws',
      name: 'Main Server WebSocket (no params)'
    },
    {
      url: 'ws://localhost:3002/ws?region=us&room=1',
      name: 'Standalone Game Server'
    },
    {
      url: 'ws://localhost:3001/ws?region=us&room=1',
      name: 'Simple Test Server'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testWebSocketConnection(test.url, test.name);
    results.push({ ...test, ...result });
  }
  
  // Summary
  log(colors.bold, '\n📊 Test Summary');
  log(colors.bold, '================');
  
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const color = result.success ? colors.green : colors.red;
    log(color, `${status} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      log(colors.red, `   Error: ${result.error}`);
    }
  });
  
  // Recommendations
  log(colors.bold, '\n💡 Recommendations');
  log(colors.bold, '===================');
  
  const mainServerWorking = results.find(r => r.name === 'Main Server WebSocket')?.success;
  const simpleServerWorking = results.find(r => r.name === 'Simple Test Server')?.success;
  
  if (simpleServerWorking && !mainServerWorking) {
    log(colors.yellow, '🔧 Issue: Main server WebSocket not working, but simple server works');
    log(colors.yellow, '   → Problem is likely middleware interference');
    log(colors.yellow, '   → Check Vite middleware and Express routing');
    log(colors.yellow, '   → Consider using production build for local testing');
  } else if (!simpleServerWorking) {
    log(colors.red, '🔧 Issue: No WebSocket servers working');
    log(colors.red, '   → Check if servers are running');
    log(colors.red, '   → Check firewall/network settings');
    log(colors.red, '   → Verify WebSocket library installation');
  } else if (mainServerWorking) {
    log(colors.green, '🎉 All WebSocket connections working!');
  }
  
  log(colors.bold, '\n🔍 Debug Steps:');
  log(colors.blue, '1. Check server logs for WebSocket connection attempts');
  log(colors.blue, '2. Verify HTTP upgrade requests are reaching the server');
  log(colors.blue, '3. Test with browser developer tools Network tab');
  log(colors.blue, '4. Check for CORS or middleware blocking requests');
}

// Check if simple test server is running
async function checkSimpleServer() {
  try {
    const ws = new WebSocket('ws://localhost:3001/ws');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 1000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      
      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

// Start tests
checkSimpleServer().then(simpleServerRunning => {
  if (!simpleServerRunning) {
    log(colors.yellow, '⚠️  Simple test server not running on port 3001');
    log(colors.yellow, '   Run: node simple-ws-server.js (if available)');
  }
  runTests();
});
