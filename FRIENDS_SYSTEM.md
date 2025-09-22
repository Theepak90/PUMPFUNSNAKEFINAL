# Friends System Implementation

This document describes the new persistent friends system that has been added to the game.

## Features

### 1. Persistent Friend Storage
- Friends are now stored in the database and persist across logout/login sessions
- No more losing friends when the server restarts
- Friends list is automatically loaded when users connect

### 2. Friend-Only Game Mode
- New "Friend Mode" where only two friends play against each other
- No bots in friend mode - pure friend vs friend gameplay
- Visual indicator shows when in friend mode
- Friends can see each other's snakes and compete directly

### 3. Enhanced Friend Management
- Database-backed friend requests system
- Automatic friend request notifications
- Accept/decline friend requests with immediate feedback
- Friend status tracking (online/offline/playing)

## Database Schema

### New Tables

#### `friends`
```sql
CREATE TABLE friends (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  friend_id varchar NOT NULL REFERENCES users(id),
  created_at timestamp DEFAULT now() NOT NULL
);
```

#### `friend_requests`
```sql
CREATE TABLE friend_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id varchar NOT NULL REFERENCES users(id),
  to_user_id varchar NOT NULL REFERENCES users(id),
  status varchar DEFAULT 'pending' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);
```

## Setup Instructions

### 1. Run Database Migration

Make sure you have your `DATABASE_URL` environment variable set, then run:

```bash
node scripts/run-migration.js
```

Or manually execute the SQL in `migrations/001_add_friends_tables.sql` on your PostgreSQL database.

### 2. Restart the Server

After running the migration, restart your server to load the new database schema.

## How to Use

### Adding Friends
1. Open the Friends modal from the main menu
2. Enter a friend's PlayerID in the "Add Friend & Play" section
3. Click "Add & Play" to send a friend request
4. The friend will receive a notification and can accept/decline

### Friend Mode Games
1. When a friend accepts your request, a game room is automatically created
2. Both players are redirected to a friend-only game
3. The game shows "Friend Battle" mode with no bots
4. Only the two friends compete against each other

### Friend Management
- View all your friends in the "Friends List" section
- See who's online and available to play
- Send game invites to online friends
- Friends persist across sessions - no need to re-add them

## Technical Details

### Socket Events
- `send-friend-request`: Send a friend request to another user
- `accept-friend-request`: Accept a friend request
- `decline-friend-request`: Decline a friend request
- `invite-friend`: Invite a friend to a game
- `auto-game-start`: Automatically start a game when friends are added

### Friend Mode Detection
The game detects friend mode through URL parameters:
- Normal game: `/snake/us/room123`
- Friend mode: `/snake/us/room123?mode=friends`

### Game Logic Changes
- Friend mode disables bot spawning
- Friend mode shows special UI indicators
- Friend mode limits to 2 players maximum
- Both players can see each other's snakes

## Benefits

1. **Persistent Relationships**: Friends don't disappear when you log out
2. **Pure Competition**: Friend mode removes bots for direct 1v1 competition
3. **Better UX**: Automatic game creation when friends accept requests
4. **Visual Clarity**: Clear indicators show when you're in friend mode
5. **Database Backed**: All friend data is stored safely in the database

## Future Enhancements

Potential future improvements:
- Friend groups/teams
- Friend statistics and leaderboards
- Tournament mode for friends
- Spectator mode for friend games
- Friend chat system
