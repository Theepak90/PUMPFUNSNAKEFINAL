#!/bin/bash

# Netlify Frontend Deployment Script
# Usage: ./deploy-netlify.sh [EC2_IP_ADDRESS]

set -e

EC2_IP=${1:-"your-ec2-ip-here"}

if [ "$EC2_IP" = "your-ec2-ip-here" ]; then
    echo "❌ Error: Please provide EC2 IP address"
    echo "Usage: ./deploy-netlify.sh [EC2_IP_ADDRESS]"
    exit 1
fi

echo "🚀 Starting Netlify frontend deployment..."

# Update environment variables with EC2 IP
echo "🔧 Updating environment variables..."
sed -i.bak "s/your-ec2-ip/$EC2_IP/g" client/env.production
sed -i.bak "s/your-ec2-ip/$EC2_IP/g" client/netlify.toml

echo "📦 Building frontend..."
cd client
npm run build

echo "✅ Frontend build completed!"
echo ""
echo "🌐 Next steps for Netlify deployment:"
echo "1. Push your code to GitHub"
echo "2. Connect your repository to Netlify"
echo "3. Set build settings:"
echo "   - Build command: npm run build"
echo "   - Publish directory: dist"
echo "4. Set environment variables in Netlify:"
echo "   - VITE_BACKEND_URL: http://$EC2_IP:3000"
echo "   - VITE_WS_URL: ws://$EC2_IP:3000/ws"
echo ""
echo "🔗 Your backend will be accessible at: http://$EC2_IP:3000"
echo "📊 Health check: http://$EC2_IP:3000/health"

# Restore original files
cd ..
git checkout -- client/env.production client/netlify.toml 