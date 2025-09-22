// Simple WebSocket connection test for Render deployment
import WebSocket from 'ws';

const testWebSocketConnection = async () => {
  const wsUrl = 'ws://localhost:3000/ws?region=us&room=1';
  
  // console.log(`🧪 Testing WebSocket connection to: ${wsUrl}`);
  
  try {
    const ws = new WebSocket(wsUrl);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection test timeout after 10 seconds'));
      }, 10000);
      
      ws.on('open', () => {
        console.log('✅ WebSocket connection test successful');
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket connection test failed:', error);
        clearTimeout(timeout);
        reject(error);
      });
      
      ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket closed with code: ${code}, reason: ${reason}`);
        clearTimeout(timeout);
      });
      
      ws.on('message', (data) => {
        console.log('📨 Received message:', data.toString());
      });
    });
  } catch (error) {
    console.error('❌ WebSocket connection test error:', error);
    throw error;
  }
};

// Test the connection
testWebSocketConnection()
  .then(() => {
    console.log('✅ WebSocket test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ WebSocket test failed:', error);
    process.exit(1);
  });
