#!/bin/bash

echo "🚀 Starting Development Servers"
echo "================================"

echo "🔧 Starting main server..."
npm run dev &
MAIN_PID=$!

echo "⏳ Waiting for main server to start..."
sleep 3

echo "🎮 Starting WebSocket server..."
node websocket-server.js &
WS_PID=$!

echo "✅ Both servers started!"
echo ""
echo "📊 Server Status:"
echo "   Main Server: http://localhost:3000"
echo "   WebSocket Server: ws://localhost:3002/ws"
echo "   Browser Test: Open browser-websocket-test.html"
echo ""
echo "🧪 Test WebSocket: node websocket-test.js"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Stopping servers..."
    kill $MAIN_PID 2>/dev/null
    kill $WS_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Wait for both processes
wait
