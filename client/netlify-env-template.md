# 🌐 Netlify Environment Variables

## Required Environment Variables

Set these in your Netlify dashboard under **Site settings > Environment variables**:

### Production Variables
```
VITE_BACKEND_URL=http://YOUR_EC2_IP:3000
VITE_WS_URL=ws://YOUR_EC2_IP:3000/ws
```

## How to Set in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings > Environment variables**
4. Click **Add a variable**
5. Add each variable above
6. Set **Scope** to **Production**
7. Click **Save**

## Example Values

Replace `YOUR_EC2_IP` with your actual EC2 instance IP:

```
VITE_BACKEND_URL=http://3.250.123.45:3000
VITE_WS_URL=ws://3.250.123.45:3000/ws
```

## Testing

After setting these variables:
1. Redeploy your site
2. Check browser console for any connection errors
3. Test login/registration
4. Test game WebSocket connection

## Security Note

- These variables are visible in the frontend code
- They're safe to expose as they only contain public URLs
- Your backend security is handled by CORS and authentication 