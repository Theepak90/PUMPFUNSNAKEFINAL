# 🗄️ Database Setup for Friends System

## Database Type
Your application uses **Neon Database** (PostgreSQL serverless)

## Step 1: Create Neon Database

1. **Go to**: https://console.neon.tech/
2. **Sign up/Login** with your account
3. **Create New Project**:
   - Name: `pumpgame-friends`
   - Database: `postgres`
   - Region: Choose closest to your server
4. **Copy Connection String** from the dashboard

## Step 2: Get Database URL

In Neon Console:
1. Go to your project dashboard
2. Click **"Connection Details"**
3. Copy the **Connection String** (it looks like):
   ```
   postgresql://username:password@hostname:5432/database_name?sslmode=require
   ```

## Step 3: Update Environment Variables

### Local Development
Create `.env` file in your project root:
```env
DATABASE_URL=postgresql://username:password@hostname:5432/database_name?sslmode=require
```

### Production (AWS EC2)
Update `env.production` file:
```env
DATABASE_URL=postgresql://username:password@hostname:5432/database_name?sslmode=require
```

## Step 4: Run Migration

### Local (before deployment)
```bash
node scripts/run-migration.js
```

### Production (automatic during deployment)
The deployment script will automatically run the migration when you deploy.

## Step 5: Verify Database

After migration, your database will have these new tables:
- `friends` - Stores friend relationships
- `friend_requests` - Stores pending friend requests

## Alternative: Manual Migration

If automatic migration fails, you can run the SQL manually:

1. **Connect to your Neon database** using any PostgreSQL client
2. **Run the SQL** from `migrations/001_add_friends_tables.sql`

## Troubleshooting

### Migration Fails
- ✅ Check DATABASE_URL is correct
- ✅ Check internet connection
- ✅ Check Neon database is running
- ✅ Check credentials are valid

### Connection Issues
- ✅ Verify SSL mode is `require`
- ✅ Check firewall settings
- ✅ Check database is not paused (Neon pauses inactive databases)

## Cost Information

**Neon Database Pricing**:
- **Free Tier**: 0.5GB storage, 10GB transfer
- **Pro Tier**: $0.10/GB storage, $0.09/GB transfer
- **Sleep Mode**: Free tier databases pause after 5 minutes of inactivity

For a friends system, the free tier should be sufficient unless you have thousands of users.

## Security Notes

- 🔒 Never commit DATABASE_URL to git
- 🔒 Use environment variables only
- 🔒 Rotate database passwords regularly
- 🔒 Use SSL connections (sslmode=require)
