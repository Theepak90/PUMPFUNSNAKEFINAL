# 🚀 AWS EC2 Deployment Guide for PixelPal Backend

## 📋 Prerequisites

- AWS Account with EC2 access
- SSH key pair for EC2 instance
- Domain name (optional, for production)

## 🔧 Step 1: Launch EC2 Instance

### 1.1 Launch Instance
1. Go to AWS Console → EC2 → Launch Instance
2. **Name**: `pixelpal-backend`
3. **AMI**: Ubuntu Server 22.04 LTS (free tier eligible)
4. **Instance Type**: `t3.micro` (free tier) or `t3.small` (recommended)
5. **Key Pair**: Create or select existing SSH key pair
6. **Security Group**: Create new with these rules:
   - **SSH (22)**: Your IP only
   - **HTTP (80)**: 0.0.0.0/0
   - **HTTPS (443)**: 0.0.0.0/0
   - **Custom TCP (3000)**: 0.0.0.0/0 (for your app)

### 1.2 Instance Configuration
- **Storage**: 8GB GP2 (free tier) or 20GB (recommended)
- **IAM Role**: None (for now)
- **User Data**: Leave empty

## 🔑 Step 2: Connect to Instance

```bash
# Replace with your actual values
ssh -i "your-key.pem" ubuntu@your-ec2-ip
```

## 🛠️ Step 3: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx (optional, for reverse proxy)
sudo apt install nginx -y

# Install certbot for SSL (optional)
sudo apt install certbot python3-certbot-nginx -y

# Verify installations
node --version
npm --version
pm2 --version
```

## 📦 Step 4: Deploy Your Application

### Option A: Using the Deployment Script (Recommended)

1. **Make the script executable locally:**
```bash
chmod +x deploy-aws.sh
```

2. **Run the deployment:**
```bash
./deploy-aws.sh YOUR_EC2_IP ~/.ssh/your-key.pem
```

### Option B: Manual Deployment

1. **Upload your code:**
```bash
# From your local machine
scp -i "your-key.pem" -r . ubuntu@YOUR_EC2_IP:/home/ubuntu/pixelpal-backend/
```

2. **On EC2 instance:**
```bash
cd /home/ubuntu/pixelpal-backend
npm install --production
npm run build
```

3. **Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🌐 Step 5: Configure Nginx (Optional but Recommended)

### 5.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/pixelpal-backend
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5.2 Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/pixelpal-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 🔒 Step 6: SSL Certificate (Optional but Recommended)

```bash
# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add this line:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Step 7: Monitoring and Logs

### 7.1 PM2 Commands

```bash
# View all processes
pm2 list

# View logs
pm2 logs pixelpal-backend

# Monitor resources
pm2 monit

# Restart application
pm2 restart pixelpal-backend

# Stop application
pm2 stop pixelpal-backend
```

### 7.2 System Monitoring

```bash
# View system resources
htop

# View disk usage
df -h

# View memory usage
free -h

# View running processes
ps aux | grep node
```

## 🚨 Step 8: Security Best Practices

### 8.1 Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw status
```

### 8.2 Regular Updates

```bash
# Create update script
sudo nano /home/ubuntu/update-system.sh
```

Add this content:

```bash
#!/bin/bash
sudo apt update && sudo apt upgrade -y
sudo npm update -g pm2
```

Make executable:

```bash
chmod +x /home/ubuntu/update-system.sh
sudo crontab -e
# Add this line for weekly updates:
# 0 2 * * 0 /home/ubuntu/update-system.sh
```

## 🔄 Step 9: Continuous Deployment

### 9.1 GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS EC2

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to EC2
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ubuntu
        key: ${{ secrets.EC2_SSH_KEY }}
        script: |
          cd /home/ubuntu/pixelpal-backend
          git pull origin main
          npm install --production
          npm run build
          pm2 restart pixelpal-backend
```

## 📝 Step 10: Environment Variables

Create `.env` file on EC2:

```bash
sudo nano /home/ubuntu/pixelpal-backend/.env
```

Add your production variables:

```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com
JWT_SECRET=your-super-secure-jwt-secret-key-here
ETHERSCAN_API_KEY=your-etherscan-api-key
BLOCKCYPHER_API_KEY=your-blockcypher-api-key
```

## ✅ Step 11: Test Your Deployment

1. **Health Check:**
```bash
curl http://your-ec2-ip:3000/health
```

2. **API Test:**
```bash
curl http://your-ec2-ip:3000/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

3. **WebSocket Test:**
```bash
# Test WebSocket connection
wscat -c ws://your-ec2-ip:3000/ws
```

## 🆘 Troubleshooting

### Common Issues:

1. **Port 3000 not accessible:**
   - Check security group rules
   - Verify firewall settings
   - Check if app is running: `pm2 list`

2. **Application crashes:**
   - Check logs: `pm2 logs pixelpal-backend`
   - Check system resources: `htop`
   - Verify environment variables

3. **Nginx issues:**
   - Check syntax: `sudo nginx -t`
   - Check status: `sudo systemctl status nginx`
   - Check error logs: `sudo tail -f /var/log/nginx/error.log`

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs pixelpal-backend`
2. Check system logs: `sudo journalctl -u nginx`
3. Verify all services are running: `sudo systemctl status nginx`

## 🎉 Success!

Your PixelPal backend is now running on AWS EC2! 

**Next Steps:**
1. Update your frontend to point to the EC2 instance
2. Set up a domain name and SSL
3. Configure monitoring and alerts
4. Set up automated backups 