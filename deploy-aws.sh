#!/bin/bash

# AWS EC2 Deployment Script for PixelPal Backend
# Usage: ./deploy-aws.sh [EC2_INSTANCE_IP] [KEY_FILE_PATH]

set -e

# Configuration
EC2_IP=${1:-"your-ec2-ip-here"}
KEY_FILE=${2:-"~/.ssh/your-key.pem"}
APP_NAME="pixelpal-backend"
REMOTE_DIR="/home/ubuntu/$APP_NAME"

echo "🚀 Starting AWS EC2 deployment for $APP_NAME..."

# Check if required parameters are provided
if [ "$EC2_IP" = "your-ec2-ip-here" ]; then
    echo "❌ Error: Please provide EC2 instance IP"
    echo "Usage: ./deploy-aws.sh [EC2_INSTANCE_IP] [KEY_FILE_PATH]"
    exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Error: SSH key file not found: $KEY_FILE"
    exit 1
fi

echo "📦 Building application..."
npm run build:full

echo "📁 Creating deployment package..."
rm -rf deploy-package
mkdir deploy-package
cp -r dist/* deploy-package/
cp package.json deploy-package/
cp env.production deploy-package/.env
cp users.json deploy-package/
cp -r shared deploy-package/
cp -r migrations deploy-package/
cp -r scripts deploy-package/
cp drizzle.config.ts deploy-package/

echo "🔑 Uploading to EC2 instance $EC2_IP..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$EC2_IP << 'EOF'
    # Create app directory if it doesn't exist
    mkdir -p $REMOTE_DIR
    cd $REMOTE_DIR
    
    # Stop existing process if running
    if pgrep -f "node.*index.js" > /dev/null; then
        echo "🛑 Stopping existing process..."
        pkill -f "node.*index.js"
        sleep 2
    fi
    
    # Backup existing data
    if [ -f "users.json" ]; then
        cp users.json users.json.backup.$(date +%Y%m%d_%H%M%S)
    fi
EOF

# Upload files
scp -i "$KEY_FILE" -r deploy-package/* ubuntu@$EC2_IP:$REMOTE_DIR/

echo "🔧 Installing dependencies and starting application..."
ssh -i "$KEY_FILE" ubuntu@$EC2_IP << 'EOF'
    cd $REMOTE_DIR
    
    echo "📥 Installing dependencies..."
    npm install --production
    
    echo "🗄️ Running database migration for friends system..."
    if [ -f "scripts/run-migration.js" ]; then
        node scripts/run-migration.js || echo "⚠️ Migration failed - check DATABASE_URL in .env"
    else
        echo "⚠️ Migration script not found"
    fi
    
    echo "🚀 Starting application..."
    nohup npm start > app.log 2>&1 &
    
    echo "⏳ Waiting for application to start..."
    sleep 5
    
    # Check if app is running
    if pgrep -f "node.*index.js" > /dev/null; then
        echo "✅ Application started successfully!"
        echo "📊 Process ID: $(pgrep -f 'node.*index.js')"
        echo "📝 Logs: tail -f $REMOTE_DIR/app.log"
    else
        echo "❌ Application failed to start. Check logs:"
        tail -20 app.log
        exit 1
    fi
    
    # Test health endpoint
    echo "🏥 Testing health endpoint..."
    sleep 2
    if curl -s http://localhost:3000/health > /dev/null; then
        echo "✅ Health check passed!"
    else
        echo "❌ Health check failed!"
    fi
EOF

echo "🧹 Cleaning up local deployment package..."
rm -rf deploy-package

echo "🎉 Deployment completed successfully!"
echo "🌐 Your backend is now running on EC2 at: http://$EC2_IP:3000"
echo "📊 Health check: http://$EC2_IP:3000/health"
echo "📝 To view logs: ssh -i $KEY_FILE ubuntu@$EC2_IP 'tail -f $REMOTE_DIR/app.log'" 