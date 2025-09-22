@echo off
echo 🚀 Starting Development Servers
echo ================================

echo 🔧 Starting main server...
start "Main Server" cmd /k "npm run dev"

echo ⏳ Waiting for main server to start...
timeout /t 3 /nobreak > nul

echo 🎮 Starting WebSocket server...
start "WebSocket Server" cmd /k "node websocket-server.js"

echo ✅ Both servers started!
echo.
echo 📊 Server Status:
echo    Main Server: http://localhost:3000
echo    WebSocket Server: ws://localhost:3002/ws
echo    Browser Test: Open browser-websocket-test.html
echo.
echo 🧪 Test WebSocket: node websocket-test.js
echo.
pause
