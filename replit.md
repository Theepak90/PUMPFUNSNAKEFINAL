# replit.md

## Overview

This project is a real-time multiplayer snake game with integrated betting mechanics. Its core purpose is to provide an engaging and competitive gaming experience where players can customize snakes, manage virtual currency, interact with friends, and compete globally. The vision is to create a dynamic online arena for snake game enthusiasts, leveraging modern web technologies for a smooth and interactive user experience.

## User Preferences

Preferred communication style: Simple, everyday language.
User wants to recreate full Slither.io game based on GitHub repository reference.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter (lightweight React router).
- **Styling**: Tailwind CSS with shadcn/ui component library. Dark theme with neon color accents (yellow, green, blue). Responsive design.
- **State Management**: React Context API.
- **Data Fetching**: TanStack Query (React Query).
- **Build Tool**: Vite.
- **UI/UX Decisions**: Clean, minimal canvas-only display during gameplay with essential minimap and controls. Retro loading screen. Home screen snake appearance consistent with in-game. Proportional eye scaling for snakes.

### Backend Architecture
- **Runtime**: Node.js with Express.js server.
- **Language**: TypeScript.
- **Real-time Communication**: WebSocket server for live game updates and server-authoritative game state.
- **API Design**: RESTful endpoints.

### Database Layer
- **ORM**: Drizzle ORM for type-safe operations.
- **Database**: PostgreSQL with persistent storage.
- **Migrations**: Drizzle Kit.
- **Schema**: Strongly typed with Zod validation and relations, including tables for users, games, gameParticipants, friendships, dailyCrates, and gameStates.

### Core System Features
- **Authentication**: Username/password based, user profile management.
- **Game Engine**: Real-time multiplayer, WebSocket-based communication, **server-authoritative movement system**. **Server-Side Movement Authority**: Implemented server-controlled snake movement with 60 FPS game loop. Clients send input commands (direction, boost) while server calculates and broadcasts authoritative positions. Ensures snakes continue moving even when browser tabs are inactive or minimized. Snake growth completely capped at exactly 100 segments and 100 mass - no growth in size or strength beyond this limit. Dynamic segment spacing system where small snakes have tight segments (12px) that gradually spread out to 18px for larger snakes, creating natural elongated appearance. Money counter with consistent styling and positioning. Snake death results in full disappearance. Performance optimized for large snakes. Mass counter in top-right corner shows progress to 100 max. **Food System**: 160 optimized food particles evenly distributed across the entire map that smoothly gravitate toward players when within 50px range. Gentle linear gravitational attraction (0.147 force, 0.52 max speed) with smooth velocity transitions for natural movement. Food consumption increases snake mass for growth. Performance-optimized client-side food management with distance-based rendering. Food particles are worth 0.3 points each. **Boost Mechanic**: Sprinting drops small yellow food particles (0.025 mass each) every 16 frames while consuming 0.025 mass per drop, creating strategic risk-reward gameplay. **Sequential Room Filling System**: Games are hosted at `/snake/us/1`, `/snake/eu/1`, etc. with geographic server distribution. Each region (US/EU) starts with only room 1 available. Higher-numbered rooms (2, 3, etc.) only become available when all lower-numbered rooms reach full 8-player capacity. This ensures optimal player concentration and matchmaking. IP geolocation with timezone fallback for automatic region detection, plus manual region selection.
- **Geographic Distribution**: Regional server architecture with US/EU region support. Client-side region detection using IP geolocation API (ipapi.co) with timezone fallback. Manual region override available via home page buttons. WebSocket connections include region parameters for proper routing.
- **Social Features**: Friend system, global leaderboard, user statistics tracking.
- **Virtual Economy**: Dual currency (game currency and SOL), daily crate rewards, betting mechanics, wallet management.
- **Bot AI**: State-based AI (wander, avoid, aggro) with food targeting removed, strategic boosting, realistic movement patterns.
- **Technical Implementations**: **Tab Switch Handling**: When player switches browser tabs, game instantly returns to home page and snake disappears completely. This prevents AFK gameplay and ensures active engagement. **Cash-Out Flow**: Completed cash-out instantly returns player to home page with snake disappearing completely. Dynamic turn speed for snakes when boosting. Visual effects include snake shadows and boosting outlines. Multiplayer WebSocket functionality working with real-time player updates and collision detection.

## External Dependencies

- **@neondatabase/serverless**: Serverless PostgreSQL connection.
- **@radix-ui/*** Headless UI primitives.
- **@tanstack/react-query**: Server state management and caching.
- **drizzle-orm**: Type-safe ORM with PostgreSQL support.
- **ws**: WebSocket library for real-time communication.
- **zod**: Runtime type validation and schema definition.
- **tailwindcss**: Utility-first CSS framework.