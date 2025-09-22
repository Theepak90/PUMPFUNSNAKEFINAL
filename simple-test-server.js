// Simple WebSocket test server
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const server = createServer();
const wss = new WebSocketServer({ 
  server, 
  path: '/ws' 
});

console.log('🔌 Simple WebSocket Test Server');
console.log('================================');

wss.on('connection', (ws, req) => {
  console.log('✅ WebSocket connection established!');
  console.log(`📨 URL: ${req.url}`);
  console.log(`🌐 Origin: ${req.headers.origin || 'unknown'}`);
  
  // Send welcome message
  ws.send(JSON.stringify({ 
    type: 'welcome', 
    message: 'Connected to test server!',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', message);
      
      // Echo back the message
      ws.send(JSON.stringify({
        type: 'echo',
        originalMessage: message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.log('📨 Received raw message:', data.toString());
      ws.send(JSON.stringify({
        type: 'echo',
        message: data.toString(),
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`❌ WebSocket connection closed (code: ${code}, reason: ${reason})`);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

server.listen(3001, () => {
  console.log('🚀 Simple WebSocket test server running on port 3001');
  console.log('🔌 WebSocket available at: ws://localhost:3001/ws');
  console.log('🧪 Test with: node websocket-test.js');
  console.log('🛑 Press Ctrl+C to stop');
});
