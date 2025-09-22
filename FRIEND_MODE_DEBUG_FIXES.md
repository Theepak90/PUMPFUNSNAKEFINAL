# 🐛 Friend Mode Debug Fixes

## **Issues Identified & Fixed:**

### **1. Bot Filtering in Server Broadcasts**
**Problem**: Server was broadcasting bots even in friend mode rooms
**Fix**: Added bot filtering in player list broadcasts
```javascript
// Filter out bots for friend mode rooms
const playersToSend = room.gameMode === 'friends' 
  ? allPlayers.filter(player => !player.id.startsWith('bot_'))
  : allPlayers;
```

### **2. Room Creation Mode Parameter**
**Problem**: Initial rooms created without game mode parameter
**Fix**: Added game mode parameter to initial room creation
```javascript
createRoom('us', 1, 'normal');
createRoom('eu', 1, 'normal');
```

### **3. Room Finding Logic**
**Problem**: Friend mode players might join normal mode rooms with existing bots
**Fix**: Improved room finding to be strict about game modes
- Friend mode players only join friend mode rooms
- Normal mode players only join normal mode rooms
- Unique room IDs for friend rooms using timestamps

### **4. Added Debug Logging**
**Added comprehensive logging to track:**
- WebSocket connection parameters
- Room creation and assignment
- Player list broadcasts
- Bot filtering

## **Debug Console Output Expected:**

### **Server Side:**
```
🎮 Player player_123 connecting with mode: friends, region: us, room: 16962
🎮 Creating new friend room: us:1703123456789
🏠 Found room us:1703123456789 with mode: friends, players: 0/2
Created room us/1703123456789 in friend mode with capacity 2 players and no bots
```

### **Client Side:**
```
🌐 Connecting to WebSocket: ws://localhost:3000/ws?region=us&room=16962&mode=friends
🎮 Friend mode config: {isEnabled: true, disableBots: true, maxPlayers: 2, gameTitle: "Friend Battle"}
🎨 Player color set to: #FF6B6B (friend mode: true)
🤖 Received 2 total players, showing 1 others
🤖 Player IDs: ["player_123 (color: #FF6B6B)", "player_456 (color: #4ECDC4)"]
🤖 Friend mode enabled: true
```

## **Testing Steps:**

1. **Start the server** with debug logging
2. **Open two browser tabs** with friend mode URLs
3. **Check console logs** for proper mode detection
4. **Verify only 2 players** appear (no bots)
5. **Check different colors** for each friend
6. **Verify minimap** shows both friends as colored dots

## **Expected Results:**

✅ **No bots visible** in friend mode
✅ **Only 2 snakes** (one for each friend)
✅ **Different colors** for each friend
✅ **Minimap shows both** friends as colored dots
✅ **Console logs** show proper friend mode detection

The fixes should resolve both issues:
1. **Bot snakes no longer appear** in friend mode
2. **Minimap shows both friends** with different colors
