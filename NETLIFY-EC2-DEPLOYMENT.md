# 🚀 Netlify + AWS EC2 Deployment Guide

## 📋 Overview

This guide will help you deploy:
- **Frontend**: React app on Netlify
- **Backend**: Node.js server on AWS EC2
- **Real-time**: WebSocket connections between them

## 🔧 Step 1: Deploy Backend to AWS EC2

### 1.1 Launch EC2 Instance
```bash
# Follow the AWS-EC2-SETUP.md guide first
# Make sure your backend is running on EC2
```

### 1.2 Get Your EC2 IP Address
```bash
# From AWS Console or terminal
EC2_IP="your-actual-ec2-ip"
echo $EC2_IP
```

### 1.3 Deploy Backend
```bash
# Make sure you're in the project root
chmod +x deploy-aws.sh
./deploy-aws.sh $EC2_IP ~/.ssh/your-key.pem
```

### 1.4 Test Backend
```bash
# Test health endpoint
curl http://$EC2_IP:3000/health

# Test API
curl http://$EC2_IP:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

## 🌐 Step 2: Deploy Frontend to Netlify

### 2.1 Prepare Frontend for Production
```bash
# Update environment variables with your EC2 IP
chmod +x deploy-netlify.sh
./deploy-netlify.sh $EC2_IP
```

### 2.2 Push to GitHub
```bash
git add .
git commit -m "Configure for Netlify + EC2 deployment"
git push origin main
```

### 2.3 Deploy to Netlify

#### Option A: Netlify UI (Recommended)
1. Go to [netlify.com](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Base directory**: `client`
5. Set environment variables:
   - `VITE_BACKEND_URL`: `http://$EC2_IP:3000`
   - `VITE_WS_URL`: `ws://$EC2_IP:3000/ws`
6. Click "Deploy site"

#### Option B: Netlify CLI
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize and deploy
cd client
netlify init
netlify deploy --prod
```

## 🔗 Step 3: Configure Domain & SSL

### 3.1 Custom Domain (Optional)
1. In Netlify dashboard, go to "Domain settings"
2. Click "Add custom domain"
3. Follow DNS configuration instructions

### 3.2 SSL Certificate
- Netlify provides free SSL automatically
- Your site will be available at `https://your-app.netlify.app`

## 🧪 Step 4: Test the Complete System

### 4.1 Test Frontend
1. Visit your Netlify URL
2. Try to register/login
3. Check browser console for any CORS errors

### 4.2 Test Backend Connection
1. Open browser dev tools
2. Check Network tab for API calls
3. Verify they're going to your EC2 IP

### 4.3 Test WebSocket
1. Start a game
2. Check console for WebSocket connection
3. Verify real-time updates work

## 🚨 Step 5: Security & Production Setup

### 5.1 Update CORS in Backend
```bash
# SSH into your EC2 instance
ssh -i "your-key.pem" ubuntu@$EC2_IP

# Edit the production server
cd pixelpal-backend
nano .env
```

Add your Netlify domain:
```env
FRONTEND_URL=https://your-app.netlify.app
```

### 5.2 Restart Backend
```bash
# On EC2
pm2 restart pixelpal-backend
pm2 save
```

### 5.3 Test CORS
```bash
# From your local machine
curl -H "Origin: https://your-app.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  http://$EC2_IP:3000/api/auth/login
```

## 🔄 Step 6: Continuous Deployment

### 6.1 Automatic Backend Updates
```bash
# Set up GitHub Actions for automatic EC2 deployment
# See AWS-EC2-SETUP.md for details
```

### 6.2 Automatic Frontend Updates
- Netlify automatically deploys on every push to main branch
- No additional setup needed

## 📊 Step 7: Monitoring & Maintenance

### 7.1 Backend Monitoring
```bash
# On EC2
pm2 monit
pm2 logs pixelpal-backend
```

### 7.2 Frontend Monitoring
- Netlify provides built-in analytics
- Check "Functions" tab for any errors

### 7.3 Health Checks
```bash
# Test backend health
curl http://$EC2_IP:3000/health

# Test frontend
curl -I https://your-app.netlify.app
```

## 🆘 Troubleshooting

### Common Issues:

#### 1. CORS Errors
```bash
# Check backend CORS configuration
# Verify FRONTEND_URL in .env
# Restart backend after changes
```

#### 2. WebSocket Connection Failed
```bash
# Check EC2 security group allows port 3000
# Verify VITE_WS_URL environment variable
# Check browser console for connection errors
```

#### 3. API Calls Failing
```bash
# Verify VITE_BACKEND_URL environment variable
# Check backend is running: pm2 list
# Test backend directly: curl http://$EC2_IP:3000/health
```

#### 4. Build Failures
```bash
# Check Node.js version (should be 18+)
# Clear npm cache: npm cache clean --force
# Delete node_modules and reinstall
```

## ✅ Success Checklist

- [ ] Backend running on EC2 at `http://$EC2_IP:3000`
- [ ] Frontend deployed on Netlify
- [ ] Environment variables set correctly
- [ ] CORS configured for Netlify domain
- [ ] WebSocket connections working
- [ ] API calls successful
- [ ] SSL certificate active
- [ ] Health checks passing

## 🎉 You're Live!

Your PixelPal game is now running with:
- **Frontend**: `https://your-app.netlify.app`
- **Backend**: `http://$EC2_IP:3000`
- **Real-time**: WebSocket connections between them

Players can now access your game from anywhere in the world! 🌍 