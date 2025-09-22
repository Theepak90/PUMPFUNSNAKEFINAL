#!/bin/bash

# Deploy script for Render with WebSocket support
echo "🚀 Deploying to Render with WebSocket support..."

# Build the project
echo "📦 Building project..."
npm run build:full

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Test WebSocket connection locally first
echo "🧪 Testing WebSocket connection locally..."
node test-websocket.js

if [ $? -eq 0 ]; then
    echo "✅ Local WebSocket test passed"
else
    echo "⚠️ Local WebSocket test failed, but continuing with deployment"
fi

echo "🚀 Deployment ready!"
echo "📋 Make sure your Render service is configured with:"
echo "   - Build Command: npm run build"
echo "   - Start Command: npm start"
echo "   - Environment Variables:"
echo "     - NODE_ENV=production"
echo "     - PORT=5174"
echo "     - FRONTEND_URL=https://your-netlify-app.netlify.app"
echo ""
echo "🔌 WebSocket will be available at: wss://your-render-app.onrender.com/ws"
echo "📊 Health check: https://your-render-app.onrender.com/health"
echo "🔌 WebSocket health check: https://your-render-app.onrender.com/ws-health"
