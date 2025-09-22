import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserPlus, Users, X, Check, UserX, Bell } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';

interface Friend {
  id: string;
  username: string;
  isOnline: boolean;
  isPlaying: boolean;
}

interface FriendRequest {
  id: string;
  username: string;
  timestamp: string;
}

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

let socket: Socket;

export default function FriendsModal({ isOpen, onClose }: FriendsModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [username, setUsername] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessingRequest, setIsProcessingRequest] = useState(false);
  const [, setLocation] = useLocation();
  const defaultRegion = 'us';

  useEffect(() => {
    if (!isOpen) return;

    const WS_URL = import.meta.env.VITE_WS_URL || 'https://pumpgames-lkbp.onrender.com';

    if (!socket) {
      console.log('Creating new socket connection to:', WS_URL);
      socket = io(WS_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000
      });

      socket.on('connect', () => {
        console.log('Connected:', socket.id);
        setIsConnected(true);
        // Emit join if username is already set
        if (username) {
          console.log('Emitting join with username:', username);
          socket.emit('join', username);
          // Load user's friends and friend requests
          socket.emit('get-friends', username);
          socket.emit('get-friend-requests', username);
        }
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setIsConnected(false);
      });

      socket.on('online-users', (users: string[]) => {
        console.log('Received online users:', users);
        setOnlineUsers(users);
        setFriends(prev => prev.map(f => ({ ...f, isOnline: users.includes(f.username) })));
      });

      socket.on('friend-request', (request: FriendRequest) => {
        console.log('Received friend request:', request);
        console.log('Current friend requests before adding:', friendRequests);
        setFriendRequests(prev => {
          console.log('Adding friend request to state:', request);
          // Check if request already exists to avoid duplicates
          const exists = prev.some(req => req.id === request.id);
          if (!exists) {
            return [...prev, request];
          }
          return prev;
        });

        // Show simple alert as backup
        alert(`🎮 Friend Request from ${request.username}! Check the Friends modal to accept.`);

        // Show prominent notification with direct action buttons
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1f2937, #374151);
            color: white;
            padding: 24px;
            border-radius: 16px;
            border: 3px solid #10b981;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            z-index: 10001;
            font-family: 'Courier New', monospace;
            text-align: center;
            max-width: 400px;
            animation: fadeIn 0.5s ease-out;
          ">
            <div style="font-size: 24px; margin-bottom: 16px; color: #10b981;">
              🎮 Friend Request!
            </div>
            <div style="font-size: 18px; margin-bottom: 12px;">
              <strong style="color: #10b981;">${request.username}</strong> wants to be your friend!
            </div>
            <div style="font-size: 14px; color: #9ca3af; margin-bottom: 20px;">
              Accept to automatically create a game room and play together!
            </div>
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button id="accept-and-play-btn" style="
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 14px;
              " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                ✅ Accept & Play
              </button>
              <button id="decline-btn" style="
                background: #6b7280;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 14px;
              " onmouseover="this.style.background='#4b5563'" onmouseout="this.style.background='#6b7280'">
                ❌ Decline
              </button>
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 12px;">
              Or check the Friends modal for more options
            </div>
          </div>
          <style>
            @keyframes fadeIn {
              from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
              to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
          </style>
        `;
        document.body.appendChild(notification);

        // Handle button clicks
        const acceptBtn = notification.querySelector('#accept-and-play-btn');
        const declineBtn = notification.querySelector('#decline-btn');

        acceptBtn?.addEventListener('click', () => {
          handleAcceptFriendRequest(request.id);
          notification.remove();
        });

        declineBtn?.addEventListener('click', () => {
          handleDeclineFriendRequest(request.id);
          notification.remove();
        });

        // Auto-remove notification after 10 seconds
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 10000);
      });

      socket.on('friend-added', ({ username: friendUsername }) => {
        console.log('Friend added:', friendUsername);
        // Update friends list with new friend
        const newFriend: Friend = {
          id: friendUsername,
          username: friendUsername,
          isOnline: onlineUsers.includes(friendUsername),
          isPlaying: false,
        };
        setFriends(prev => {
          const exists = prev.some(f => f.username === friendUsername);
          if (!exists) {
            return [...prev, newFriend];
          }
          return prev;
        });
      });

      socket.on('auto-game-start', ({ roomId, region, friend, mode }) => {
        console.log('Auto game start:', { roomId, region, friend, mode });
        
        // Automatically navigate to the friend game
        const gameUrl = `/game?region=${region}&roomId=${roomId}${mode === 'friends' ? '&mode=friends' : ''}`;
        console.log('🎮 Auto-navigating to friend game:', gameUrl);
        setLocation(gameUrl);
        onClose();
      });

      socket.on('friends-list', (friendsList: Friend[]) => {
        console.log('📋 Received friends list:', friendsList);
        console.log('📋 Friends count:', friendsList.length);
        setFriends(friendsList);
      });

      socket.on('friend-requests', (requests: FriendRequest[]) => {
        console.log('Received friend requests from server:', requests);
        setFriendRequests(requests);
        if (requests.length > 0) {
          console.log('Setting friend requests state to:', requests);
        }
      });

      // Debug event to see if friend requests are being sent
      socket.on('friend-request-debug', (data) => {
        console.log('DEBUG: Friend request broadcast received:', data);
        if (data.to === username) {
          console.log('This friend request is for me!', data);
          // Manually add the friend request if it's for this user
          const request: FriendRequest = {
            id: data.requestData.id,
            username: data.requestData.username,
            timestamp: data.requestData.timestamp
          };
          setFriendRequests(prev => {
            const exists = prev.some(req => req.id === request.id);
            if (!exists) {
              console.log('Adding friend request manually:', request);
              return [...prev, request];
            }
            return prev;
          });
        }
      });

      socket.on('game-invite', ({ from, roomId, region, mode }: { from: string; roomId?: string; region?: string; mode?: string }) => {
        console.log('Received game invite:', { from, roomId, region, mode });
        const gameType = mode === 'friends' ? 'friend game' : 'game';
        const confirmed = confirm(`${from} invited you to a ${gameType}. Accept?`);
        if (confirmed) {
          const finalRegion = region || defaultRegion;
          const finalRoomId = roomId || `${Math.floor(Math.random() * 100000)}`;
          socket.emit('accept-invite', { from, to: username, roomId: finalRoomId, region: finalRegion, mode });
          
          // Navigate to the correct game URL with friend mode
          const gameUrl = `/game?region=${finalRegion}&roomId=${finalRoomId}${mode === 'friends' ? '&mode=friends' : ''}`;
          console.log('🎮 Navigating to friend game:', gameUrl);
          setLocation(gameUrl);
          onClose();
        }
      });

      socket.on('invite-accepted', ({ to, roomId, region, mode }: { to: string; roomId?: string; region?: string; mode?: string }) => {
        console.log('Invite accepted:', { to, roomId, region, mode });
        const finalRegion = region || defaultRegion;
        const finalRoomId = roomId || `${Math.floor(Math.random() * 100000)}`;
        
        // Navigate to the correct game URL with friend mode
        const gameUrl = `/game?region=${finalRegion}&roomId=${finalRoomId}${mode === 'friends' ? '&mode=friends' : ''}`;
        console.log('🎮 Navigating to accepted friend game:', gameUrl);
        setLocation(gameUrl);
        onClose();
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
      });
    } else {
      console.log('Using existing socket connection');
    }

    // Don't disconnect when modal closes - keep connection alive
    return () => {
      // Only disconnect when component unmounts completely
    };
  }, [isOpen]);

  // Auto-generate a username when modal opens so we don't need an input
  useEffect(() => {
    if (isOpen && !username) {
      const autoName = `player_${Math.floor(Math.random() * 100000)}`;
      setUsername(autoName);
    }
  }, [isOpen]);

  // Emit join when username is set and load user data
  useEffect(() => {
    if (username && socket?.connected) {
      console.log('Joining with username:', username);
      socket.emit('join', username);
      // Load user's friends and friend requests
      console.log(`📤 Requesting friends list for: ${username}`);
      socket.emit('get-friends', username);
      socket.emit('get-friend-requests', username);
    } else if (username && socket && !socket.connected) {
      console.log('Socket not connected yet, waiting for connection...');
    }
  }, [username, socket?.connected]);

  // Cleanup socket connection when component unmounts
  useEffect(() => {
    return () => {
      if (socket) {
        console.log('Cleaning up socket connection');
        socket.disconnect();
        socket = undefined as unknown as Socket;
      }
    };
  }, []);

  // Debug friend requests state changes
  useEffect(() => {
    console.log('Friend requests state changed:', friendRequests);
  }, [friendRequests]);

  const handleAddFriend = () => {
    if (!newFriendUsername.trim() || newFriendUsername === username) return;

    if (!socket?.connected) {
      alert('Not connected to server. Please wait and try again.');
      return;
    }

    setIsAddingFriend(true);
    console.log('Sending friend request:', { to: newFriendUsername, from: username });
    console.log('Socket connected:', socket.connected);
    console.log('Current online users:', onlineUsers);
    socket.emit('send-friend-request', { to: newFriendUsername, from: username });

    // Show feedback
    alert(`Friend request sent to ${newFriendUsername}!`);
    setNewFriendUsername('');
    setIsAddingFriend(false);

    // Set processing state for recipient
    setTimeout(() => {
      setIsProcessingRequest(true);
      setTimeout(() => {
        setIsProcessingRequest(false);
      }, 5000); // Stop processing after 5 seconds
    }, 1000);
  };

  const handleAcceptFriendRequest = (requestId: string) => {
    const request = friendRequests.find(req => req.id === requestId);
    if (!request) return;

    setFriendRequests(prev => prev.filter(req => req.id !== requestId));
    socket.emit('accept-friend-request', { from: username, to: request.username });

    // Show success notification
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #059669, #10b981);
        color: white;
        padding: 16px;
        border-radius: 12px;
        border: 2px solid #34d399;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Courier New', monospace;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="width: 8px; height: 8px; background: #34d399; border-radius: 50%; animation: pulse 2s infinite;"></div>
          <strong>Friendship Accepted!</strong>
        </div>
        <div style="color: #34d399; font-size: 14px;">
          You are now friends with ${request.username}
        </div>
        <div style="font-size: 12px; color: #d1fae5; margin-top: 4px;">
          Starting game room in 3 seconds...
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Auto-remove notification after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);

    // Auto-start game after becoming friends
    setTimeout(() => {
      socket.emit('start-game-with-friend', { from: username, to: request.username, region: defaultRegion });
    }, 1000); // Small delay to ensure friend relationship is established
  };

  const handleDeclineFriendRequest = (requestId: string) => {
    const request = friendRequests.find(req => req.id === requestId);
    if (!request) return;

    setFriendRequests(prev => prev.filter(req => req.id !== requestId));
    socket.emit('decline-friend-request', { from: username, to: request.username });
  };

  const inviteFriend = (friendName: string) => {
    const region = defaultRegion;
    const roomId = `${Math.floor(Math.random() * 100000)}`;
    socket.emit('invite-friend', { from: username, to: friendName, roomId, region });
    alert(`Friend game invite sent to ${friendName}! They will receive a notification if they're online.`);
  };

  const getStatusColor = (friend: Friend) => {
    if (friend.isPlaying) return '#ffd700';
    if (friend.isOnline) return '#00ff88';
    return '#6b7280';
  };

  const getStatusText = (friend: Friend) => {
    if (friend.isPlaying) return 'Playing';
    if (friend.isOnline) return 'Online';
    return 'Offline';
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-2 border-green-500 text-white max-w-lg w-full mx-4 rounded-xl shadow-2xl [&>button]:hidden max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="pb-4 border-b border-green-500/30 px-6 pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 font-retro text-xl text-green-400">
              <Users className="w-6 h-6" /> Friends
            </DialogTitle>
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors border-2 border-gray-600 hover:border-green-500">
              <X className="w-5 h-5 text-gray-400 hover:text-green-400" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2 overflow-y-auto flex-1 px-6 pb-6">
          {/* Current User Info */}
          <div className="bg-gray-800/50 border-2 border-green-500/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shadow-lg ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="font-retro text-green-400">You: {username}</span>
                <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-retro text-green-400">Add Friend & Play</h3>
            <div className="flex gap-3">
              <Input
                value={newFriendUsername}
                onChange={(e) => setNewFriendUsername(e.target.value)}
                placeholder="Enter PlayerID"
                className="flex-1 bg-gray-800 border-2 border-gray-600 text-white placeholder-gray-400 font-retro rounded-lg px-4 py-3 focus:border-green-500 focus:ring-0"
                onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
              />
              <Button
                onClick={handleAddFriend}
                disabled={isAddingFriend || !newFriendUsername.trim() || newFriendUsername === username}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 font-retro px-4 py-3 rounded-lg border-2 border-green-500 disabled:opacity-50 transition-all hover:scale-105"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Add & Play
              </Button>
            </div>
            {newFriendUsername === username && (
              <p className="text-red-400 text-sm">Cannot add yourself as a friend!</p>
            )}
            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <p className="text-xs text-green-300 text-center">
                💡 Adding a friend will automatically create a game room when they accept!
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-retro text-green-400">Friends List ({friends.length})</h3>
              {friends.length > 0 && (
                <div className="text-xs text-green-300 bg-green-900/20 px-2 py-1 rounded border border-green-500/30">
                  {friends.filter(f => f.isOnline && !f.isPlaying).length} online
                </div>
              )}
            </div>
            {friends.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-retro">No friends yet. Add some friends to start playing together!</p>
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-300">
                    🎯 Pro Tip: Add friends to automatically create game rooms when they accept!
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {friends.map(friend => (
                  <div key={friend.id} className="relative p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/50 border-2 border-gray-600 rounded-lg hover:border-green-500 transition-all shadow-lg">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div
                          className="w-4 h-4 rounded-full shadow-md flex-shrink-0"
                          style={{ backgroundColor: getStatusColor(friend) }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-white font-retro text-lg truncate block">{friend.username}</span>
                          <div className="text-xs text-gray-400 mt-1">{getStatusText(friend)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          onClick={() => inviteFriend(friend.username)}
                          disabled={!friend.isOnline || friend.isPlaying}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-retro transition-all hover:scale-105 whitespace-nowrap ${friend.isPlaying
                              ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500 text-white'
                              : friend.isOnline
                                ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 border-green-500 text-white'
                                : 'bg-gray-600 border-gray-500 text-gray-300'
                            }`}
                        >
                          {friend.isPlaying ? '🎮 Playing' : friend.isOnline ? '🚀 Play' : '⏸️ Offline'}
                        </Button>
                      </div>
                    </div>
                    {friend.isOnline && !friend.isPlaying && (
                      <div className="mt-3 p-2 bg-green-800/20 rounded-lg border border-green-600/30">
                        <p className="text-xs text-green-300 text-center">
                          ✨ Ready to play! Click "Play" to create a game room instantly!
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(friendRequests.length > 0 || isProcessingRequest) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-lg animate-pulse" />
                <h3 className="text-lg font-retro text-yellow-400">
                  Incoming Friend Requests ({friendRequests.length})
                </h3>
                {isProcessingRequest && (
                  <div className="text-xs text-yellow-300 bg-yellow-900/20 px-2 py-1 rounded border border-yellow-500/30">
                    Processing...
                  </div>
                )}
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {friendRequests.length === 0 && isProcessingRequest ? (
                  <div className="text-center py-4 text-yellow-300">
                    <div className="animate-spin w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-sm">Waiting for friend requests...</p>
                  </div>
                ) : (
                  friendRequests.map(request => (
                    <div key={request.id} className="relative p-4 bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border-2 border-yellow-500/60 rounded-xl hover:border-yellow-400 transition-all shadow-lg">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-4 h-4 rounded-full bg-yellow-400 shadow-lg animate-pulse flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-retro text-white text-lg truncate block">{request.username}</span>
                            <p className="text-xs text-yellow-200 mt-1">
                              {new Date(request.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          <Button
                            onClick={() => handleAcceptFriendRequest(request.id)}
                            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-3 py-2 rounded-lg border-2 border-green-500 font-retro text-sm transition-all hover:scale-105 whitespace-nowrap"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Accept & Play
                          </Button>
                          <Button
                            onClick={() => handleDeclineFriendRequest(request.id)}
                            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-3 py-2 rounded-lg border-2 border-red-500 font-retro text-sm transition-all hover:scale-105 whitespace-nowrap"
                          >
                            <UserX className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 p-2 bg-yellow-800/30 rounded-lg border border-yellow-600/30">
                        <p className="text-xs text-yellow-200 text-center">
                          💡 Accepting will automatically create a game room for both players!
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}