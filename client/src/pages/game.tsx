import { useRef, useEffect, useState, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { X, Volume2, DollarSign, Wallet } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../hooks/use-toast';
import WithdrawModal from '@/components/WithdrawModal';
import { getFriendModeConfig, shouldSpawnBots, getInitialBotCount, getGameModeDisplayText } from '../lib/friendMode';
import { io, Socket } from 'socket.io-client';

// Dynamic game constants based on arena size
// These will be calculated dynamically based on current arena size
const getMapCenterX = (arenaSize: { width: number; height: number }) => arenaSize.width / 2;
const getMapCenterY = (arenaSize: { width: number; height: number }) => arenaSize.height / 2;
const getMapRadius = (arenaSize: { width: number; height: number }) => Math.min(arenaSize.width, arenaSize.height) * 0.45; // 90% of the smaller dimension

// Camera system utility functions
const worldToScreen = (worldX: number, worldY: number, cameraX: number, cameraY: number, zoom: number, screenWidth: number, screenHeight: number) => {
  const screenX = (worldX - cameraX) * zoom + screenWidth / 2;
  const screenY = (worldY - cameraY) * zoom + screenHeight / 2;
  return { x: screenX, y: screenY };
};

const screenToWorld = (screenX: number, screenY: number, cameraX: number, cameraY: number, zoom: number, screenWidth: number, screenHeight: number) => {
  const worldX = (screenX - screenWidth / 2) / zoom + cameraX;
  const worldY = (screenY - screenHeight / 2) / zoom + cameraY;
  return { x: worldX, y: worldY };
};

// Scale food count based on arena size (480 for 2000x2000, scales proportionally) - TRIPLED
const getFoodCount = (arenaSize: { width: number; height: number }) => {
  const baseArea = 2000 * 2000; // Base arena size
  const currentArea = arenaSize.width * arenaSize.height;
  const scaleFactor = currentArea / baseArea;
  return Math.max(240, Math.min(960, Math.round(480 * scaleFactor))); // Between 240-960 food (tripled)
};

const BASE_FOOD_COUNT = 160; // Base food count for compatibility
const FOOD_GRAVITY = 0.147; // Reduced by another 30% (0.21 * 0.7) for gentler attraction
const FOOD_MAX_SPEED = 0.52; // 35% slower speed (0.8 * 0.65) for smoother attraction
const FOOD_ATTRACTION_RADIUS = 50; // Reduced to 50px attraction range
const FOOD_CONSUMPTION_RADIUS = 15; // Distance to consume food
const BOT_COUNT = 5;

interface Position {
  x: number;
  y: number;
}

// Food interface with gravitational physics
interface Food {
  id: string;
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
  color: string;
  radius: number;
  mass: number;
  wobbleOffset: number;
  expiresAt?: number; // Optional expiration timestamp for boost food
  opacity?: number; // Optional opacity for fading boost food
  isBoostFood?: boolean; // Flag to identify boost food for special rendering
  isMoneyCrate?: boolean; // Flag to identify money crates
  moneyValue?: number; // Money value for money crates
  isSuperFood?: boolean; // Flag to identify super food (2x size, 2x mass)
}

interface BotSnake {
  id: string;
  head: Position;
  visibleSegments: Array<{ x: number; y: number; opacity: number }>;
  segmentTrail: Position[];
  totalMass: number;
  currentAngle: number;
  speed: number;
  baseSpeed: number;
  color: string;
  targetAngle: number;
  lastDirectionChange: number;
  // targetFood removed
  money: number; // Bot's money balance
  state: 'wander' | 'foodHunt' | 'avoid' | 'aggro'; // Bot behavior state
  targetFood: Food | null; // Food the bot is targeting
  isBoosting: boolean;
  boostTime: number;
  lastStateChange: number;
  aggroTarget: SmoothSnake | BotSnake | null;
}

// Utility functions for food system
function getRandomFoodColor(): string {
  const colors = [
    '#ff1744', '#00e676', '#00b0ff', '#76ff03', '#ffea00',
    '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
    '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39',
    '#ffc107', '#ff9800', '#ff5722', '#f44336', '#e91e63',
    '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function createFood(id: string, arenaSize = { width: 2000, height: 2000 }): Food {
  // Spawn food evenly distributed across the entire map
  const angle = Math.random() * Math.PI * 2;
  const mapRadius = getMapRadius(arenaSize);
  const mapCenterX = getMapCenterX(arenaSize);
  const mapCenterY = getMapCenterY(arenaSize);
  const radius = Math.sqrt(Math.random()) * (mapRadius - 50); // Square root for even distribution
  const x = mapCenterX + Math.cos(angle) * radius;
  const y = mapCenterY + Math.sin(angle) * radius;

  // 10% chance to create super food (2x bigger, 2x mass)
  const isSuperFood = Math.random() < 0.1;

  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    color: getRandomFoodColor(),
    radius: isSuperFood ? (6 + Math.random() * 4) : (3 + Math.random() * 2), // Super food: 6-10px, Regular: 3-5px
    mass: isSuperFood ? 0.6 : 0.3, // Super food: 2x mass (0.6), Regular: 0.3
    wobbleOffset: Math.random() * Math.PI * 2,
    isSuperFood: isSuperFood
  };
}

function updateFoodGravity(food: Food, allSnakes: Array<{ head: Position; totalMass: number }>): Food {
  const updated = { ...food };

  // Find nearest snake
  let nearestSnake = null;
  let nearestDistance = Infinity;

  for (const snake of allSnakes) {
    const dx = snake.head.x - food.x;
    const dy = snake.head.y - food.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSnake = snake;
    }
  }

  if (nearestSnake && nearestDistance < FOOD_ATTRACTION_RADIUS) { // Only attract within 25px
    const dx = nearestSnake.head.x - food.x;
    const dy = nearestSnake.head.y - food.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      // Gentle attraction force
      const force = FOOD_GRAVITY; // Use base gravity for slower movement
      updated.vx += (dx / distance) * force;
      updated.vy += (dy / distance) * force;

      // Cap velocity
      const speed = Math.sqrt(updated.vx * updated.vx + updated.vy * updated.vy);
      if (speed > FOOD_MAX_SPEED) {
        updated.vx = (updated.vx / speed) * FOOD_MAX_SPEED;
        updated.vy = (updated.vy / speed) * FOOD_MAX_SPEED;
      }

    }
  } else {
    // When not being attracted, gradually slow down more smoothly
    updated.vx *= 0.95;
    updated.vy *= 0.95;
  }

  // Apply velocity to update position
  const oldX = updated.x;
  const oldY = updated.y;
  updated.x += updated.vx;
  updated.y += updated.vy;


  // Keep food within map bounds - use updated arena size for food physics
  const currentArenaSize = { width: 5000, height: 5000 }; // Updated for larger map
  const mapCenterX = getMapCenterX(currentArenaSize);
  const mapCenterY = getMapCenterY(currentArenaSize);
  const mapRadius = getMapRadius(currentArenaSize);

  const distanceFromCenter = Math.sqrt(
    (updated.x - mapCenterX) ** 2 + (updated.y - mapCenterY) ** 2
  );
  if (distanceFromCenter > mapRadius - 50) {
    const angle = Math.atan2(updated.y - mapCenterY, updated.x - mapCenterX);
    updated.x = mapCenterX + Math.cos(angle) * (mapRadius - 50);
    updated.y = mapCenterY + Math.sin(angle) * (mapRadius - 50);
    updated.vx = 0;
    updated.vy = 0;
  }

  return updated;
}

// Bot snake utility functions
function createBotSnake(id: string): BotSnake {
  // Spawn bot at random location within map
  const angle = Math.random() * Math.PI * 2;
  const currentArenaSize = { width: 5000, height: 5000 }; // Updated for larger map
  const mapCenterX = getMapCenterX(currentArenaSize);
  const mapCenterY = getMapCenterY(currentArenaSize);
  const mapRadius = getMapRadius(currentArenaSize);
  const radius = Math.random() * (mapRadius - 200);
  const x = mapCenterX + Math.cos(angle) * radius;
  const y = mapCenterY + Math.sin(angle) * radius;

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  const baseSpeed = 2.3 + Math.random() * 0.5; // Increased speed to match faster player

  return {
    id,
    head: { x, y },
    visibleSegments: [{ x, y, opacity: 1.0 }],
    segmentTrail: [{ x, y }],
    totalMass: 8 + Math.random() * 12, // Start with 8-20 mass
    currentAngle: Math.random() * Math.PI * 2,
    speed: baseSpeed,
    baseSpeed: baseSpeed,
    color: colors[Math.floor(Math.random() * colors.length)],
    targetAngle: Math.random() * Math.PI * 2,
    lastDirectionChange: 0,

    money: 1.00, // All bots start with exactly $1.00
    state: 'wander',
    targetFood: null,
    isBoosting: false,
    boostTime: 0,
    lastStateChange: Date.now(),
    aggroTarget: null
  };
}

function updateBotSnake(bot: BotSnake, playerSnake: SmoothSnake, otherBots: BotSnake[]): BotSnake {
  // Enhanced AI Decision making with aggressive behavior
    const SEGMENT_SPACING = 5;
  const SEGMENT_RADIUS = 5;
  const currentTime = Date.now();



  // Check for nearby threats (less sensitive for more aggressive play)
  let nearestThreat: { x: number, y: number, distance: number } | null = null;
  let threatDistance = Infinity;

  // Check player snake segments for collision avoidance (reduced sensitivity)
  for (let i = 1; i < playerSnake.visibleSegments.length; i++) { // Skip head (index 0)
    const segment = playerSnake.visibleSegments[i];
    const dist = Math.sqrt((bot.head.x - segment.x) ** 2 + (bot.head.y - segment.y) ** 2);
    if (dist < 60 && dist < threatDistance) { // Reduced danger zone for more aggressive play
      threatDistance = dist;
      nearestThreat = { x: segment.x, y: segment.y, distance: dist };
    }
  }

  // Check other bot snakes for collision avoidance
  for (const otherBot of otherBots) {
    if (otherBot.id === bot.id) continue;
    for (const segment of otherBot.visibleSegments) {
      const dist = Math.sqrt((bot.head.x - segment.x) ** 2 + (bot.head.y - segment.y) ** 2);
      if (dist < 40 && dist < threatDistance) { // Smaller danger zone for other bots
        threatDistance = dist;
        nearestThreat = { x: segment.x, y: segment.y, distance: dist };
      }
    }
  }

  // Disable aggressive player hunting behavior — bots should not target the player
  // Keep avoidance and wandering only
  let shouldHuntPlayer = false;

  // Threat avoidance (less sensitive)
  if (nearestThreat && nearestThreat.distance < 40) { // Reduced avoidance threshold
    // Calculate escape angle (away from threat)
    const threatAngle = Math.atan2(nearestThreat.y - bot.head.y, nearestThreat.x - bot.head.x);
    bot.targetAngle = threatAngle + Math.PI; // Opposite direction
    bot.lastDirectionChange = currentTime;

    // Boost when escaping danger
    if (bot.totalMass > 4 && !bot.isBoosting && Math.random() < 0.05) {
      bot.isBoosting = true;
      bot.boostTime = currentTime;
    }
  } else {
    // Random wandering behavior (food targeting removed)
    if (currentTime - bot.lastDirectionChange > 800 + Math.random() * 1200) {
      const currentArenaSize = { width: 5000, height: 5000 }; // Updated for larger map
      const mapCenterX = getMapCenterX(currentArenaSize);
      const mapCenterY = getMapCenterY(currentArenaSize);
      const mapRadius = getMapRadius(currentArenaSize);
      const distFromCenter = Math.sqrt((bot.head.x - mapCenterX) ** 2 + (bot.head.y - mapCenterY) ** 2);
      if (distFromCenter > mapRadius * 0.6) {
        // Move toward center when near edges
        const angleToCenter = Math.atan2(mapCenterY - bot.head.y, mapCenterX - bot.head.x);
        bot.targetAngle = angleToCenter + (Math.random() - 0.5) * Math.PI * 0.3;
      } else {
        // Random but more purposeful movement
        bot.targetAngle = Math.random() * Math.PI * 2;
      }
      bot.lastDirectionChange = currentTime;
    }
  }

  // Smooth angle interpolation
  let angleDiff = bot.targetAngle - bot.currentAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Faster turning for more responsive movement
  const turnSpeed = bot.isBoosting ? 0.06 : 0.04; // Faster turning when boosting
  bot.currentAngle += angleDiff * turnSpeed;

  // Keep angle in range
  if (bot.currentAngle > Math.PI) bot.currentAngle -= 2 * Math.PI;
  if (bot.currentAngle < -Math.PI) bot.currentAngle += 2 * Math.PI;

  // Update boost state timing
  if (bot.isBoosting && currentTime - bot.boostTime > 1200) {
    bot.isBoosting = false;
  }

  // Calculate speed with boosting
  let currentSpeed = bot.baseSpeed;
  if (bot.isBoosting && bot.totalMass > 4) {
    currentSpeed *= 1.62; // Boost multiplier (0.9x)
    // Lose mass when boosting (like player)
    bot.totalMass -= 0.03;
    if (bot.totalMass < 4) {
      bot.isBoosting = false; // Stop boosting if too small
    }
  }

  // Move bot
  const dx = Math.cos(bot.currentAngle) * currentSpeed;
  const dy = Math.sin(bot.currentAngle) * currentSpeed;

  bot.head.x += dx;
  bot.head.y += dy;

  // Keep bot within circular map bounds
  const currentArenaSize = { width: 5000, height: 5000 }; // Updated for larger map
  const mapCenterX = getMapCenterX(currentArenaSize);
  const mapCenterY = getMapCenterY(currentArenaSize);
  const mapRadius = getMapRadius(currentArenaSize);
  const distFromCenter = Math.sqrt((bot.head.x - mapCenterX) ** 2 + (bot.head.y - mapCenterY) ** 2);
  if (distFromCenter > mapRadius - 50) {
    const angleToCenter = Math.atan2(mapCenterY - bot.head.y, mapCenterX - bot.head.x);
    bot.targetAngle = angleToCenter;
  }

  // Update trail
  bot.segmentTrail.unshift({ x: bot.head.x, y: bot.head.y });
  const maxTrailLength = Math.floor((bot.totalMass / 1) * SEGMENT_SPACING * 2);
  if (bot.segmentTrail.length > maxTrailLength) {
    bot.segmentTrail.length = maxTrailLength;
  }

  // Update visible segments
  bot.visibleSegments = [];
  let distanceSoFar = 0;
  let segmentIndex = 0;
  const targetSegmentCount = Math.floor(bot.totalMass / 1);

  for (let i = 1; i < bot.segmentTrail.length && bot.visibleSegments.length < targetSegmentCount; i++) {
    const a = bot.segmentTrail[i - 1];
    const b = bot.segmentTrail[i];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentDist = Math.sqrt(dx * dx + dy * dy);

    while (distanceSoFar + segmentDist >= segmentIndex * SEGMENT_SPACING && bot.visibleSegments.length < targetSegmentCount) {
      const targetDistance = segmentIndex * SEGMENT_SPACING;
      const overshoot = targetDistance - distanceSoFar;
      const t = segmentDist > 0 ? overshoot / segmentDist : 0;

      const x = a.x + dx * t;
      const y = a.y + dy * t;

      bot.visibleSegments.push({ x, y, opacity: 1.0 });
      segmentIndex++;
    }

    distanceSoFar += segmentDist;
  }

  return bot;
}

class SmoothSnake {
  head: Position;
  currentAngle: number;
  turnSpeed: number;
  speed: number;
  baseSpeed: number;
  boostMultiplier: number;
  isBoosting: boolean;
  boostCooldown: number;

  // Trail and segment system
  segmentTrail: Position[];
  visibleSegments: Array<{ x: number; y: number; opacity: number }>; // Segments with opacity for fading
  totalMass: number;
  growthRemaining: number;
  partialGrowth: number; // For faster mass-to-segment conversion
  distanceBuffer: number;
  currentSegmentCount: number; // Smoothly animated segment count

  // Constants
  START_MASS: number;
  MASS_PER_SEGMENT: number;
  SEGMENT_SPACING: number;
  SEGMENT_RADIUS: number;
  MIN_MASS_TO_BOOST: number;

  // Money system
  money: number;
  foodsEaten: number; // Track total foods eaten for money rewards

  // Snake appearance
  color: string;

  // Callback for dropping boost food
  onDropFood?: (food: any) => void;

  constructor(x: number, y: number, color: string = '#7ED321', initialMoney: number = 1.05) {
    // Movement properties
    this.head = { x, y };
    this.currentAngle = 0;
    this.turnSpeed = 0.12; // Increased for more responsive turning
    this.baseSpeed = 4.5; // Increased for much faster, smoother movement
    this.boostMultiplier = 1.62;
    this.speed = this.baseSpeed;
    this.isBoosting = false;
    this.boostCooldown = 0;

    // Set snake color
    this.color = color;

    // Snake system constants
    this.START_MASS = 15; // Start with just 6 segments instead of 30
    this.MASS_PER_SEGMENT = 1;
    this.SEGMENT_SPACING = 5; // Segment spacing set to 5
    this.SEGMENT_RADIUS = 9;
    this.MIN_MASS_TO_BOOST = 3;

    // Initialize trail and segments
    this.segmentTrail = [{ x, y }];
    this.visibleSegments = [];
    this.totalMass = this.START_MASS;
    this.growthRemaining = 0;
    this.partialGrowth = 0; // Initialize partialGrowth for faster mass conversion
    this.distanceBuffer = 0;
    this.currentSegmentCount = this.START_MASS; // Start with initial segment count

    // Initialize money based on bet amount
    this.money = initialMoney;
    this.foodsEaten = 0; // Track foods eaten for money rewards

    this.updateVisibleSegments();
  }

  updateVisibleSegments() {
    // HARD CAP: Segments absolutely cannot exceed 100 under any circumstances
    const MAX_SEGMENTS = 100;
    const massBasedSegments = Math.floor(this.totalMass / this.MASS_PER_SEGMENT);
    const targetSegmentCount = Math.min(massBasedSegments, MAX_SEGMENTS);

    // Smoothly animate currentSegmentCount toward target with improved smoothing
    const transitionSpeed = 0.12; // Increased for smoother segment transitions
    if (this.currentSegmentCount < targetSegmentCount && this.currentSegmentCount < MAX_SEGMENTS) {
      this.currentSegmentCount += transitionSpeed;
    } else if (this.currentSegmentCount > targetSegmentCount) {
      this.currentSegmentCount -= transitionSpeed;
    }

    // CRITICAL: Absolute hard cap - no segments beyond 100 ever
    this.currentSegmentCount = Math.max(1, Math.min(this.currentSegmentCount, MAX_SEGMENTS));

    // Use floor for solid segments, check if we need a fading segment
    const solidSegmentCount = Math.floor(this.currentSegmentCount);
    const fadeAmount = this.currentSegmentCount - solidSegmentCount;

    this.visibleSegments = [];
    let distanceSoFar = 0;
    let segmentIndex = 0;
    // ABSOLUTE CAP: Never place more than 100 segments regardless of any other calculation
    let totalSegmentsToPlace = Math.min(Math.ceil(this.currentSegmentCount), MAX_SEGMENTS);

    // Process all segments in one pass to avoid distance calculation issues
    for (let i = 1; i < this.segmentTrail.length && this.visibleSegments.length < totalSegmentsToPlace; i++) {
      const a = this.segmentTrail[i - 1];
      const b = this.segmentTrail[i];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentDist = Math.sqrt(dx * dx + dy * dy);

           // Reduced segment spacing for smoother snake body
           const segmentSpacing = 4; // Reduced from 5 to 4 for smoother appearance

      // Check if we need to place segments in this trail section
      // TRIPLE CHECK: Enforce 100 segment limit at every placement
      while (distanceSoFar + segmentDist >= segmentIndex * segmentSpacing &&
        this.visibleSegments.length < totalSegmentsToPlace &&
        this.visibleSegments.length < MAX_SEGMENTS &&
        segmentIndex < MAX_SEGMENTS) {
        const targetDistance = segmentIndex * segmentSpacing;
        const overshoot = targetDistance - distanceSoFar;
        const t = segmentDist > 0 ? overshoot / segmentDist : 0;

        // Linear interpolation between trail points
        const x = a.x + dx * t;
        const y = a.y + dy * t;

        // Determine opacity - solid for most segments, fading for the last one
        let opacity = 1.0;
        if (segmentIndex >= solidSegmentCount) {
          // This is the fading segment - only add if opacity is significant
          opacity = fadeAmount;
          if (opacity < 0.15) { // Minimum threshold to prevent flickering
            break;
          }
        }

        this.visibleSegments.push({ x, y, opacity });
        segmentIndex++;
      }

      distanceSoFar += segmentDist;
    }
  }

  applyGrowth() {
    // Gradually increase mass from growthRemaining
    // Don't add segments manually - let updateVisibleSegments reveal them from trail
    if (this.growthRemaining > 0.05) {
      this.totalMass += 0.05;
      this.growthRemaining -= 0.05;
      // As totalMass increases, more trail segments become visible (smooth tail growth)
      this.updateVisibleSegments();
    }
  }

  getSegmentRadius() {
    // Cap width scaling at 100 segments, not mass
    const maxScale = 5;
    const MAX_SEGMENTS = 100;
    const currentSegments = Math.min(this.visibleSegments.length, MAX_SEGMENTS);
    const scaleFactor = Math.min(1 + (currentSegments - 10) / 100, maxScale);
    return this.SEGMENT_RADIUS * scaleFactor;
  }

  // Get scale factor for all visual elements
  getScaleFactor() {
    const maxScale = 5;
    return Math.min(1 + (this.totalMass - 10) / 100, maxScale);
  }

  move(mouseDirectionX: number, mouseDirectionY: number) {
    // Calculate target angle from mouse direction
    const targetAngle = Math.atan2(mouseDirectionY, mouseDirectionX);

    // Smooth angle interpolation with improved smoothing
    let angleDiff = targetAngle - this.currentAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Enhanced smooth turning with adaptive speed based on angle difference
    const baseTurnSpeed = this.turnSpeed;
    const angleMagnitude = Math.abs(angleDiff);
    
    // Adaptive turning - faster for larger angle differences, slower for fine adjustments
    const adaptiveTurnSpeed = baseTurnSpeed * (0.6 + angleMagnitude / Math.PI);
    
    // Increase turn speed while boosting for more responsive control
    const boostTurnMultiplier = 1.8; // Increased for more responsive boosted turning
    const currentTurnSpeed = this.isBoosting
      ? adaptiveTurnSpeed * boostTurnMultiplier
      : adaptiveTurnSpeed;

    // Apply enhanced smooth interpolation with higher cap for responsiveness
    this.currentAngle += angleDiff * Math.min(currentTurnSpeed, 0.15); // Increased max turn speed

    // Keep angle in range
    if (this.currentAngle > Math.PI) this.currentAngle -= 2 * Math.PI;
    if (this.currentAngle < -Math.PI) this.currentAngle += 2 * Math.PI;

    // Handle boost mechanics
    this.applyBoost();

    // Move head
    const dx = Math.cos(this.currentAngle) * this.speed;
    const dy = Math.sin(this.currentAngle) * this.speed;

    this.head.x += dx;
    this.head.y += dy;

    // Add head position to trail every frame for ultra-smooth following
    this.segmentTrail.unshift({ x: this.head.x, y: this.head.y });

    // Remove excess trail length (keep more trail for smoother segments)
    const maxTrailLength = Math.floor((this.totalMass / this.MASS_PER_SEGMENT) * this.SEGMENT_SPACING * 4); // Increased multiplier for smoother segments
    if (this.segmentTrail.length > maxTrailLength) {
      this.segmentTrail.length = maxTrailLength;
    }

    // Sample segments at fixed spacing from the trail with smoother interpolation
    this.updateVisibleSegments();

    // Apply gradual growth
    this.applyGrowth();
  }

  applyBoost() {
    if (this.isBoosting && this.totalMass > this.MIN_MASS_TO_BOOST) {
      this.speed = this.baseSpeed * this.boostMultiplier;
      this.boostCooldown++;

      // Lose mass and drop food while boosting (every ~16 frames = 0.75-1 times per second)
      if (this.boostCooldown % 16 === 0) {
        this.totalMass = Math.max(this.MIN_MASS_TO_BOOST, this.totalMass - 0.075); // 3x faster mass drain (0.025 * 3)

        // Get tail position for food drop
        let dropX = this.head.x;
        let dropY = this.head.y;

        // Drop from the last visible segment (tail) if available
        if (this.visibleSegments.length > 0) {
          const tailSegment = this.visibleSegments[this.visibleSegments.length - 1];
          dropX = tailSegment.x;
          dropY = tailSegment.y;
        } else if (this.segmentTrail.length > 10) {
          // Fallback to trail position if no visible segments
          const tailIndex = Math.min(this.segmentTrail.length - 1, 20);
          dropX = this.segmentTrail[tailIndex].x;
          dropY = this.segmentTrail[tailIndex].y;
        }

        // Create small food particle with 10-second expiration
        const boostFood = {
          id: `boost_${Date.now()}_${Math.random()}`,
          x: dropX,
          y: dropY,
          radius: 2, // Small boost food particle
          mass: 0.025, // Half the previous value
          color: this.color, // Use snake's color
          vx: 0,
          vy: 0,
          wobbleOffset: Math.random() * Math.PI * 2,
          expiresAt: Date.now() + 10000, // Expires after 10 seconds
          isBoostFood: true // Flag to identify boost food for special rendering
        };

        // Add to foods array (will need to be passed from game loop)
        this.onDropFood?.(boostFood);
      }
    } else {
      this.speed = this.baseSpeed;
      this.isBoosting = false;
    }
  }

  // Food consumption mechanic - grow when eating food
  eatFood(foodMass: number) {
    // Add growth based on food mass consumed - 3x effect
    this.growthRemaining += foodMass * 3;
    
    // Increment foods eaten counter
    this.foodsEaten++;
    
    // Give money reward every 40 foods eaten
    if (this.foodsEaten % 40 === 0 && this.foodsEaten > 0) {
      const moneyReward = 0.5; // $0.5 reward every 40 foods
      this.money += moneyReward;
      console.log(`💰 Food reward! Ate ${this.foodsEaten} foods total, earned $${moneyReward.toFixed(2)}! Total money: $${this.money.toFixed(2)}`);
    }
    
    console.log(`Snake ate food worth ${foodMass} mass (3x = ${foodMass * 3}), growth remaining: ${this.growthRemaining}, foods eaten: ${this.foodsEaten}`);
  }

  // Process growth at 10 mass per second rate
  processGrowth(deltaTime: number) {
    const growthRate = 10; // max 10 mass per second
    const maxGrowthThisFrame = growthRate * deltaTime;

    const growthThisFrame = Math.min(this.growthRemaining, maxGrowthThisFrame);
    this.partialGrowth += growthThisFrame;
    this.growthRemaining -= growthThisFrame;

    // Add mass when we have enough partial growth, but cap at 100 total mass
    const MAX_MASS = 100;
    while (this.partialGrowth >= 1 && this.totalMass < MAX_MASS) {
      this.totalMass += 1;
      this.partialGrowth -= 1;
    }
  }

  setBoost(boosting: boolean) {
    if (boosting && this.totalMass <= this.MIN_MASS_TO_BOOST) {
      this.isBoosting = false;
      return;
    }

    this.isBoosting = boosting;
    if (!boosting) {
      this.boostCooldown = 0;
    }
  }

  // Get eye positions for collision detection
  getEyePositions() {
    if (this.visibleSegments.length === 0) return [];

    const snakeHead = this.visibleSegments[0];
    const scaleFactor = this.getScaleFactor();
    const eyeDistance = 5 * scaleFactor; // Same as in drawing code
    const eyeSize = 3 * scaleFactor; // Same as in drawing code

    // Eye positions perpendicular to movement direction
    const eye1X = snakeHead.x + Math.cos(this.currentAngle + Math.PI / 2) * eyeDistance;
    const eye1Y = snakeHead.y + Math.sin(this.currentAngle + Math.PI / 2) * eyeDistance;
    const eye2X = snakeHead.x + Math.cos(this.currentAngle - Math.PI / 2) * eyeDistance;
    const eye2Y = snakeHead.y + Math.sin(this.currentAngle - Math.PI / 2) * eyeDistance;

    return [
      { x: eye1X, y: eye1Y, size: eyeSize },
      { x: eye2X, y: eye2Y, size: eyeSize }
    ];
  }

  // Method to completely clear snake when it dies
  clearSnakeOnDeath() {
    // Clear all body segments immediately to prevent visual artifacts
    this.visibleSegments = [];
    this.segmentTrail = [];

    // Reset all snake properties except money (players keep accumulated money)
    this.totalMass = 0;
    // this.money = 0; // Keep money - only cash out gives rewards
    this.foodsEaten = 0; // Reset foods eaten counter
    this.growthRemaining = 0;
    this.partialGrowth = 0;
    this.currentSegmentCount = 0;

    // Reset movement properties to prevent any residual movement
    this.isBoosting = false;
    this.boostCooldown = 0;
    this.speed = this.baseSpeed;

    console.log(`💀 SNAKE DEATH: All segments cleared, body completely invisible. Money preserved: $${this.money.toFixed(2)}`);
  }

  // Method to get positions along the snake body for dropping money crates
  getSnakeBodyPositions(crateCount: number): Position[] {
    if (this.visibleSegments.length === 0) return [];

    const positions: Position[] = [];
    const segmentCount = this.visibleSegments.length;

    // Distribute money crates evenly along the snake body
    for (let i = 0; i < crateCount && i < segmentCount; i++) {
      const segmentIndex = Math.floor((i / crateCount) * segmentCount);
      const segment = this.visibleSegments[segmentIndex];
      if (segment) {
        // Add some random offset to spread crates out
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        positions.push({
          x: segment.x + offsetX,
          y: segment.y + offsetY
        });
      }
    }

    return positions;
  }
}

export default function GamePage() {
  const { user, winBet, loseBet } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const params = useParams();
  const roomId = params?.roomId || '1'; // Default to room 1 if no room specified
  const region = params?.region || 'us'; // Default to US region if no region specified
  const [mouseDirection, setMouseDirection] = useState<Position>({ x: 1, y: 0 });
  const [mouseWorldPosition, setMouseWorldPosition] = useState<Position>({ x: 0, y: 0 });
  // Friend mode colors - different colors for each friend
  const getFriendColor = (playerId: string, isFriendMode: boolean): string => {
    if (!isFriendMode) return '#7ED321'; // Default green for normal mode
    
    // Friend mode colors - assign based on player ID hash
    const friendColors = ['#7ED321', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
    const hash = playerId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const colorIndex = Math.abs(hash) % friendColors.length;
    return friendColors[colorIndex];
  };

  // Helper function to get darker color for borders
  const getDarkerColor = (color: string): string => {
    const colorMap: { [key: string]: string } = {
      '#7ED321': '#4B934B', // Green
      '#FF6B6B': '#CC5555', // Red
      '#4ECDC4': '#3BA39C', // Teal
      '#45B7D1': '#3696A8', // Blue
      '#96CEB4': '#7AB89C', // Light Green
      '#FECA57': '#CC9A46', // Yellow
      '#FF9FF3': '#CC7FC2', // Pink
      '#54A0FF': '#4380CC'  // Light Blue
    };
    return colorMap[color] || '#4B934B';
  };

  const [myPlayerColor, setMyPlayerColor] = useState<string>('#7ED321'); // Will be updated when we get player ID
  const [snake] = useState(() => {
    const initialArenaSize = { width: 5000, height: 5000 };
    const centerX = getMapCenterX(initialArenaSize);
    const centerY = getMapCenterY(initialArenaSize);
    const newSnake = new SmoothSnake(centerX, centerY, '#7ED321');
    console.log(`NEW SNAKE CREATED: mass=${newSnake.totalMass}, visibleSegments=${newSnake.visibleSegments.length}, trail=${newSnake.segmentTrail.length}`);
    return newSnake;
  });

  // Update snake color when myPlayerColor changes
  useEffect(() => {
    snake.color = myPlayerColor;
  }, [myPlayerColor, snake]);

  // Set up callback for boost food dropping
  useEffect(() => {
    snake.onDropFood = (boostFood: any) => {
      // Add boost food to local food array
      setFoods(currentFoods => [...currentFoods, boostFood]);

      // Send boost food to server for broadcasting to other players
      if (socketRef.current && socketRef.current.connected) {
        console.log(`🍕 Sending boost food to server:`, boostFood);
        socketRef.current.emit('boostFood', {
          type: 'boostFood',
          food: boostFood
        });
      } else {
        // console.log(`⚠️ Cannot send boost food - Socket.IO not connected`);
      }
    };
  }, [snake]);
  const [botSnakes, setBotSnakes] = useState<BotSnake[]>([]);
  const [serverBots, setServerBots] = useState<any[]>([]);
  const [serverPlayers, setServerPlayers] = useState<any[]>([]);
  const [lastServerUpdate, setLastServerUpdate] = useState<number>(0);
  const [playerPositions, setPlayerPositions] = useState<Map<string, {
    current: Array<{ x: number; y: number }>;
    target: Array<{ x: number; y: number }>;
    lastUpdate: number;
  }>>(new Map());
  const [foods, setFoods] = useState<Food[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const gameOverRef = useRef(false);
  const [snakeVisible, setSnakeVisible] = useState(true);
  const snakeVisibleRef = useRef(true);
  const [snakeFading, setSnakeFading] = useState(false);
  const snakeFadingRef = useRef(false);
  const [fadeOpacity, setFadeOpacity] = useState(1.0);
  const fadeOpacityRef = useRef(1.0);
  const fadeStartTimeRef = useRef(0);

  // Sync ref with state
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);
  
  
  const [score, setScore] = useState(0);
  const [isBoosting, setIsBoosting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);

  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [dollarSignImage, setDollarSignImage] = useState<HTMLImageElement | null>(null);
  const [moneyCrateImage, setMoneyCrateImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(2); // Start at 2× zoomed-in
  const [lastFrameTime, setLastFrameTime] = useState(Date.now());

  // Zoom parameters
  const minZoom = 0.3; // Maximum zoom-out (0.3×)
  const zoomSmoothing = 0.08; // Increased for smoother zoom transitions

  // Game constants - fullscreen
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [gameIsVisible, setGameIsVisible] = useState(!document.hidden);
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [cashOutProgress, setCashOutProgress] = useState(0);
  const [cashOutStartTime, setCashOutStartTime] = useState<number | null>(null);
  const [qKeyPressed, setQKeyPressed] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [cashedOutAmount, setCashedOutAmount] = useState(0);
  const [cashOutCompleted, setCashOutCompleted] = useState(false);
  
  // Auto-play state
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);
  const [autoPlayTarget, setAutoPlayTarget] = useState<Position>({ x: 0, y: 0 });
  const [lastAutoPlayUpdate, setLastAutoPlayUpdate] = useState(0);
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [autoServerSwitchTime, setAutoServerSwitchTime] = useState(0);
  
  // Server list for auto-switching
  const servers = [
    { region: 'us', room: '1' },
    { region: 'us', room: '2' }, 
    { region: 'eu', room: '1' },
    { region: 'eu', room: '2' },
    { region: 'asia', room: '1' },
    { region: 'asia', room: '2' }
  ];
  
  // Auto-play sync effect
  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && autoServerSwitchTime === 0) {
      setAutoServerSwitchTime(Date.now());
    }
  }, [autoPlay, autoServerSwitchTime]);

  // Refs for immediate access to state values in game loop
  const qKeyPressedRef = useRef(false);
  const cashingOutRef = useRef(false);
  const cashOutStartTimeRef = useRef<number | null>(null);

  const lastSentPositionRef = useRef<{ x: number; y: number; segmentCount: number } | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<Array<{
    id: string;
    segments: Array<{ x: number; y: number }>;
    color: string;
    money: number;
    cashingOut?: boolean;
    cashOutProgress?: number;
  }>>([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [arenaSize, setArenaSize] = useState({ width: 5000, height: 5000 }); // Much larger map size like snake.io
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [ghostModeEndTime, setGhostModeEndTime] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Betting system state
  const [currentBetAmount, setCurrentBetAmount] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Withdraw modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // Parse URL parameters for betting and friend mode
  const [friendModeConfig, setFriendModeConfig] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return getFriendModeConfig(urlParams);
  });
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const betAmount = parseFloat(urlParams.get('betAmount') || '0');
    const userId = urlParams.get('userId') || '';
    const region = urlParams.get('region');
    const roomId = urlParams.get('roomId');

    console.log('🎮 Game URL params:', { betAmount, userId, region, roomId, search: window.location.search });

    if (betAmount > 0 && userId) {
      setCurrentBetAmount(betAmount);
      setCurrentUserId(userId);
      // Set snake's initial money to bet amount
      snake.money = betAmount;
      console.log(`🎯 Game started with bet: $${betAmount}, User: ${userId}, Snake initial money: $${snake.money.toFixed(2)}`);
    } else {
      // Default initial money if no bet
      snake.money = 1.05;
      console.log(`🎯 No bet amount, using default initial money: $${snake.money.toFixed(2)}`);
    }

    // Update friend mode config
    const config = getFriendModeConfig(urlParams);
    setFriendModeConfig(config);
    
    if (config.isEnabled) {
      console.log(`🎮 Friend mode enabled - ${config.gameTitle}`);
      console.log(`🤖 Bots disabled: ${config.disableBots}`);
      console.log(`👥 Max players: ${config.maxPlayers}`);
    }

    // Log room information for debugging
    if (region && roomId) {
      console.log(`🏠 Friend game room: ${roomId} in region: ${region}`);
    }
  }, [snake]);

  // Function to handle game results and betting system
  const handleGameResult = async (finalMass: number, timeAlive: number) => {
    if (currentBetAmount <= 0 || !currentUserId) {
      console.log('No bet amount or user ID, skipping betting system');
      return;
    }

    try {
      // Calculate winnings based on final mass and time
      // Simple multiplier: 0.5x to 5x based on performance
      const baseMultiplier = Math.min(5, Math.max(0.5, (finalMass / 10) * (timeAlive / 60)));
      const winnings = currentBetAmount * baseMultiplier;

      console.log(`🎯 Game Result - Mass: ${finalMass}, Time: ${timeAlive}s, Bet: $${currentBetAmount}, Winnings: $${winnings.toFixed(2)}`);

      // Call the betting system
      if (winnings > currentBetAmount) {
        // Player won - get winnings
        await winBet(currentBetAmount, winnings - currentBetAmount);
        console.log(`💰 Won $${(winnings - currentBetAmount).toFixed(2)}!`);

        // Show success toast
        toast({
          title: "🎉 You Won!",
          description: `Bet: $${currentBetAmount} | Winnings: $${(winnings - currentBetAmount).toFixed(2)} | Total: $${winnings.toFixed(2)}`,
        });
      } else {
        // Player lost - bet amount stays in hold wallet
        await loseBet(currentBetAmount);
        console.log(`💸 Lost bet of $${currentBetAmount}`);

        // Show loss toast
        toast({
          title: "💸 Game Over",
          description: `Bet of $${currentBetAmount} lost. Better luck next time!`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to process game result:', error);

      // Show error toast
      toast({
        title: "❌ Error",
        description: "Failed to process betting result. Please contact support.",
        variant: "destructive"
      });
    }
  };

  // Function to handle cash out with new logic
  const handleCashOut = async () => {
    if (currentBetAmount <= 0 || !currentUserId) {
      console.log('No bet amount or user ID, cannot cash out');
      return;
    }

    try {
      const currentMoney = snake.money;
      const winnings = Math.max(0, currentMoney - currentBetAmount); // Only winnings above bet
      
      console.log(`💰 Cash Out - Current Money: $${currentMoney.toFixed(2)}, Bet: $${currentBetAmount}, Winnings: $${winnings.toFixed(2)}`);

      if (winnings > 0) {
        // Player has winnings to cash out
        await winBet(currentBetAmount, winnings);
        console.log(`💰 Cashed out $${winnings.toFixed(2)} winnings!`);

        // Hide cash UI after successful cash out
        setCashOutCompleted(true);

        // Show success toast
        toast({
          title: "💰 Cash Out Successful!",
          description: `Cashed out $${winnings.toFixed(2)} winnings!`,
        });
      } else {
        // No winnings to cash out
        toast({
          title: "❌ Cannot Cash Out",
          description: `You need at least $${currentBetAmount.toFixed(2)} to cash out (current: $${currentMoney.toFixed(2)})`,
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Failed to process cash out:', error);

      // Show error toast
      toast({
        title: "❌ Cash Out Error",
        description: "Failed to process cash out. Please contact support.",
        variant: "destructive"
      });
    }
  };

  // Function to drop money crates when snake dies (1 crate per mass unit)
  const dropMoneyCrates = (playerMoney: number, snakeMass: number) => {
    const crateCount = Math.floor(snakeMass); // 1 crate per mass unit

    if (crateCount <= 0) return;

    const crateValue = playerMoney / crateCount; // Split money evenly across all crates

    console.log(`💰 Dropping ${crateCount} money crates worth $${crateValue.toFixed(3)} each (total: $${playerMoney}, mass: ${snakeMass})`);

    // Get positions along the snake body
    const positions = snake.getSnakeBodyPositions(crateCount);

    // Create money crates at each position
    const newCrates: Food[] = [];
    for (let i = 0; i < Math.min(crateCount, positions.length); i++) {
      const pos = positions[i];
      const crate: Food = {
        id: `money_crate_${Date.now()}_${i}`,
        x: pos.x,
        y: pos.y,
        radius: 4, // Smaller money crate
        mass: 0, // No mass growth, just money
        color: '#ffd700', // Gold color for money
        vx: 0,
        vy: 0,
        wobbleOffset: Math.random() * Math.PI * 2,
        isMoneyCrate: true,
        moneyValue: crateValue
      };
      newCrates.push(crate);
    }

    // Add all crates to the foods array
    setFoods(currentFoods => [...currentFoods, ...newCrates]);

    // Send money crates to server for broadcasting to other players
    if (socketRef.current && socketRef.current.connected) {
      newCrates.forEach(crate => {
        socketRef.current!.emit('moneyCrate', {
          type: 'moneyCrate',
          crate: crate
        });
      });
    }
  };



  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = '/snake-backgound.jpg';
    img.onload = () => {
      console.log('Background image loaded successfully');
      setBackgroundImage(img);
    };
    img.onerror = (e) => {
      console.error('Failed to load background image:', e);
      // Try alternative path if first fails
      const fallbackImg = new Image();
      fallbackImg.src = '/snake-backgound.jpg';
      fallbackImg.onload = () => {
        console.log('Background image loaded from fallback path');
        setBackgroundImage(fallbackImg);
      };
      fallbackImg.onerror = (e2) => {
        console.error('Failed to load background image from fallback:', e2);
      };
    };
  }, []);

  // Draw static background on separate canvas - NEVER changes
  // Background rendering function that follows camera - optimized for performance
  const renderBackground = useCallback(() => {
    const bgCanvas = backgroundCanvasRef.current;
    if (!bgCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return;

    // Set canvas size to match screen
    bgCanvas.width = canvasSize.width;
    bgCanvas.height = canvasSize.height;

    // Clear background canvas
    bgCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Apply camera transform to background (same as game canvas)
    bgCtx.save();
    
    // Calculate camera position to keep snake centered (with world boundary limits)
    const mapRadius = getMapRadius(arenaSize);
    const mapCenterX = getMapCenterX(arenaSize);
    const mapCenterY = getMapCenterY(arenaSize);
    
    // Calculate desired camera position (snake's world position)
    let cameraX = snake.head.x;
    let cameraY = snake.head.y;
    
    // Apply world boundary constraints to camera
    const halfScreenWidth = (canvasSize.width / 2) / zoom;
    const halfScreenHeight = (canvasSize.height / 2) / zoom;
    
    const maxCameraX = mapCenterX + mapRadius - halfScreenWidth;
    const minCameraX = mapCenterX - mapRadius + halfScreenWidth;
    const maxCameraY = mapCenterY + mapRadius - halfScreenHeight;
    const minCameraY = mapCenterY - mapRadius + halfScreenHeight;
    
    cameraX = Math.max(minCameraX, Math.min(maxCameraX, cameraX));
    cameraY = Math.max(minCameraY, Math.min(maxCameraY, cameraY));
    
    // Apply camera transform: Center + Zoom + Offset
    bgCtx.translate(canvasSize.width / 2, canvasSize.height / 2);  // Center camera on screen
    bgCtx.scale(zoom, zoom);                                        // Apply zoom level
    bgCtx.translate(-cameraX, -cameraY);                           // Follow snake (with boundary limits)

    if (backgroundImage) {
      // Create tiled pattern for infinite background effect
      const pattern = bgCtx.createPattern(backgroundImage, 'repeat');
      if (pattern) {
        bgCtx.fillStyle = pattern;
        // Draw a large area to ensure coverage with camera movement
        const largeSize = Math.max(canvasSize.width, canvasSize.height) * 3;
        bgCtx.fillRect(-largeSize, -largeSize, largeSize * 2, largeSize * 2);
      } else {
        // Fallback: stretch single image
        bgCtx.globalAlpha = 0.8;
        const largeSize = Math.max(canvasSize.width, canvasSize.height) * 2;
        bgCtx.drawImage(
          backgroundImage,
          0, 0,
          backgroundImage.width, backgroundImage.height,
          -largeSize, -largeSize,
          largeSize * 2, largeSize * 2
        );
      }

      // Add slightly darker overlay (increased from 0.3 to 0.4 for more darkness)
      bgCtx.globalAlpha = 0.4;
      bgCtx.fillStyle = '#000000';
      const largeSize = Math.max(canvasSize.width, canvasSize.height) * 3;
      bgCtx.fillRect(-largeSize, -largeSize, largeSize * 2, largeSize * 2);
    } else {
      // Fallback pattern
      bgCtx.fillStyle = '#1a1a2e';
      const largeSize = Math.max(canvasSize.width, canvasSize.height) * 3;
      bgCtx.fillRect(-largeSize, -largeSize, largeSize * 2, largeSize * 2);

      // Add dot pattern
      bgCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      const dotSpacing = 40;
      for (let x = -largeSize; x < largeSize; x += dotSpacing) {
        for (let y = -largeSize; y < largeSize; y += dotSpacing) {
          bgCtx.beginPath();
          bgCtx.arc(x, y, 1, 0, Math.PI * 2);
          bgCtx.fill();
        }
      }
    }

    bgCtx.restore();
  }, [backgroundImage, canvasSize, snake.head.x, snake.head.y, zoom, arenaSize]);

  // Render background only when necessary (not every frame)
  const lastCameraPosition = useRef({ x: 0, y: 0, zoom: 1 });
  useEffect(() => {
    const currentCamera = { x: snake.head.x, y: snake.head.y, zoom };
    const cameraChanged = 
      Math.abs(currentCamera.x - lastCameraPosition.current.x) > 5 ||
      Math.abs(currentCamera.y - lastCameraPosition.current.y) > 5 ||
      Math.abs(currentCamera.zoom - lastCameraPosition.current.zoom) > 0.01;
    
    if (cameraChanged) {
      renderBackground();
      lastCameraPosition.current = currentCamera;
    }
  }, [renderBackground, snake.head.x, snake.head.y, zoom]);

  // Load money crate image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      console.log('Money crate image loaded successfully');
      setMoneyCrateImage(img);
    };
    img.onerror = (e) => {
      console.error('Failed to load money crate image:', e);
    };
  }, []);







  // Handle canvas resize for fullscreen
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Prevent browser zoom
  useEffect(() => {
    const preventZoom = (e: WheelEvent | KeyboardEvent) => {
      if ('ctrlKey' in e && e.ctrlKey) {
        e.preventDefault();
        return false;
      }
      if ('metaKey' in e && e.metaKey) {
        e.preventDefault();
        return false;
      }
    };

    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('wheel', preventZoom, { passive: false });
    document.addEventListener('keydown', preventKeyboardZoom, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventZoom);
      document.removeEventListener('keydown', preventKeyboardZoom);
    };
  }, []);



  // Simple tab visibility handling - return to home when tab becomes inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && gameStarted) {
        console.log('⏸️ Tab became hidden, instantly returning to home page');

        // Instantly return to home page when tab becomes inactive
        setGameStarted(false);
        setGameOver(false);
        gameOverRef.current = false;

        // Hide snake immediately
        snakeVisibleRef.current = false;
        setSnakeVisible(false);

        // Clean up Socket.IO connection
        if (socketRef.current) {
          // console.log('Cleaning up Socket.IO connection...');
          socketRef.current.disconnect();
          socketRef.current = null;
        }

        // Navigate back to home page
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));

        // Clear snake data immediately to prevent race condition
        snake.visibleSegments = [];
        snake.segmentTrail = [];
        snake.totalMass = 0;
        snake.clearSnakeOnDeath();

        console.log('🏠 Returned to home page due to tab switch');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gameStarted]);

  // Initialize food system when game starts
  useEffect(() => {
    if (!gameStarted) return;

    // Clear any local game state - server provides everything except food (client-side)
    setBotSnakes([]);
    // Initialize bot snakes based on game mode
    const botCount = getInitialBotCount(friendModeConfig);
    const initialBots: BotSnake[] = shouldSpawnBots(friendModeConfig) 
      ? Array.from({ length: botCount }, (_, i) => createBotSnake(`bot_${Date.now()}_${i}`))
      : [];
    setBotSnakes(initialBots);
    
    if (friendModeConfig.isEnabled) {
      console.log("🎮 Friend mode: No bots spawned, friend vs friend only");
    } else {
      console.log(`🤖 Normal mode: ${botCount} bots spawned`);
    }

    // Initialize food particles
    const initialFoods: Food[] = [];
    const foodCount = getFoodCount(arenaSize);
    for (let i = 0; i < foodCount; i++) {
      initialFoods.push(createFood(`food_${i}`, arenaSize));
    }
    setFoods(initialFoods);

    console.log("Game started - initialized", foodCount, "food particles");
  }, [gameStarted, friendModeConfig]);

  // Helper function to construct proper Socket.IO URL
  const constructSocketIOUrl = useCallback(() => {
    let baseUrl: string;
    
    if (import.meta.env.PROD) {
      // In production, use the environment variable or fallback to Render
      baseUrl = import.meta.env.VITE_WS_URL || 'https://pumpgames-lkbp.onrender.com';
    } else {
      // In development, use the main server on port 5174 (which includes Socket.IO)
      baseUrl = 'http://localhost:5174';
    }
    
    console.log(`🔧 Base URL: ${baseUrl}`);
    
    // Clean up the URL to remove any trailing slashes
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    
    console.log(`🔧 Constructed Socket.IO URL: ${cleanUrl}`);
    return cleanUrl;
  }, []);

  // Test Socket.IO connection function
  const testSocketIOConnection = useCallback(async () => {
    const socketUrl = constructSocketIOUrl();
    // console.log(`🧪 Testing Socket.IO connection to: ${socketUrl}`);
    
    try {
      const testSocket = io(socketUrl, {
        path: "/socket.io",
        query: {
          region: region,
          room: roomId,
          mode: friendModeConfig.isEnabled ? 'friends' : 'normal'
        },
        timeout: 5000
      });
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          testSocket.disconnect();
          reject(new Error('Connection test timeout'));
        }, 5000);
        
        testSocket.on('connect', () => {
          console.log('✅ Socket.IO connection test successful');
          clearTimeout(timeout);
          testSocket.disconnect();
          resolve(true);
        });
        
        testSocket.on('connect_error', (error) => {
          // console.error('❌ Socket.IO connection test failed:', error);
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      // console.error('❌ Socket.IO connection test error:', error);
      throw error;
    }
  }, [constructSocketIOUrl, region, roomId, friendModeConfig.isEnabled]);

  // Socket.IO connection for real multiplayer
  useEffect(() => {
    if (!gameStarted) return;

    const socketUrl = constructSocketIOUrl();
    // console.log(`🌐 Connecting to Socket.IO: ${socketUrl}`);
    // console.log(`🎮 Friend mode config:`, friendModeConfig);
    // console.log(`🌐 Base URL: ${import.meta.env.VITE_WS_URL || 'default'}`);
    // console.log(`🌐 Environment: ${import.meta.env.PROD ? 'production' : 'development'}`);
    
    const socket = io(socketUrl, {
      path: "/socket.io",
      query: {
        region: region,
        room: roomId,
        mode: friendModeConfig.isEnabled ? 'friends' : 'normal'
      }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // console.log("✅ Connected to multiplayer server!");
      // console.log("✅ Socket.IO connected:", socket.connected);
      // console.log("✅ Connection URL:", socketUrl);
      // console.log("✅ Connection established at:", new Date().toISOString());
      setConnectionStatus('Connected');
      
      // Set up connection health check
      const healthCheck = setInterval(() => {
        if (socket.connected) {
          // Send a ping to keep connection alive
          try {
            socket.emit('ping', { timestamp: Date.now() });
            console.log('🏓 Sent ping to server');
          } catch (error) {
            console.error('❌ Health check ping failed:', error);
            clearInterval(healthCheck);
          }
        } else {
          console.log('🔄 Socket.IO not connected, clearing health check');
          clearInterval(healthCheck);
        }
      }, 30000); // Ping every 30 seconds
      
      // Store health check interval for cleanup
      (socket as any).healthCheckInterval = healthCheck;
    });

    socket.on('message', (data) => {
      try {
        if (data.type === 'players') {
          // Filter out our own player data and update others
          const filteredPlayers = data.players.filter((p: any) =>
            p.id !== myPlayerId && p.segments.length > 0
          );
          // Use server data directly to avoid position mismatch
          setOtherPlayers(filteredPlayers);
          console.log(`🤖 Received ${data.players.length} total players, showing ${filteredPlayers.length} others`);
          console.log(`🤖 Player IDs:`, data.players.map((p: any) => `${p.id}${p.isBot ? ' (BOT)' : ''} (color: ${p.color})`));
          console.log(`🤖 MyPlayerId: ${myPlayerId}`);
          console.log(`🤖 Friend mode enabled: ${friendModeConfig.isEnabled}`);
        } else if (data.type === 'welcome') {
          setMyPlayerId(data.playerId);
          console.log(`My player ID: ${data.playerId} in room ${data.roomId || roomId}`);

          // Set player color based on friend mode and player ID
          const newColor = getFriendColor(data.playerId, friendModeConfig.isEnabled);
          setMyPlayerColor(newColor);
          console.log(`🎨 Player color set to: ${newColor} (friend mode: ${friendModeConfig.isEnabled})`);

          // Enable ghost mode for 5 seconds on spawn to prevent auto-death
          setIsGhostMode(true);
          setGhostModeEndTime(Date.now() + 5000);
          console.log(`👻 Ghost mode activated for 5 seconds`);
        } else if (data.type === 'players') {
          // Handle server player updates
          const currentTime = Date.now();
          setServerPlayers(data.players || []);

          // Update player positions for smooth interpolation
          setPlayerPositions(prevPositions => {
            const newPositions = new Map(prevPositions);

            (data.players || []).forEach((player: any) => {
              if (player.id !== myPlayerId && player.segments && player.segments.length > 0) {
                const existing = newPositions.get(player.id);

                if (existing) {
                  // Check if positions changed significantly to avoid interpolating identical positions
                  const headDistance = existing.target.length > 0 && player.segments.length > 0 ?
                    Math.sqrt(
                      Math.pow(existing.target[0].x - player.segments[0].x, 2) +
                      Math.pow(existing.target[0].y - player.segments[0].y, 2)
                    ) : 0;

                  // Only update if there's meaningful movement (>1px)
                  if (headDistance > 1) {
                    newPositions.set(player.id, {
                      current: existing.current.length > 0 ? existing.current : player.segments,
                      target: player.segments,
                      lastUpdate: currentTime
                    });
                  }
                } else {
                  // New player - no interpolation needed
                  newPositions.set(player.id, {
                    current: player.segments,
                    target: player.segments,
                    lastUpdate: currentTime
                  });
                }
              }
            });

            return newPositions;
          });
        } else if (data.type === 'pong') {
          // Handle pong response from server
          const latency = Date.now() - data.timestamp;
          console.log(`🏓 Pong received - Latency: ${latency}ms`);
        } else if (data.type === 'gameWorld') {
          setServerBots(data.bots || []);

          // Update server players with interpolation data
          const currentTime = Date.now();
          setServerPlayers(data.players || []);

          // Update player positions for smooth interpolation
          setPlayerPositions(prevPositions => {
            const newPositions = new Map(prevPositions);

            (data.players || []).forEach((player: any) => {
              if (player.id !== myPlayerId && player.segments && player.segments.length > 0) {
                const existing = newPositions.get(player.id);

                if (existing) {
                  // Check if positions changed significantly to avoid interpolating identical positions
                  const headDistance = existing.target.length > 0 && player.segments.length > 0 ?
                    Math.sqrt(
                      Math.pow(existing.target[0].x - player.segments[0].x, 2) +
                      Math.pow(existing.target[0].y - player.segments[0].y, 2)
                    ) : 0;

                  // Only update if there's meaningful movement (>1px)
                  if (headDistance > 1) {
                    newPositions.set(player.id, {
                      current: existing.current.length > 0 ? existing.current : player.segments,
                      target: player.segments,
                      lastUpdate: currentTime
                    });
                  }
                } else {
                  // New player - no interpolation needed
                  newPositions.set(player.id, {
                    current: player.segments,
                    target: player.segments,
                    lastUpdate: currentTime
                  });
                }
              }
            });

            return newPositions;
          });

          setLastServerUpdate(currentTime);

          // Food is handled client-side, not synced across players
          console.log(`Room ${data.roomId || roomId}: Received shared world: ${data.bots?.length} bots, ${data.players?.length} players, ${foods.length} food`);
          if (data.players && data.players.length > 0 && Math.random() < 0.1) {
            data.players.forEach((player: any, idx: number) => {
              console.log(`Player ${idx}: id=${player.id}, segments=${player.segments?.length || 0}, color=${player.color}`);
            });
          }

          // Friend mode: Check if only one friend is left alive
          if (friendModeConfig.isEnabled && data.players && data.players.length > 0) {
            const alivePlayers = data.players.filter((player: any) => 
              player.segments && player.segments.length > 2 && !player.isDead && !player.gameOver
            );
            
            // If only 1 or 0 players left alive in friend mode, end the game
            if (alivePlayers.length <= 1) {
              console.log(`🎮 Friend mode: Only ${alivePlayers.length} player(s) left alive. Ending game for all friends.`);
              
              // Send game over signal to server
              if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('gameOver', {
                  type: 'gameOver',
                  reason: 'friend_mode_ended'
                });
              }
              
              // End the game locally
              setGameStarted(false);
              setGameOver(false);
              gameOverRef.current = false;
              
              // Return to home
              setTimeout(() => {
                setLocation('/');
              }, 1000);
            }
          }

          // Force immediate re-render for proper snake body display with eyes
          if (canvasRef.current) {
            // Trigger multiple renders to ensure eyes appear immediately
            for (let i = 0; i < 3; i++) {
              window.requestAnimationFrame(() => {
                // Multiple redraws ensure all elements render properly
              });
            }
          }
        } else if (data.type === 'friendGameEnded') {
          // Friend mode game ended - both friends should return to home
          console.log(`🎮 Friend game ended: ${data.reason}`);
          
          setGameStarted(false);
          setGameOver(false);
          gameOverRef.current = false;
          
          // Return to home
          setTimeout(() => {
            setLocation('/');
          }, 1000);
        } else if (data.type === 'boostFood') {
          // Received boost food from another player - add it to our local food array
          console.log(`🍕 Received boost food from player ${data.playerId}:`, data.food);
          // Ensure the boost food has an expiration time if not already set
          const boostFood = {
            ...data.food,
            expiresAt: data.food.expiresAt || (Date.now() + 10000),
            opacity: data.food.opacity || 1.0 // Start with full opacity
          };
          setFoods(currentFoods => {
            console.log(`🍕 Adding boost food to foods array. Current count: ${currentFoods.length}`);
            return [...currentFoods, boostFood];
          });
        } else if (data.type === 'moneyCrate') {
          // Received money crate from another player's death
          console.log(`💰 Received money crate from player ${data.playerId}:`, data.crate);
          setFoods(currentFoods => {
            console.log(`💰 Adding money crate to foods array. Current count: ${currentFoods.length}`);
            return [...currentFoods, data.crate];
          });
        } else if (data.type === 'moneyCrateRemoved') {
          console.log(`💰 CLIENT: Money crate ${data.crateId} was collected by ${data.collectedBy}`);
          // Remove money crate from foods array
          setFoods(currentFoods => {
            const filtered = currentFoods.filter(food => food.id !== data.crateId);
            console.log(`💰 Removed money crate ${data.crateId}. Foods count: ${currentFoods.length} -> ${filtered.length}`);
            return filtered;
          });
        } else if (data.type === 'cashingOut') {
          // Update other player's cash-out status
          setOtherPlayers(current =>
            current.map(player =>
              player.id === data.playerId
                ? { ...player, cashingOut: true, cashOutProgress: data.progress }
                : player
            )
          );
        } else if (data.type === 'cashOutComplete' || data.type === 'cashOutCancelled') {
          // Remove cash-out status from other player
          setOtherPlayers(current =>
            current.map(player =>
              player.id === data.playerId
                ? { ...player, cashingOut: false, cashOutProgress: 0 }
                : player
            )
          );
        } else if (data.type === 'death') {
          console.log(`💀 CLIENT RECEIVED DEATH MESSAGE: ${data.reason} - crashed into ${data.crashedInto}`);
          // Server detected our collision - instantly return to home screen
          console.log(`💀 SERVER DEATH - Instant return to home`);

          // Calculate time alive in seconds
          const timeAlive = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;

          // Player died - no money reward, only cash out gives money
          console.log(`💀 Player died - no money reward given. Only cash out gives money.`);

          // Store game over data for home page
          localStorage.setItem('gameOverData', JSON.stringify({
            finalMass: snake.totalMass,
            timeAlive: timeAlive
          }));

          // Hide snake first
          snakeVisibleRef.current = false;
          setSnakeVisible(false);

          // No Service Worker cleanup needed

          // Instantly return to home screen - no fade, no game over screen
          console.log(`🏠 Instantly returning to home screen after server death`);
          setGameStarted(false);
          setGameOver(false);
          gameOverRef.current = false;
          snakeFadingRef.current = false;
          setSnakeFading(false);

          // Navigate back to home page
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));

          // Clear snake data immediately to prevent race condition
          snake.visibleSegments = [];
          snake.segmentTrail = [];
          snake.totalMass = 0;
          snake.clearSnakeOnDeath();
        } else if (data.type === 'arenaSize') {
          // Handle arena size updates from server
          console.log(`🏟️ Arena size updated: ${data.arenaSize.width}x${data.arenaSize.height} (${data.playerCount} players)`);
          setArenaSize(data.arenaSize);
        }
      } catch (error) {
        console.error('Error parsing Socket.IO message:', error);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log("❌ Disconnected from multiplayer server");
      console.log("❌ Disconnect reason:", reason);
      setConnectionStatus('Disconnected');
      socketRef.current = null;

      // Auto-reconnect after 2 seconds if not a normal closure
      if (reason !== 'io client disconnect' && gameStarted) {
        console.log("Attempting auto-reconnect in 2 seconds...");
        setConnectionStatus('Reconnecting');
        setTimeout(() => {
          if (gameStarted && !socketRef.current) {
            console.log("Auto-reconnecting to multiplayer server...");
            // Create new Socket.IO connection using the same helper function
            const reconnectUrl = constructSocketIOUrl();
            console.log(`🔄 Reconnecting to: ${reconnectUrl}`);
            
            const newSocket = io(reconnectUrl, {
              path: "/socket.io",
              query: {
                region: region,
                room: roomId,
                mode: friendModeConfig.isEnabled ? 'friends' : 'normal'
              }
            });
            socketRef.current = newSocket;

            // Set up handlers for new connection
            newSocket.on('connect', () => {
              console.log("✅ Reconnected to multiplayer server!");
              setConnectionStatus('Connected');
            });
            newSocket.on('message', socket.listeners('message')[0]);
            newSocket.on('disconnect', socket.listeners('disconnect')[0]);
            newSocket.on('error', socket.listeners('error')[0]);
          }
        }, 2000);
      }
    });

    socket.on('error', (error) => {
      // console.error('❌ Socket.IO error:', error);
      setConnectionStatus('Connection Error');
      
      // Log more details about the error
    //   console.error('❌ Socket.IO error details:', {
    //     connected: socket.connected,
    //     url: socketUrl,
    //     error: error,
    //     timestamp: new Date().toISOString()
    //   }
    // );
      
      // Attempt to reconnect after a longer delay for errors
      if (gameStarted && socketRef.current === socket) {
        console.log("🔄 Socket.IO error detected, will attempt reconnect...");
        setTimeout(() => {
          if (gameStarted && socketRef.current === socket) {
            socket.disconnect(); // Force disconnect the broken connection
          }
        }, 1000);
      }
    });

    return () => {
      console.log("🧹 Cleaning up Socket.IO connection...");
      
      // Clear health check interval if it exists
      if ((socket as any).healthCheckInterval) {
        clearInterval((socket as any).healthCheckInterval);
        console.log("🧹 Cleared health check interval");
      }
      
      if (socket && socket.connected) {
        socket.disconnect();
      }
    };
  }, [gameStarted, roomId, constructSocketIOUrl, region, friendModeConfig.isEnabled]); // Include roomId and constructSocketIOUrl to reconnect when room changes

  // Send player data to server
  useEffect(() => {
    if (!gameStarted || !socketRef.current || !socketRef.current.connected) {
      console.log(`Not sending updates: gameStarted=${gameStarted}, socketRef=${!!socketRef.current}, connected=${socketRef.current?.connected}`);
      return;
    }

    console.log(`Starting position updates - snake has ${snake.visibleSegments.length} segments`);

    const sendInterval = setInterval(() => {
      // Stop sending updates immediately if game is over
      if (gameOverRef.current) {
        console.log(`🛑 Stopped sending updates: gameOver=${gameOverRef.current}`);
        return;
      }

      if (socketRef.current && socketRef.current.connected && snake.visibleSegments.length > 0) {
        // Only send update if position actually changed to reduce network traffic
        const currentHeadPos = snake.visibleSegments[0];
        const lastSentPos = lastSentPositionRef.current;
        const shouldSendUpdate = !lastSentPos ||
          Math.abs(currentHeadPos.x - lastSentPos.x) > 2 ||
          Math.abs(currentHeadPos.y - lastSentPos.y) > 2 ||
          snake.visibleSegments.length !== lastSentPos.segmentCount;

        if (shouldSendUpdate) {
          const updateData = {
            type: 'update',
            segments: snake.visibleSegments.slice(0, 100).map(seg => ({ x: seg.x, y: seg.y })), // Send up to 100 segments max
            color: '#7ED321', // Green earthworm color from image
            money: snake.money,
            totalMass: snake.totalMass,
            segmentRadius: snake.getSegmentRadius(),
            visibleSegmentCount: snake.visibleSegments.length
          };

          // Track last sent position
          lastSentPositionRef.current = {
            x: currentHeadPos.x,
            y: currentHeadPos.y,
            segmentCount: snake.visibleSegments.length
          };

          // Reduced logging for performance - only log every 60th update at 30 FPS
          if (Date.now() % 2000 < 33) {
            console.log(`Sending update with ${updateData.segments.length} segments to server (snake total visible: ${snake.visibleSegments.length}, mass: ${snake.totalMass.toFixed(1)}, trail: ${snake.segmentTrail.length})`);
          }
          socketRef.current.emit('playerUpdate', updateData);
        }
      } else {
        console.log(`Skipping update: socketConnected=${socketRef.current?.connected}, segments=${snake.visibleSegments.length}`);
      }
    }, 33); // Send updates every 33ms (30 FPS) for smooth but efficient multiplayer

    return () => {
      console.log('Clearing position update interval');
      clearInterval(sendInterval);
    };
  }, [gameStarted, socketRef.current?.connected, gameOver]);

  // Mouse tracking - use game canvas (top layer) for mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate direction from screen center to mouse (Slither.io style)
      const directionX = mouseX - canvasSize.width / 2;
      const directionY = mouseY - canvasSize.height / 2;

      // Normalize the direction vector
      const magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
      if (magnitude > 0) {
        setMouseDirection({
          x: directionX / magnitude,
          y: directionY / magnitude
        });
      }

      // Calculate world position of cursor for eye tracking
      // Convert screen coordinates to world coordinates
      const worldX = snake.head.x + (mouseX - canvasSize.width / 2) / zoom;
      const worldY = snake.head.y + (mouseY - canvasSize.height / 2) / zoom;
      
      setMouseWorldPosition({ x: worldX, y: worldY });
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
  }, [canvasSize, snake, zoom]);

  // Boost controls and cash-out
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent key repeat events
      if (e.repeat) return;

      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIsBoosting(true);
        snake.setBoost(true);

        // End ghost mode if player boosts
        if (isGhostMode) {
          setIsGhostMode(false);
          setGhostModeEndTime(null);
          console.log(`👻 Ghost mode ended early (player boosted)`);

          // Notify server
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('ghostModeEnd', {
              type: 'ghostModeEnd',
              reason: 'boost'
            });
          }
        }
      }

      // Handle Q key separately - should work regardless of other keys
      if (e.key.toLowerCase() === 'q' || e.code === 'KeyQ') {
        console.log('Q key pressed - starting cash out. Key details:', {
          key: e.key,
          code: e.code,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey
        });
        setQKeyPressed(true);
        qKeyPressedRef.current = true;
        if (!cashingOutRef.current) {
          // Start cash-out process only if Q is pressed
          const startTime = Date.now();
          setCashingOut(true);
          cashingOutRef.current = true;
          setCashOutStartTime(startTime);
          cashOutStartTimeRef.current = startTime;
          setCashOutProgress(0);
          console.log('Cash out started at:', startTime);
          console.log('Current refs - cashingOut:', cashingOutRef.current, 'qKeyPressed:', qKeyPressedRef.current);
        }
      }

      // Handle A key for auto-play toggle
      if (e.key.toLowerCase() === 'a' || e.code === 'KeyA') {
        setAutoPlay(prev => {
          const newAutoPlay = !prev;
          console.log(`🤖 Auto-play ${newAutoPlay ? 'ENABLED' : 'DISABLED'}`);
          if (newAutoPlay) {
            toast({
              title: "🤖 Auto-Play Enabled",
              description: "Snake will move automatically and switch servers every 30s",
            });
          } else {
            toast({
              title: "🤖 Auto-Play Disabled",
              description: "Manual control restored",
            });
          }
          return newAutoPlay;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIsBoosting(false);
        snake.setBoost(false);
      }

      // Handle Q key release separately
      if (e.key.toLowerCase() === 'q' || e.code === 'KeyQ') {
        console.log('Q key released - cancelling cash out');
        setQKeyPressed(false);
        qKeyPressedRef.current = false;
        // Cancel cash-out process when Q is released
        if (cashingOutRef.current) {
          console.log('Cash-out cancelled - Q key released');

          // Send cancellation message to other players
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('cashOutCancelled', {
              type: 'cashOutCancelled',
              playerId: myPlayerId
            });
          }
        }
        setCashingOut(false);
        cashingOutRef.current = false;
        setCashOutProgress(0);
        setCashOutStartTime(null);
        cashOutStartTimeRef.current = null;
      }
    };

    const handleMouseDown = () => {
      setIsBoosting(true);
      snake.setBoost(true);

      // End ghost mode if player boosts
      if (isGhostMode) {
        setIsGhostMode(false);
        setGhostModeEndTime(null);
        console.log(`👻 Ghost mode ended early (player boosted via mouse)`);

        // Notify server
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('ghostModeEnd', {
            type: 'ghostModeEnd',
            reason: 'boost'
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsBoosting(false);
      snake.setBoost(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [snake]);

  // Game loop
  useEffect(() => {
    if (!gameStarted) return; // Don't start game loop until loading is complete

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    // Apply snake catch-up movement when tab becomes visible again
    const applySnakeCatchUp = (deltaSeconds: number) => {
      if (gameOver) return;

      const speed = snake.isBoosting ? (snake.baseSpeed * snake.boostMultiplier) : snake.baseSpeed;
      const distance = speed * deltaSeconds;

      // Move snake forward based on time that passed while tab was hidden
      snake.head.x += Math.cos(snake.currentAngle) * distance;
      snake.head.y += Math.sin(snake.currentAngle) * distance;

      // Add trail points for the movement that happened while away
      const numTrailPoints = Math.floor(deltaSeconds * 60); // Approximate trail points
      for (let i = 0; i < numTrailPoints; i++) {
        const progress = i / numTrailPoints;
        const x = snake.head.x - Math.cos(snake.currentAngle) * distance * (1 - progress);
        const y = snake.head.y - Math.sin(snake.currentAngle) * distance * (1 - progress);
        snake.segmentTrail.unshift({ x, y });
      }

      // Update visible segments after catch-up movement
      snake.updateVisibleSegments();
    };

    // Track when tab becomes hidden/visible - instantly return to home when tab becomes inactive
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('⏸️ Tab became hidden, instantly returning to home page');

        // Instantly return to home page when tab becomes inactive
        setGameStarted(false);
        setGameOver(false);
        gameOverRef.current = false;

        // Hide snake immediately
        snakeVisibleRef.current = false;
        setSnakeVisible(false);

        // Clean up Socket.IO connection
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }

        // Navigate back to home page
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));

        // Clear snake data
        snake.visibleSegments = [];
        snake.segmentTrail = [];
        snake.totalMass = 0;
        snake.clearSnakeOnDeath();

        console.log('🏠 Returned to home page due to tab switch');
      }
      setGameIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const gameLoop = async () => {
      // Calculate delta time for smooth growth processing
      const currentTime = Date.now();
      const deltaTime = Math.min((currentTime - lastFrameTime) / 1000, 0.016); // Cap at 16ms (60fps minimum)
      setLastFrameTime(currentTime);

      /* 
       * CAMERA-FOLLOW RENDERING SYSTEM:
       * 1. Background Canvas: Static tiled background (never moves)
       * 2. Game Canvas: Clear and apply camera transform
       * 3. Game Canvas: Draw world objects relative to camera
       * 4. Game Canvas: Restore transform and draw UI
       * 
       * Camera System:
       * - Snake stays centered on screen (except at world boundaries)
       * - All world objects render relative to camera offset
       * - Background remains fixed in place
       */

      // Handle ghost mode expiration
      if (isGhostMode && ghostModeEndTime && currentTime >= ghostModeEndTime) {
        setIsGhostMode(false);
        setGhostModeEndTime(null);
        console.log(`👻 Ghost mode expired`);
      }

      // Process growth at 10 mass per second rate
      snake.processGrowth(deltaTime);
      
      // Auto-play server switching logic
      if (autoPlayRef.current) {
        const currentTime = Date.now();
        
        // Switch servers every 30 seconds when auto-play is enabled
        if (currentTime - autoServerSwitchTime > 30000) {
          const nextServerIndex = (currentServerIndex + 1) % servers.length;
          const nextServer = servers[nextServerIndex];
          
          console.log(`🤖 AUTO-PLAY: Switching to server ${nextServer.region}/${nextServer.room}`);
          
          // Update URL to switch server
          const newUrl = `/game/${nextServer.region}/${nextServer.room}`;
          window.history.pushState({}, '', newUrl);
          
          // Close current connection
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }
          
          // Reset game state for server switch
          setGameStarted(false);
          setConnectionStatus('Connecting...');
          
          // Update current server index immediately
          setCurrentServerIndex(nextServerIndex);
          setAutoServerSwitchTime(currentTime);
          
          // Force page reload to properly reconnect to new server
          setTimeout(() => {
            window.location.reload();
          }, 500);
          
          return; // Exit game loop to allow restart
        }
      }

      // Move snake - disable control when cashing out
      if (cashingOut) {
        // Snake moves in straight line when cashing out (no player control)
        snake.move(Math.cos(snake.currentAngle), Math.sin(snake.currentAngle));
      } else if (autoPlayRef.current) {
        // Auto-play mode - AI controls the snake
        const currentTime = Date.now();
        
        // Update auto-play target every 500ms or when close to current target
        const distanceToTarget = Math.sqrt(
          (autoPlayTarget.x - snake.head.x) ** 2 + (autoPlayTarget.y - snake.head.y) ** 2
        );
        
        if (currentTime - lastAutoPlayUpdate > 500 || distanceToTarget < 50) {
          // Find the nearest food to target
          let nearestFood = null;
          let nearestDistance = Infinity;
          
          for (const food of foods) {
            const distance = Math.sqrt(
              (food.x - snake.head.x) ** 2 + (food.y - snake.head.y) ** 2
            );
            if (distance < nearestDistance && distance < 200) { // Only target food within 200px
              nearestDistance = distance;
              nearestFood = food;
            }
          }
          
          if (nearestFood) {
            setAutoPlayTarget({ x: nearestFood.x, y: nearestFood.y });
          } else {
            // No nearby food, move towards map center or random direction
            const mapCenterX = getMapCenterX(arenaSize);
            const mapCenterY = getMapCenterY(arenaSize);
            const distanceFromCenter = Math.sqrt(
              (snake.head.x - mapCenterX) ** 2 + (snake.head.y - mapCenterY) ** 2
            );
            
            if (distanceFromCenter > getMapRadius(arenaSize) * 0.7) {
              // Move towards center if too far out
              setAutoPlayTarget({ x: mapCenterX, y: mapCenterY });
            } else {
              // Random movement
              const angle = Math.random() * Math.PI * 2;
              const distance = 100;
              setAutoPlayTarget({
                x: snake.head.x + Math.cos(angle) * distance,
                y: snake.head.y + Math.sin(angle) * distance
              });
            }
          }
          setLastAutoPlayUpdate(currentTime);
        }
        
        // Calculate direction to auto-play target
        const dx = autoPlayTarget.x - snake.head.x;
        const dy = autoPlayTarget.y - snake.head.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const autoDirection = { x: dx / distance, y: dy / distance };
          snake.move(autoDirection.x, autoDirection.y);
        } else {
          snake.move(mouseDirection.x, mouseDirection.y);
        }
      } else {
        // Normal mouse control
        const prevX = snake.head.x;
        const prevY = snake.head.y;
        snake.move(mouseDirection.x, mouseDirection.y);

        // Check if player moved and end ghost mode early
        if (isGhostMode && (Math.abs(snake.head.x - prevX) > 0.1 || Math.abs(snake.head.y - prevY) > 0.1)) {
          setIsGhostMode(false);
          setGhostModeEndTime(null);
          console.log(`👻 Ghost mode ended early (player moved)`);

          // Notify server
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('ghostModeEnd', {
              type: 'ghostModeEnd',
              reason: 'movement'
            });
          }
        }
      }

      // Update local bot AI every frame
      setBotSnakes(prevBots => {
        if (!prevBots || prevBots.length === 0) return prevBots;
        const botsSnapshot = prevBots.slice();
        return botsSnapshot.map((bot, idx) =>
          updateBotSnake(bot, snake, botsSnapshot.filter((_, i) => i !== idx))
        );
      });

      // Update cash-out progress - only if Q is still being held
      if (cashingOutRef.current && cashOutStartTimeRef.current && qKeyPressedRef.current) {
        const elapsed = currentTime - cashOutStartTimeRef.current;
        const progress = Math.min(elapsed / 3000, 1); // 3 seconds = 100%
        setCashOutProgress(progress);

        console.log(`Cash out progress: ${(progress * 100).toFixed(1)}% (${elapsed}ms elapsed)`);

        // Send cash-out progress to other players every frame for smooth updates
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('cashingOut', {
            type: 'cashingOut',
            progress: progress,
            playerId: myPlayerId
          });
        }

        // Complete cash-out after 3 seconds
        if (progress >= 1) {
          console.log('Cash out completed! Progress reached 100%');
          
          // Use new cash out logic
          await handleCashOut();

          // Send completion message to other players
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('cashOutComplete', {
              type: 'cashOutComplete',
              playerId: myPlayerId
            });
          }

          // Clean up game state
          setGameStarted(false);
          setGameOver(false);
          gameOverRef.current = false;

          // Hide snake
          snakeVisibleRef.current = false;
          setSnakeVisible(false);

          // Clean up Socket.IO connection
          if (socketRef.current) {
            console.log('Cleaning up Socket.IO connection after cash out...');
            socketRef.current.disconnect();
            socketRef.current = null;
          }

          // Reset cash-out state
          setCashingOut(false);
          cashingOutRef.current = false;
          setCashOutProgress(0);
          setCashOutStartTime(null);
          cashOutStartTimeRef.current = null;
          setQKeyPressed(false);
          qKeyPressedRef.current = false;

          // Store celebration data for home page
          localStorage.setItem('cashOutCelebration', JSON.stringify({ amount: snake.money }));

          // Navigate back to home page instantly
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));

          // Clear snake data immediately to prevent race condition
          snake.visibleSegments = [];
          snake.segmentTrail = [];
          snake.totalMass = 0;
          // snake.money = 1.05; // Keep accumulated money - only reset on new game start
          snake.clearSnakeOnDeath();

          console.log('🏠 Returned to home page after cash out');
        }
      } else if (cashingOutRef.current && !qKeyPressedRef.current) {
        // Q was released, cancel cash-out  
        console.log('Cash-out cancelled - Q key released during game loop');

        // Send cancellation message to other players
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('cashOutCancelled', {
            type: 'cashOutCancelled',
            playerId: myPlayerId
          });
        }

        setCashingOut(false);
        cashingOutRef.current = false;
        setCashOutProgress(0);
        setCashOutStartTime(null);
        cashOutStartTimeRef.current = null;
      } else if (cashingOutRef.current) {
        console.log(`Cash out blocked - cashingOut:${cashingOutRef.current}, cashOutStartTime:${cashOutStartTimeRef.current}, qKeyPressed:${qKeyPressedRef.current}`);
      }


      // Smooth interpolation for other players only
      setPlayerPositions(prevPositions => {
        const newPositions = new Map(prevPositions);
        const currentTime = Date.now();

        newPositions.forEach((posData, playerId) => {
          const timeSinceUpdate = currentTime - posData.lastUpdate;
          const interpolationTime = 33; // Match server update frequency (33ms)

          if (timeSinceUpdate < interpolationTime && posData.current.length === posData.target.length) {
            const progress = Math.min(1, timeSinceUpdate / interpolationTime);
            // Linear interpolation for immediate responsiveness
            const smoothProgress = progress;

            const interpolatedSegments = posData.current.map((currentSeg, index) => {
              const targetSeg = posData.target[index];
              if (!targetSeg) return currentSeg;

              // Check if movement distance is reasonable to prevent teleporting
              const distance = Math.sqrt(
                Math.pow(targetSeg.x - currentSeg.x, 2) +
                Math.pow(targetSeg.y - currentSeg.y, 2)
              );

              // If movement is too large (>100px), snap immediately
              if (distance > 100) {
                return targetSeg;
              }

              return {
                x: currentSeg.x + (targetSeg.x - currentSeg.x) * smoothProgress,
                y: currentSeg.y + (targetSeg.y - currentSeg.y) * smoothProgress
              };
            });

            newPositions.set(playerId, {
              ...posData,
              current: interpolatedSegments
            });
          } else if (timeSinceUpdate >= interpolationTime) {
            // Interpolation complete, snap to target
            newPositions.set(playerId, {
              ...posData,
              current: posData.target
            });
          }
        });

        return newPositions;
      });

      // Update food physics and check consumption
      const allSnakes = [
        { head: snake.head, totalMass: snake.totalMass },
        ...botSnakes.map(bot => ({ head: bot.head, totalMass: bot.totalMass })),
        ...serverBots.map(bot => ({ head: bot.head, totalMass: bot.totalMass || 10 })),
        ...serverPlayers.map(player => ({
          head: player.segments?.[0] || { x: 0, y: 0 },
          totalMass: player.totalMass || 10
        }))
      ].filter(s => s.head.x !== undefined && s.head.y !== undefined);

      // Update food gravitational physics every frame for better responsiveness
      setFoods(currentFoods => {

        // Focus only on player snake for attraction (ignore multiplayer snakes for now)
        const playerOnlySnakes = [{ head: snake.head, totalMass: snake.totalMass }];

        // Update opacity for boost food and remove expired ones
        const currentTime = Date.now();
        const nonExpiredFoods = currentFoods.filter(food => {
          if (food.expiresAt && currentTime > food.expiresAt) {
            console.log(`🕒 Boost food ${food.id} expired and removed`);
            return false;
          }
          return true;
        }).map(food => {
          // Calculate fading opacity for boost food
          if (food.expiresAt) {
            const timeRemaining = food.expiresAt - currentTime;
            const totalLifetime = 10000; // 10 seconds
            const opacity = Math.max(0.1, timeRemaining / totalLifetime); // Fade from 1.0 to 0.1
            return { ...food, opacity };
          }
          return food;
        });

        const updatedFoods = nonExpiredFoods.map(food =>
          updateFoodGravity(food, playerOnlySnakes)
        );

        // Check food consumption by player snake only
        const consumedFoodIds: string[] = [];
        for (const food of updatedFoods) {
          const distToSnake = Math.sqrt(
            (food.x - snake.head.x) ** 2 + (food.y - snake.head.y) ** 2
          );

          if (distToSnake < FOOD_CONSUMPTION_RADIUS) {
            // Handle different types of food
            if (food.isMoneyCrate && food.moneyValue) {
              // Snake eats money crate - add both money AND mass from dead snake
              snake.money += food.moneyValue;
              const massGain = 0.3; // Same mass gain as regular food particles
              snake.eatFood(massGain);
              console.log(`💰 Collected money crate worth $${food.moneyValue} + ${massGain} mass! Total money: $${snake.money.toFixed(2)}`);

              // Notify server about money crate collection for multiplayer sync
              if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('moneyCrateCollected', {
                  type: 'moneyCrateCollected',
                  crateId: food.id
                });
                console.log(`💰 Notified server about collecting money crate ${food.id}`);
              }
            } else {
              // Regular food, boost food, or super food - add mass
              snake.eatFood(food.mass);
              if (food.isSuperFood) {
                console.log(`🌟 Ate super food! Gained ${food.mass} mass!`);
              }
            }
            consumedFoodIds.push(food.id);
          }
        }

        // Remove consumed food and create new ones
        let filteredFoods = updatedFoods.filter(food => !consumedFoodIds.includes(food.id));

        // Spawn new food to maintain constant count
        const targetFoodCount = getFoodCount(arenaSize);
        const newFoodCount = targetFoodCount - filteredFoods.length;
        for (let i = 0; i < newFoodCount; i++) {
          filteredFoods.push(createFood(`food_${Date.now()}_${i}`, arenaSize));
        }

        return filteredFoods;
      });

      // Check circular map boundaries (death barrier) - using head position instead of eyes for less sensitive collision
      let hitBoundary = false;

      const eyeMapCenterX = getMapCenterX(arenaSize);
      const eyeMapCenterY = getMapCenterY(arenaSize);
      const eyeMapRadius = getMapRadius(arenaSize);

      // Use snake head position with more generous buffer for better control near boundaries
      const distanceFromCenter = Math.sqrt(
        (snake.head.x - eyeMapCenterX) ** 2 + (snake.head.y - eyeMapCenterY) ** 2
      );
      const collisionBuffer = snake.getSegmentRadius() * 1.5; // Reduced buffer for better control
      if (distanceFromCenter > eyeMapRadius - collisionBuffer) {
        hitBoundary = true;
      }

      if (hitBoundary) {
        console.log(`💀 HIT DEATH BARRIER - Instant return to home`);

        // Calculate time alive in seconds
        const timeAlive = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;

        // Player died - no money reward, only cash out gives money
        console.log(`💀 Player died - no money reward given. Only cash out gives money.`);

        // Store game over data for home page
        localStorage.setItem('gameOverData', JSON.stringify({
          finalMass: snake.totalMass,
          timeAlive: timeAlive
        }));

        // Drop money crates before clearing snake
        dropMoneyCrates(snake.money, snake.totalMass);

        // Hide snake first, then clear data
        snakeVisibleRef.current = false;
        setSnakeVisible(false);

        // Instantly return to home screen - no fade, no game over screen
        console.log(`🏠 Instantly returning to home screen after hitting barrier`);
        setGameStarted(false);
        setGameOver(false);
        gameOverRef.current = false;
        snakeFadingRef.current = false;
        setSnakeFading(false);

        // Navigate back to home page
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));

        // Clear snake data after state updates
        setTimeout(() => {
          snake.visibleSegments = [];
          snake.segmentTrail = [];
          snake.totalMass = 0;
          snake.clearSnakeOnDeath();
        }, 0);

        return;
      }

      // Check if player snake head touches any bot snake (player dies)
      for (let i = botSnakes.length - 1; i >= 0; i--) {
        const bot = botSnakes[i];
        
        // Calculate bot's current radius
        const botBaseRadius = 9; // Same as player SEGMENT_RADIUS
        const maxScale = 5;
        const MAX_SEGMENTS = 100;
        const currentSegments = Math.min(bot.visibleSegments.length, MAX_SEGMENTS);
        const botScaleFactor = Math.min(1 + (currentSegments - 10) / 100, maxScale);
        const botRadius = botBaseRadius * botScaleFactor;

        // Check if player head hits any bot segment (player dies)
        for (const segment of bot.visibleSegments) {
          const dist = Math.sqrt((snake.head.x - segment.x) ** 2 + (snake.head.y - segment.y) ** 2);
          const collisionRadius = snake.getSegmentRadius() + botRadius;
          if (dist < collisionRadius) {
            console.log(`💀 PLAYER DIED BY TOUCHING BOT SNAKE!`);

            // Calculate time alive in seconds
            const timeAlive = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;

            // Player died - no money reward, only cash out gives money
            console.log(`💀 Player died - no money reward given. Only cash out gives money.`);

            // Store game over data for home page
            localStorage.setItem('gameOverData', JSON.stringify({
              finalMass: snake.totalMass,
              timeAlive: timeAlive
            }));

            // Drop money crates before clearing snake
            dropMoneyCrates(snake.money, snake.totalMass);

            // Hide snake first, then clear data
            snakeVisibleRef.current = false;
            setSnakeVisible(false);

            // Instantly return to home screen - no fade, no game over screen
            console.log(`🏠 Instantly returning to home screen after touching bot`);
            setGameStarted(false);
            setGameOver(false);
            gameOverRef.current = false;
            snakeFadingRef.current = false;
            setSnakeFading(false);

            // Navigate back to home page
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));

            // Clear snake data after state updates
          setTimeout(() => {
              snake.visibleSegments = [];
              snake.segmentTrail = [];
              snake.totalMass = 0;
              snake.clearSnakeOnDeath();
            }, 0);

            return; // Exit the game loop
          }
        }
      }

      // Bot food eating disabled - server handles all game logic
      setBotSnakes(prevBots => {
        return prevBots.map(bot => {
          // Server now handles bot food eating and respawning
          return bot;
        });
      });

      // Food gravitation toward snake head (50px radius, 2x faster)
      // Food system removed

      // Food collision system removed

      // Server food system removed

      // Check for collisions with other players' snakes (skip if in ghost mode)
      if (!isGhostMode) {
        for (const otherPlayer of otherPlayers) {
          if (!otherPlayer.segments || otherPlayer.segments.length === 0) continue;
          // Skip collision with dead players (check if they have any meaningful segments)
          // Note: otherPlayer status is handled by segments check below
          // Skip players with very few segments (likely dead/disconnected)
          if (otherPlayer.segments.length < 2) continue;

          for (const segment of otherPlayer.segments) {
            const dist = Math.sqrt((snake.head.x - segment.x) ** 2 + (snake.head.y - segment.y) ** 2);
            const collisionRadius = snake.getSegmentRadius() + 8; // Reduced collision sensitivity

            if (dist < collisionRadius) {
              // Player died - crash into another snake! Drop money crates first
              console.log(`💀 CRASHED into player ${otherPlayer.id}! (segments: ${otherPlayer.segments.length}) - Instant return to home`);

              // Calculate time alive in seconds
              const timeAlive = gameStartTime ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;

              // Player died - no money reward, only cash out gives money
              console.log(`💀 Player died - no money reward given. Only cash out gives money.`);

              // Store game over data for home page
              localStorage.setItem('gameOverData', JSON.stringify({
                finalMass: snake.totalMass,
                timeAlive: timeAlive
              }));

              // Drop money crates BEFORE clearing
              const currentMoney = snake.money || 1.0;
              const currentMass = snake.totalMass || 6;
              console.log(`💰 Dropping money crates: $${currentMoney}, mass: ${currentMass}`);
              dropMoneyCrates(currentMoney, Math.max(currentMass, 1));

              // Hide snake first, then clear data
              snakeVisibleRef.current = false;
              setSnakeVisible(false);

              // Instantly return to home screen - no fade, no game over screen
              console.log(`🏠 Instantly returning to home screen after death`);
              setGameStarted(false);
              setGameOver(false);
              gameOverRef.current = false;
              snakeFadingRef.current = false;
              setSnakeFading(false);

              // Navigate back to home page
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));

              // Clear snake data immediately to prevent race condition
              snake.visibleSegments = [];
              snake.segmentTrail = [];
              snake.totalMass = 0;
              snake.clearSnakeOnDeath();

              return; // Stop the game loop
            }
          }
        }
      } // End ghost mode protection

      // Clean up dead players from serverPlayers array (remove after 5 seconds)
      const cleanupTime = Date.now();
      const alivePlayers = serverPlayers.filter(player => {
        if (!player || player.isDead || player.gameOver) return false;
        if (!player.segments || player.segments.length < 2) return false;
        // Remove players that haven't updated in 5 seconds
        if (player.lastUpdate && cleanupTime - player.lastUpdate > 5000) return false;
        return true;
      });
      
      // Update serverPlayers if any dead players were removed
      if (alivePlayers.length !== serverPlayers.length) {
        setServerPlayers(alivePlayers);
      }

      // Check for collisions with server players' snakes (skip if in ghost mode)
      if (!isGhostMode) {
        for (const serverPlayer of alivePlayers) {
          if (!serverPlayer.segments || serverPlayer.segments.length === 0) continue;
          if (serverPlayer.id === myPlayerId) continue; // Skip self
          // Skip collision with dead players
          if (serverPlayer.isDead || serverPlayer.gameOver) continue;
          // Skip players with very few segments (likely dead/disconnected) 
          if (serverPlayer.segments.length < 2) continue;

          for (const segment of serverPlayer.segments) {
            // Additional validation for segment data
            if (!segment || typeof segment.x !== 'number' || typeof segment.y !== 'number') continue;
            if (isNaN(segment.x) || isNaN(segment.y)) continue;
            
            const dist = Math.sqrt((snake.head.x - segment.x) ** 2 + (snake.head.y - segment.y) ** 2);
            const collisionRadius = snake.getSegmentRadius() + (serverPlayer.segmentRadius || 10);

            if (dist < collisionRadius) {
              // Player died - crash into another snake!
              console.log(`💀 CRASHED into server player ${serverPlayer.id}! (segments: ${serverPlayer.segments.length}) - Instant return to home`);

              // Drop money crates BEFORE clearing
              const currentMoney = snake.money || 1.0;
              const currentMass = snake.totalMass || 6;
              console.log(`💰 Dropping money crates: $${currentMoney}, mass: ${currentMass}`);
              dropMoneyCrates(currentMoney, Math.max(currentMass, 1));

              // Hide snake first, then clear data
              snakeVisibleRef.current = false;
              setSnakeVisible(false);

              // Instantly return to home screen - no fade, no game over screen
              console.log(`🏠 Instantly returning to home screen after death`);
              setGameStarted(false);
              setGameOver(false);
              gameOverRef.current = false;
              snakeFadingRef.current = false;
              setSnakeFading(false);

              // Navigate back to home page
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));

              // Clear snake data immediately to prevent race condition
              snake.visibleSegments = [];
              snake.segmentTrail = [];
              snake.totalMass = 0;
              snake.clearSnakeOnDeath();

              return; // Stop the game loop
            }
          }
        }
      } // End ghost mode protection for server players

      // Calculate target zoom based on snake segments (capped at 130 segments)
      const segmentCount = snake.visibleSegments.length;
      const maxSegmentZoom = 130;
      const cappedSegmentCount = Math.min(segmentCount, maxSegmentZoom);
      const zoomSteps = Math.floor(cappedSegmentCount / 5);
      const targetZoom = Math.max(minZoom, 2.0 - zoomSteps * 0.03);

      // Smoothly interpolate toward target zoom
      setZoom(prevZoom => prevZoom + (targetZoom - prevZoom) * zoomSmoothing);

      // STEP 1: CLEAR GAME CANVAS (background is on separate static layer)
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      
      // Background is handled by backgroundCanvasRef - completely static!

      // STEP 2: CAMERA-FOLLOW SYSTEM
      // Calculate camera position to keep snake centered (with world boundary limits)
      const mapRadius = getMapRadius(arenaSize);
      const mapCenterX = getMapCenterX(arenaSize);
      const mapCenterY = getMapCenterY(arenaSize);
      
      // Calculate desired camera position (snake's world position)
      let cameraX = snake.head.x;
      let cameraY = snake.head.y;
      
      // Apply world boundary constraints to camera
      // This prevents the camera from going outside the world boundaries
      const halfScreenWidth = (canvasSize.width / 2) / zoom;
      const halfScreenHeight = (canvasSize.height / 2) / zoom;
      
      const maxCameraX = mapCenterX + mapRadius - halfScreenWidth;
      const minCameraX = mapCenterX - mapRadius + halfScreenWidth;
      const maxCameraY = mapCenterY + mapRadius - halfScreenHeight;
      const minCameraY = mapCenterY - mapRadius + halfScreenHeight;
      
      cameraX = Math.max(minCameraX, Math.min(maxCameraX, cameraX));
      cameraY = Math.max(minCameraY, Math.min(maxCameraY, cameraY));
      
      // Debug: Log camera position (optional)
      // console.log(`Camera: (${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}) | Snake: (${snake.head.x.toFixed(1)}, ${snake.head.y.toFixed(1)})`);
      
      // Begin camera transform context
      ctx.save();
      
      // Apply camera transform: Center + Zoom + Offset
      ctx.translate(canvasSize.width / 2, canvasSize.height / 2);  // Center camera on screen
      ctx.scale(zoom, zoom);                                        // Apply zoom level
      ctx.translate(-cameraX, -cameraY);                           // Follow snake (with boundary limits)

      // STEP 3: DRAW WORLD OBJECTS (all relative to camera position)
      // Now all world coordinates are transformed to screen coordinates
      // Snake will appear centered on screen (unless at world boundaries)
      // All other objects (food, enemies, etc.) render relative to camera offset

      // Draw overlay only outside the play area (death barrier region)
      ctx.save();

      // Create a clipping path for the area outside the safe zone
      const renderMapRadius = getMapRadius(arenaSize);
      const renderMapCenterX = getMapCenterX(arenaSize);
      const renderMapCenterY = getMapCenterY(arenaSize);
      const mapSize = renderMapRadius * 2.5; // Define mapSize for rendering
      
      ctx.beginPath();
      ctx.rect(-mapSize, -mapSize, mapSize * 2, mapSize * 2); // Full map area
      ctx.arc(renderMapCenterX, renderMapCenterY, renderMapRadius, 0, Math.PI * 2, true); // Subtract safe zone (clockwise)
      ctx.clip();

      // Fill only the clipped area (outside the circle) with subtle red overlay
      ctx.fillStyle = 'rgba(80, 20, 20, 0.3)'; // More subtle red overlay
      ctx.fillRect(-mapSize, -mapSize, mapSize * 2, mapSize * 2);

      ctx.restore();

      // Draw subtle death barrier line
      ctx.strokeStyle = '#aa3333'; // Subtle red barrier
      ctx.lineWidth = 4; // Thinner line
      ctx.beginPath();
      ctx.arc(renderMapCenterX, renderMapCenterY, renderMapRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw food particles as solid circles with attraction indicators
      ctx.save();
      foods.forEach(food => {
        // Render all food everywhere on the map for full visibility

          // Draw food with glow effect and optional opacity for fading boost food
          ctx.save();

          // Apply opacity for boost food fading
          if (food.opacity !== undefined) {
            ctx.globalAlpha = food.opacity;
          }

          // Special rendering for money crates with gentle wobbling
          if (food.isMoneyCrate) {
            // Gentle wobbling motion - much slower than boost food
            const wobbleTime = Date.now() * 0.001 + food.wobbleOffset;
            const wobbleX = Math.sin(wobbleTime) * 1.5; // Small horizontal wobble
            const wobbleY = Math.cos(wobbleTime * 0.8) * 1; // Smaller vertical wobble

            const drawX = food.x + wobbleX;
            const drawY = food.y + wobbleY;

            // Draw the money crate image if loaded (simple 2D)
            if (moneyCrateImage) {
              const imageSize = food.radius * 2; // Simple 1:1 size ratio
              ctx.drawImage(
                moneyCrateImage,
                drawX - imageSize / 2,
                drawY - imageSize / 2,
                imageSize,
                imageSize
              );
            } else {
              // Fallback: Draw simple money crate (square) with dollar sign
              const visualRadius = food.radius;
              ctx.fillStyle = '#ffd700';
              ctx.fillRect(drawX - visualRadius, drawY - visualRadius, visualRadius * 2, visualRadius * 2);

              // Add dollar sign in the center
              ctx.fillStyle = '#000000';
              ctx.font = `${visualRadius}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('$', drawX, drawY);
            }
          }
          // Special rendering for super food - enhanced 2D with glow
          else if (food.isSuperFood) {
            // Enhanced glow effect for super food
            ctx.shadowColor = food.color;
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Draw main circle with gradient
            const gradient = ctx.createRadialGradient(
              food.x - food.radius * 0.3, food.y - food.radius * 0.3, 0,
              food.x, food.y, food.radius
            );
            gradient.addColorStop(0, food.color);
            gradient.addColorStop(0.7, food.color);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw inner highlight circle for 2D effect
            ctx.shadowBlur = 0;
            const highlightRadius = food.radius * 0.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(food.x - food.radius * 0.3, food.y - food.radius * 0.3, highlightRadius, 0, Math.PI * 2);
            ctx.fill();

            // Add outer ring for 2D effect
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius + 1, 0, Math.PI * 2);
            ctx.stroke();

            // Reset shadow
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          }
          // Special rendering for boost food - 2D with glow
          else if (food.isBoostFood || food.expiresAt) {
            // Add glow effect for boost food
            ctx.shadowColor = food.color;
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Draw main circle with gradient
            const gradient = ctx.createRadialGradient(
              food.x - food.radius * 0.2, food.y - food.radius * 0.2, 0,
              food.x, food.y, food.radius
            );
            gradient.addColorStop(0, food.color);
            gradient.addColorStop(0.8, food.color);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw inner highlight for 2D effect
            ctx.shadowBlur = 0;
            const highlightRadius = food.radius * 0.4;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(food.x - food.radius * 0.2, food.y - food.radius * 0.2, highlightRadius, 0, Math.PI * 2);
            ctx.fill();

            // Add subtle outer ring
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius + 0.5, 0, Math.PI * 2);
            ctx.stroke();

            // Reset shadow
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          } else {
            // Regular food rendering - 2D with glow effect
            ctx.shadowColor = food.color;
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Draw main circle with gradient
            const gradient = ctx.createRadialGradient(
              food.x - food.radius * 0.15, food.y - food.radius * 0.15, 0,
              food.x, food.y, food.radius
            );
            gradient.addColorStop(0, food.color);
            gradient.addColorStop(0.9, food.color);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw inner highlight for 2D effect
            ctx.shadowBlur = 0;
            const highlightRadius = food.radius * 0.3;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(food.x - food.radius * 0.15, food.y - food.radius * 0.15, highlightRadius, 0, Math.PI * 2);
            ctx.fill();

            // Add subtle outer ring for 2D effect
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(food.x, food.y, food.radius + 0.5, 0, Math.PI * 2);
            ctx.stroke();

            // Reset shadow
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
          }

          ctx.restore();
      });
      ctx.restore();

      // Draw server bots first (they're behind players)
      if (serverBots && serverBots.length > 0) {
        console.log(`🤖 Drawing ${serverBots.length} server bots`);
        serverBots.forEach((bot, botIndex) => {
          if (bot.segments && bot.segments.length > 0) {
            ctx.save();

            // Add subtle shadow for bots
            ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;

            // Draw segmented bot segments with clear individual segments
            for (let i = bot.segments.length - 1; i >= 0; i--) {
              const segment = bot.segments[i];
              // Use same segment sizing as player snake
              const baseRadius = 9; // Same as player SEGMENT_RADIUS
              const maxScale = 5;
              const MAX_SEGMENTS = 100;
              const currentSegments = Math.min(bot.segments.length, MAX_SEGMENTS);
              const scaleFactor = Math.min(1 + (currentSegments - 10) / 100, maxScale);
              const segmentRadius = baseRadius * scaleFactor;

              const baseColor = bot.color || '#6b7280'; // Gray color for bots

              // Create radial gradient for server bot snakes with segmented appearance
              const gradient = ctx.createRadialGradient(
                segment.x, segment.y, 0,
                segment.x, segment.y, segmentRadius
              );

              // Parse base color for gradient
              const r = parseInt(baseColor.slice(1, 3), 16);
              const g = parseInt(baseColor.slice(3, 5), 16);
              const b = parseInt(baseColor.slice(5, 7), 16);

              // Create gradient stops for segmented appearance
              const lightColor = `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`;
              const mediumColor = baseColor;
              const darkColor = `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`;

              gradient.addColorStop(0, lightColor);
              gradient.addColorStop(0.4, mediumColor);
              gradient.addColorStop(1, darkColor);

              ctx.fillStyle = gradient;

              // Add border for segment definition
              ctx.strokeStyle = darkColor;
              ctx.lineWidth = 2; // Thicker border for clear ridges

              ctx.beginPath();
              ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke(); // Add border for clear segments
            }

            // Draw bot eyes if it has segments
            if (bot.segments.length > 0) {
              const head = bot.segments[0];

              // Calculate movement angle for eye direction
              let movementAngle = 0;
              if (bot.segments.length > 1) {
                const dx = head.x - bot.segments[1].x;
                const dy = head.y - bot.segments[1].y;
                movementAngle = Math.atan2(dy, dx);
              }

              const eyeDistance = 5; // Same as player
              const eyeSize = 5; // Same as player
              const pupilSize = 2.5; // Same as player

              // Eye positions
              const eye1X = head.x + Math.cos(movementAngle + Math.PI / 2) * eyeDistance;
              const eye1Y = head.y + Math.sin(movementAngle + Math.PI / 2) * eyeDistance;
              const eye2X = head.x + Math.cos(movementAngle - Math.PI / 2) * eyeDistance;
              const eye2Y = head.y + Math.sin(movementAngle - Math.PI / 2) * eyeDistance;

              // Draw eyes
              ctx.fillStyle = 'white';
              ctx.beginPath();
              ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
              ctx.fill();

              // Draw pupils tracking cursor position with fast interaction
              ctx.fillStyle = 'black';
              
              // Calculate angle from each eye to cursor position for independent eye movement
              const eye1ToCursorX = mouseWorldPosition.x - eye1X;
              const eye1ToCursorY = mouseWorldPosition.y - eye1Y;
              const eye1ToCursorAngle = Math.atan2(eye1ToCursorY, eye1ToCursorX);
              
              const eye2ToCursorX = mouseWorldPosition.x - eye2X;
              const eye2ToCursorY = mouseWorldPosition.y - eye2Y;
              const eye2ToCursorAngle = Math.atan2(eye2ToCursorY, eye2ToCursorX);
              
              // Draw pupils with faster, more responsive movement
              ctx.beginPath();
              ctx.arc(eye1X + Math.cos(eye1ToCursorAngle) * 1.5, eye1Y + Math.sin(eye1ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eye2X + Math.cos(eye2ToCursorAngle) * 1.5, eye2Y + Math.sin(eye2ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }
        });
      }

      // Draw local bot snakes (behind players, above background) - COMMENTED OUT FOR LATER REUSE
      if (botSnakes && botSnakes.length > 0) {
        botSnakes.forEach(localBot => {
          if (localBot.visibleSegments && localBot.visibleSegments.length > 0) {
            ctx.save();
            // Subtle shadow
            ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;

            // Draw segmented body with clear individual segments
            for (let i = localBot.visibleSegments.length - 1; i >= 0; i--) {
              const segment = localBot.visibleSegments[i];
              // Use same segment sizing as player snake
              const baseRadius = 9; // Same as player SEGMENT_RADIUS
              const maxScale = 5;
              const MAX_SEGMENTS = 100;
              const currentSegments = Math.min(localBot.visibleSegments.length, MAX_SEGMENTS);
              const scaleFactor = Math.min(1 + (currentSegments - 10) / 100, maxScale);
              const segmentRadius = baseRadius * scaleFactor;

              // Create radial gradient for bot snakes with segmented appearance
              const baseColor = localBot.color || '#6b7280';
              const gradient = ctx.createRadialGradient(
                segment.x, segment.y, 0,
                segment.x, segment.y, segmentRadius
              );

              // Parse base color for gradient
              const r = parseInt(baseColor.slice(1, 3), 16);
              const g = parseInt(baseColor.slice(3, 5), 16);
              const b = parseInt(baseColor.slice(5, 7), 16);

              // Create gradient stops for segmented appearance
              const lightColor = `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`;
              const mediumColor = baseColor;
              const darkColor = `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`;

              gradient.addColorStop(0, lightColor);
              gradient.addColorStop(0.4, mediumColor);
              gradient.addColorStop(1, darkColor);

              ctx.fillStyle = gradient;

              // Add border for segment definition
              ctx.strokeStyle = darkColor;
              ctx.lineWidth = 2; // Thicker border for clear ridges

              ctx.beginPath();
              ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke(); // Add border for clear segments
            }

            // Draw eyes on head
            const head = localBot.visibleSegments[0];
            if (head) {
              // Approximate movement angle using first trail segment when available
              let movementAngle = localBot.currentAngle;
              if (localBot.visibleSegments.length > 1) {
                const nextSeg = localBot.visibleSegments[1];
                const dx = head.x - nextSeg.x;
                const dy = head.y - nextSeg.y;
                movementAngle = Math.atan2(dy, dx);
              }

              const eyeDistance = 5; // Same as player
              const eyeSize = 5; // Same as player
              const pupilSize = 2.5; // Same as player

              const eye1X = head.x + Math.cos(movementAngle + Math.PI / 2) * eyeDistance;
              const eye1Y = head.y + Math.sin(movementAngle + Math.PI / 2) * eyeDistance;
              const eye2X = head.x + Math.cos(movementAngle - Math.PI / 2) * eyeDistance;
              const eye2Y = head.y + Math.sin(movementAngle - Math.PI / 2) * eyeDistance;

              ctx.fillStyle = 'white';
              ctx.beginPath();
              ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
              ctx.fill();

              // Draw pupils tracking cursor position with fast interaction
              ctx.fillStyle = 'black';
              
              // Calculate angle from each eye to cursor position for independent eye movement
              const eye1ToCursorX = mouseWorldPosition.x - eye1X;
              const eye1ToCursorY = mouseWorldPosition.y - eye1Y;
              const eye1ToCursorAngle = Math.atan2(eye1ToCursorY, eye1ToCursorX);
              
              const eye2ToCursorX = mouseWorldPosition.x - eye2X;
              const eye2ToCursorY = mouseWorldPosition.y - eye2Y;
              const eye2ToCursorAngle = Math.atan2(eye2ToCursorY, eye2ToCursorX);
              
              // Draw pupils with faster, more responsive movement
              ctx.beginPath();
              ctx.arc(eye1X + Math.cos(eye1ToCursorAngle) * 1.5, eye1Y + Math.sin(eye1ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eye2X + Math.cos(eye2ToCursorAngle) * 1.5, eye2Y + Math.sin(eye2ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }
        });
      }

      // Draw only OTHER server players (exclude yourself) - limit rendering for performance
      const otherServerPlayers = serverPlayers.filter(player => player.id !== myPlayerId);
      otherServerPlayers.forEach((serverPlayer, playerIndex) => {
        if (serverPlayer.segments && serverPlayer.segments.length > 0) {
          // Use interpolated positions for smooth movement
          const playerPos = playerPositions.get(serverPlayer.id);
          const fullSnakeBody = playerPos?.current || serverPlayer.segments;
          const spacedSegments = fullSnakeBody;

          // Draw snake body with EXACT same styling as local snake
          ctx.save();

          // Check if this player is cashing out
          const cashingOutPlayer = otherPlayers.find(p => p.id === serverPlayer.id);
          const isCashingOut = cashingOutPlayer?.cashingOut;
          const cashOutProgress = cashingOutPlayer?.cashOutProgress || 0;

          // Add cash-out glow effect
          if (isCashingOut) {
            const glowIntensity = 0.3 + (cashOutProgress * 0.7);
            const pulseIntensity = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 15 * glowIntensity * pulseIntensity;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            } else {
              // No shadows for clean pink earthworm appearance
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
            }

          // Use spaced segments for natural appearance
          const segmentsToRender = spacedSegments.length;

        // Draw segmented snake with player-specific colors
        for (let i = segmentsToRender - 1; i >= 0; i--) {
          const segment = fullSnakeBody[i];
          const segmentRadius = snake.getSegmentRadius();

          ctx.save();
          
          // Use player's assigned color or default to green
          const playerColor = serverPlayer.color || '#7ED321';
          let segmentColor, borderColor;
          
          // For friend mode, use solid colors. For normal mode, use pattern
          if (friendModeConfig.isEnabled) {
            // Friend mode: solid color for each friend
            segmentColor = playerColor;
            borderColor = getDarkerColor(playerColor);
          } else {
            // Normal mode: alternating pattern
            const patternIndex = i % 5; // 5-segment pattern
            if (patternIndex === 0 || patternIndex === 1 || patternIndex === 3 || patternIndex === 4) {
              segmentColor = '#7ED321';
              borderColor = '#4B934B';
            } else {
              segmentColor = '#55B05A';
              borderColor = '#4B934B';
            }
          }
          
          // Soft glow effect
          ctx.shadowColor = '#90EE90'; // Soft light green glow
          ctx.shadowBlur = 4; // Gentle glow intensity
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // Create gradient for the segment
          const gradient = ctx.createRadialGradient(
            segment.x, segment.y, 0,
            segment.x, segment.y, segmentRadius
          );
          
          // Lighten the base color for gradient
          const baseR = parseInt(segmentColor.slice(1, 3), 16);
          const baseG = parseInt(segmentColor.slice(3, 5), 16);
          const baseB = parseInt(segmentColor.slice(5, 7), 16);
          
          const lightColor = `rgb(${Math.min(255, baseR + 40)}, ${Math.min(255, baseG + 40)}, ${Math.min(255, baseB + 40)})`;
          const mediumColor = segmentColor;
          const darkColor = `rgb(${Math.max(0, baseR - 20)}, ${Math.max(0, baseG - 20)}, ${Math.max(0, baseB - 20)})`;
          
          gradient.addColorStop(0, lightColor);
          gradient.addColorStop(0.5, mediumColor);
          gradient.addColorStop(1, darkColor);
          
          ctx.fillStyle = gradient;

          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
          
          // Add border with the specified color
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.5; // Slightly thicker for better visibility
          ctx.stroke();
        }


          // Reduced logging for performance
          if (currentTime % 60 === 0) {
            console.log(`Rendered snake ${serverPlayer.id} with ${segmentsToRender}/${fullSnakeBody.length} exact server segments`);
          }

          ctx.restore();

          // Draw rotated square eyes exactly like local snake
          if (spacedSegments.length > 0) {
            const head = spacedSegments[0];

            // Calculate movement direction from first two segments
            let movementAngle = 0;
            if (spacedSegments.length > 1) {
              const dx = head.x - spacedSegments[1].x;
              const dy = head.y - spacedSegments[1].y;
              movementAngle = Math.atan2(dy, dx);
            }

            // Cap eye scaling at 100 segments for multiplayer snakes with balanced proportions
            const MAX_SEGMENTS = 100;
            const currentSegments = Math.min(fullSnakeBody.length, MAX_SEGMENTS);
            const segmentProgress = currentSegments / MAX_SEGMENTS;
            const maxEyeScale = 2.2; // Balanced scaling for visibility
            const baseEyeScale = 1 + (segmentProgress * (maxEyeScale - 1));

            const baseRadius = 10;
            const cappedRadius = baseRadius * baseEyeScale;
            const eyeDistance = cappedRadius * 0.40; // Balanced distance from center
            const eyeSize = cappedRadius * 0.28; // Balanced size relative to head
            const pupilSize = cappedRadius * 0.13; // Balanced pupil size

            // Eye positions perpendicular to movement direction
            const eye1X = head.x + Math.cos(movementAngle + Math.PI / 2) * eyeDistance;
            const eye1Y = head.y + Math.sin(movementAngle + Math.PI / 2) * eyeDistance;
            const eye2X = head.x + Math.cos(movementAngle - Math.PI / 2) * eyeDistance;
            const eye2Y = head.y + Math.sin(movementAngle - Math.PI / 2) * eyeDistance;

            // Draw first eye with rotation
            ctx.save();
            ctx.translate(eye1X, eye1Y);
            ctx.rotate(movementAngle);
            ctx.fillStyle = 'white';
            ctx.fillRect(-eyeSize, -eyeSize, eyeSize * 2, eyeSize * 2);

            // Draw first pupil looking forward
            const pupilOffset = eyeSize * 0.4; // Scale pupil offset with eye size
            ctx.fillStyle = 'black';
            ctx.fillRect(
              pupilOffset - pupilSize,
              0 - pupilSize,
              pupilSize * 2,
              pupilSize * 2
            );
            ctx.restore();

            // Draw second eye with rotation
            ctx.save();
            ctx.translate(eye2X, eye2Y);
            ctx.rotate(movementAngle);
            ctx.fillStyle = 'white';
            ctx.fillRect(-eyeSize, -eyeSize, eyeSize * 2, eyeSize * 2);

            // Draw second pupil looking forward
            ctx.fillStyle = 'black';
            ctx.fillRect(
              pupilOffset - pupilSize,
              0 - pupilSize,
              pupilSize * 2,
              pupilSize * 2
            );
            ctx.restore();
          }

          // Draw player money above head with proper scaling and font
          if (fullSnakeBody.length > 0) {
            const head = fullSnakeBody[0];
            const segmentRadius = serverPlayer.segmentRadius || 10;

            // Calculate scale factor based on segment radius, capped at 4 mass equivalent
            const baseRadius = 10;
            const maxRadius = 10.2; // Equivalent to ~4 mass
            const cappedRadius = Math.min(segmentRadius, maxRadius);
            const scaleFactor = Math.max(0.8, cappedRadius / baseRadius);

            ctx.save();
            ctx.font = `${Math.floor(10 * scaleFactor)}px 'Press Start 2P', monospace`;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 3 * scaleFactor;
            ctx.textAlign = "center";

            // Money text removed - no longer displaying above server players
            ctx.restore();

            // Cash-out progress indicator above head
            if (isCashingOut && cashOutProgress > 0) {
              const barWidth = 50;
              const barHeight = 8;
              const barX = head.x - barWidth / 2;
              const barY = head.y - cappedRadius - 30;

              // Background bar
              ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
              ctx.fillRect(barX, barY, barWidth, barHeight);

              // Progress bar
              ctx.fillStyle = '#ffd700';
              ctx.fillRect(barX, barY, barWidth * cashOutProgress, barHeight);

              // Border
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2; // Thicker border for clear ridges
              ctx.strokeRect(barX, barY, barWidth, barHeight);

              // "CASHING OUT" text
              ctx.fillStyle = '#ffd700';
              ctx.font = 'bold 12px Arial';
              ctx.textAlign = 'center';
              ctx.fillText('CASHING OUT', head.x, barY - 8);
            }
          }
        }
      });

      // No fade animation - removed completely

      // Draw your own snake locally using EXACT same rendering as remote players
      // Render if game is active AND visible AND has segments AND not game over
      const shouldRender = gameStarted && snakeVisibleRef.current && snake.visibleSegments.length > 0 && !gameOverRef.current;

      if (shouldRender) {
        console.log(`✅ RENDERING SNAKE`);

        // Save current context
        ctx.save();
        const fullSnakeBody = snake.visibleSegments;

        // Draw snake body with EXACT same styling as remote players
        ctx.save();

        // Add drop shadow when not boosting (like remote snakes)
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Cap rendering at exactly 100 segments to match game limits
        const maxRenderSegments = 100; // Hard cap at 100 segments max
        const segmentsToRender = Math.min(fullSnakeBody.length, maxRenderSegments);

        // Draw segmented snake with alternating color pattern
        for (let i = segmentsToRender - 1; i >= 0; i--) {
          const segment = fullSnakeBody[i];
          const segmentRadius = snake.getSegmentRadius();

          // Determine segment color based on position (pattern: green, green, #55B05A, green, green, #55B05A, ...)
          const patternIndex = i % 5; // 5-segment pattern
          let segmentColor, borderColor;
          
          if (patternIndex === 0 || patternIndex === 1 || patternIndex === 3 || patternIndex === 4) {
            // Green segments (first two, then every 5th and 6th)
            segmentColor = '#7ED321';
            borderColor = '#4B934B';
          } else {
            // #55B05A segment (every 3rd in the pattern)
            segmentColor = '#55B05A';
            borderColor = '#4B934B';
          }

          // Create gradient for the segment
          const gradient = ctx.createRadialGradient(
            segment.x, segment.y, 0,
            segment.x, segment.y, segmentRadius
          );
          
          // Lighten the base color for gradient
          const baseR = parseInt(segmentColor.slice(1, 3), 16);
          const baseG = parseInt(segmentColor.slice(3, 5), 16);
          const baseB = parseInt(segmentColor.slice(5, 7), 16);
          
          const lightColor = `rgb(${Math.min(255, baseR + 40)}, ${Math.min(255, baseG + 40)}, ${Math.min(255, baseB + 40)})`;
          const mediumColor = segmentColor;
          const darkColor = `rgb(${Math.max(0, baseR - 20)}, ${Math.max(0, baseG - 20)}, ${Math.max(0, baseB - 20)})`;
          
          gradient.addColorStop(0, lightColor);
          gradient.addColorStop(0.5, mediumColor);
          gradient.addColorStop(1, darkColor);

          ctx.fillStyle = gradient;

          // Draw smooth circular segment
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
          ctx.fill();

          // Add border with the specified color
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.5; // Slightly thicker for better visibility
          ctx.stroke();

          // Draw eyes only on the head segment
          if (i === 0) {
            const eyeOffsetX = segmentRadius * 0.35;
            const eyeOffsetY = segmentRadius * -0.25;
            const eyeRadius = segmentRadius * 0.18;

            // Left eye
            ctx.beginPath();
            ctx.arc(segment.x - eyeOffsetX, segment.y + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(segment.x - eyeOffsetX, segment.y + eyeOffsetY, eyeRadius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();

            // Right eye
            ctx.beginPath();
            ctx.arc(segment.x + eyeOffsetX, segment.y + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(segment.x + eyeOffsetX, segment.y + eyeOffsetY, eyeRadius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();
          }
        }


        ctx.restore();

        // Draw rotated square eyes exactly like remote snakes
        if (fullSnakeBody.length > 0) {
          const head = fullSnakeBody[0];

          // Calculate movement direction from first two segments
          let movementAngle = 0;
          if (fullSnakeBody.length > 1) {
            const dx = head.x - fullSnakeBody[1].x;
            const dy = head.y - fullSnakeBody[1].y;
            movementAngle = Math.atan2(dy, dx);
          }

          // Scale eyes with snake size (exact same as remote snakes)
          const segmentRadius = snake.getSegmentRadius();
          const eyeDistance = segmentRadius * 0.5; // Scale eye distance with snake size
          const eyeSize = segmentRadius * 0.3; // Scale eye size with snake size
          const pupilSize = segmentRadius * 0.15; // Scale pupil with snake size

          // Eye positions perpendicular to movement direction
          const eye1X = head.x + Math.cos(movementAngle + Math.PI / 2) * eyeDistance;
          const eye1Y = head.y + Math.sin(movementAngle + Math.PI / 2) * eyeDistance;
          const eye2X = head.x + Math.cos(movementAngle - Math.PI / 2) * eyeDistance;
          const eye2Y = head.y + Math.sin(movementAngle - Math.PI / 2) * eyeDistance;

          // Draw first eye like the reference image (white circle with black pupil)
          ctx.fillStyle = 'white';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw first pupil (larger and more prominent)
          ctx.fillStyle = 'black';
          ctx.beginPath();
          ctx.arc(
            eye1X + Math.cos(movementAngle) * eyeSize * 0.2,
            eye1Y + Math.sin(movementAngle) * eyeSize * 0.2,
            pupilSize * 1.2,
            0, Math.PI * 2
          );
          ctx.fill();

          // Draw second eye like the reference image (white circle with black pupil)
          ctx.fillStyle = 'white';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw second pupil (larger and more prominent)
          ctx.fillStyle = 'black';
          ctx.beginPath();
          ctx.arc(
            eye2X + Math.cos(movementAngle) * eyeSize * 0.2,
            eye2Y + Math.sin(movementAngle) * eyeSize * 0.2,
            pupilSize * 1.2,
            0, Math.PI * 2
          );
          ctx.fill();
        }

        // Restore opacity
        ctx.restore();
      } else {
        console.log(`🚫 SNAKE HIDDEN - NOT RENDERING (gameStarted=${gameStarted}, visible=${snakeVisibleRef.current}, segments=${snake.visibleSegments.length})`);
      }

      // REMOVED: Legacy other players rendering to prevent duplicate snake bodies

      // No bots in multiplayer - removed all bot rendering

      // REMOVED: Bot snake rendering to prevent duplicate snake bodies in multiplayer

      ctx.globalAlpha = 1.0;

      // Only render snake if game is not over AND snake has segments (use ref for immediate response)
      if (!gameOverRef.current && snake.visibleSegments.length > 0) {
        // Draw single glowing outline behind the whole snake when boosting
        if (snake.isBoosting && snake.visibleSegments.length > 0) {
          ctx.save();
          ctx.beginPath();

          const segmentRadius = snake.getSegmentRadius();

          // Cap glow scaling at 100 segments
          const MAX_SEGMENTS = 100;
          const currentSegments = Math.min(snake.visibleSegments.length, MAX_SEGMENTS);
          const segmentProgress = currentSegments / MAX_SEGMENTS;
          const maxGlowScale = 2.2; // Same cap as eyes
          const glowScaleFactor = 1 + (segmentProgress * (maxGlowScale - 1));

          // Create a composite path for all segments
          for (let i = 0; i < snake.visibleSegments.length; i++) {
            const segment = snake.visibleSegments[i];
            ctx.moveTo(segment.x + segmentRadius, segment.y);
            ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
          }

          // Apply single glow effect to the entire snake outline with capped scaling
          ctx.shadowColor = "white";
          ctx.shadowBlur = 15;
          ctx.strokeStyle = "white";
          ctx.lineWidth = 3 * glowScaleFactor;
          ctx.stroke();
          ctx.restore();
        }



        // Draw snake segments with no shadow effects
        ctx.save();

        // Remove all shadow effects for clean pink earthworm appearance
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        for (let i = snake.visibleSegments.length - 1; i >= 0; i--) {
          const segment = snake.visibleSegments[i];
          const segmentRadius = snake.getSegmentRadius();

          // Apply ghost mode transparency and pulsing effect
          if (isGhostMode) {
            const pulsePhase = Math.sin(Date.now() * 0.008) * 0.2 + 0.8; // Pulse between 0.6 and 1.0
            ctx.globalAlpha = segment.opacity * 0.4 * pulsePhase; // Make semi-transparent and pulsing

            // Add ghostly blue tint with outline
            ctx.fillStyle = "#4a90e2"; // Light blue ghost color
            ctx.strokeStyle = "#2c5aa0"; // Darker blue outline
            ctx.lineWidth = 2;
          } else {
            ctx.globalAlpha = segment.opacity;

            // All segments are light green with soft glow effect matching the image
            ctx.save();
            ctx.shadowColor = '#90EE90'; // Soft light green glow
            ctx.shadowBlur = 4; // Gentle glow intensity
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Create smooth light green gradient matching the image
            const gradient = ctx.createRadialGradient(
              segment.x, segment.y, 0,
              segment.x, segment.y, segmentRadius
            );
            gradient.addColorStop(0, '#B8F5B1'); // Very light green center (brightest)
            gradient.addColorStop(0.2, '#A8E6A3'); // Light green
            gradient.addColorStop(0.5, '#98D982'); // Medium light green
            gradient.addColorStop(0.8, '#8BCB72'); // Slightly darker light green
            gradient.addColorStop(1, '#7ED321'); // Main light green edges
            
            ctx.fillStyle = gradient;
          }

          // Draw segmented circular segment
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segmentRadius, 0, Math.PI * 2);
          ctx.fill();
          
          // Restore context after glow effect
          if (!isGhostMode) {
            ctx.restore();
          }

          // Add very subtle segment joining lines like the image
          if (!isGhostMode) {
            // All segments use light green joining lines
            ctx.strokeStyle = '#A8E6A3'; // Light green that blends with the gradient
            ctx.lineWidth = 0.3; // Very thin line for subtle effect
            ctx.stroke(); // Add subtle segment joining line
          } else {
            ctx.stroke(); // Keep ghost mode outline
          }
        }

        ctx.restore();

        // Reset global alpha
        ctx.globalAlpha = 1.0;

        // Draw cash-out progress bar above snake head (without money text)
        if (snake.visibleSegments.length > 0 && cashingOut) {
          const snakeHead = snake.visibleSegments[0];

          // Cap the scaling at 4 mass equivalent
          const baseMass = 6; // Starting mass
          const maxMass = 10; // Cap at 4 mass (starting at 6, so 6+4=10)
          const cappedMass = Math.min(snake.visibleSegments.length, maxMass);
          const scaleFactor = Math.max(0.8, cappedMass / baseMass);

          const barWidth = 40 * scaleFactor; // Smaller width
          const barHeight = 3 * scaleFactor; // Smaller height
          const barX = snakeHead.x - barWidth / 2;
          const barY = snakeHead.y - 20 * scaleFactor; // Position above snake head

          // Background bar
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(barX, barY, barWidth, barHeight);

          // Progress bar
          ctx.fillStyle = '#53d493'; // Green progress
          ctx.fillRect(barX, barY, barWidth * cashOutProgress, barHeight);

          // Border
          ctx.strokeStyle = '#134242';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }

        // Draw bigger eyes like earthworm in image
        if (snake.visibleSegments.length > 0) {
          const snakeHead = snake.visibleSegments[0];
          const movementAngle = snake.currentAngle;
          
          // Bigger eyes for better visibility
          const eyeDistance = 5; // Reduced distance  
          const eyeSize = 5; // Bigger eyes (increased from 4 to 5)
          const pupilSize = 2.5; // Bigger pupils (increased from 2 to 2.5)

          // Eye positions perpendicular to movement direction
          const eye1X = snakeHead.x + Math.cos(movementAngle + Math.PI / 2) * eyeDistance;
          const eye1Y = snakeHead.y + Math.sin(movementAngle + Math.PI / 2) * eyeDistance;
          const eye2X = snakeHead.x + Math.cos(movementAngle - Math.PI / 2) * eyeDistance;
          const eye2Y = snakeHead.y + Math.sin(movementAngle - Math.PI / 2) * eyeDistance;

          // Draw bigger white eyes
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
          ctx.fill();

          // Draw bigger black pupils tracking cursor position with fast interaction
          ctx.fillStyle = 'black';
          
          // Calculate angle from each eye to cursor position for independent eye movement
          const eye1ToCursorX = mouseWorldPosition.x - eye1X;
          const eye1ToCursorY = mouseWorldPosition.y - eye1Y;
          const eye1ToCursorAngle = Math.atan2(eye1ToCursorY, eye1ToCursorX);
          
          const eye2ToCursorX = mouseWorldPosition.x - eye2X;
          const eye2ToCursorY = mouseWorldPosition.y - eye2Y;
          const eye2ToCursorAngle = Math.atan2(eye2ToCursorY, eye2ToCursorX);
          
          // Draw pupils with faster, more responsive movement (increased multiplier)
          ctx.beginPath();
          ctx.arc(eye1X + Math.cos(eye1ToCursorAngle) * 1.5, eye1Y + Math.sin(eye1ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(eye2X + Math.cos(eye2ToCursorAngle) * 1.5, eye2Y + Math.sin(eye2ToCursorAngle) * 1.5, pupilSize, 0, Math.PI * 2);
          ctx.fill();

          // Draw balance box above snake head with retro pixelated style
          const balanceText = `$${snake.money.toFixed(2)}`;
          
          // Scale the box based on snake size
          const baseMass = 6; // Starting mass
          const maxMass = 10; // Cap at 10 mass
          const cappedMass = Math.min(snake.visibleSegments.length, maxMass);
          const scaleFactor = Math.max(0.8, cappedMass / baseMass);
          
          // Calculate text width for dynamic box width
          ctx.font = `bold ${6 * scaleFactor}px Arial`;
          const textWidth = ctx.measureText(balanceText).width;
          const boxPadding = 2 * scaleFactor;
          const boxWidth = textWidth + boxPadding * 2;
          const boxHeight = 8 * scaleFactor;
          const boxX = snakeHead.x - boxWidth / 2;
          const boxY = snakeHead.y - 20 * scaleFactor; // Position above snake head
          
          // Draw box background with dark semi-transparent background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
          
          // Draw box border with yellow color to match the image
          ctx.strokeStyle = '#FFD700'; // Yellow border like in the image
          ctx.lineWidth = 0.5 * scaleFactor;
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
          
          // Draw inner highlight for 2D effect
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)'; // Lighter yellow inner border
          ctx.lineWidth = 0.25 * scaleFactor;
          ctx.strokeRect(boxX + 0.25, boxY + 0.25, boxWidth - 0.5, boxHeight - 0.5);
          
          // Draw balance text in yellow to match the image
          ctx.fillStyle = '#FFD700'; // Yellow text like in the image
          ctx.font = `bold ${6 * scaleFactor}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(balanceText, snakeHead.x, boxY + boxHeight / 2);
          
          // Reset text alignment
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }

        // Restore context
        ctx.restore();
      } // Close gameOver check

      // No UI display needed


      // Only continue game loop if game is not over (use ref for immediate response)
      if (!gameOverRef.current) {
        animationId = requestAnimationFrame(gameLoop);
      } else {
        console.log(`🛑 GAME LOOP STOPPED - gameOverRef = ${gameOverRef.current}`);
      }
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mouseDirection, snake, gameOver, canvasSize, score, hiddenAt, gameStarted]);

  const resetGame = () => {
    setGameOver(false);
    gameOverRef.current = false;
    setSnakeVisible(true);
    snakeVisibleRef.current = true;
    setSnakeFading(false);
    snakeFadingRef.current = false;
    setFadeOpacity(1.0);
    fadeOpacityRef.current = 1.0;
    setScore(0);
    setShowCongrats(false);
    setCashOutCompleted(false);
    // Reset snake to initial state using new system
    const mapCenterX = getMapCenterX(arenaSize);
    const mapCenterY = getMapCenterY(arenaSize);
    snake.head = { x: mapCenterX, y: mapCenterY };
    snake.currentAngle = 0;
    snake.segmentTrail = [{ x: mapCenterX, y: mapCenterY }];
    snake.totalMass = snake.START_MASS;
    snake.growthRemaining = 0;
    snake.partialGrowth = 0; // Reset partialGrowth for faster mass conversion
    snake.distanceBuffer = 0;
    snake.currentSegmentCount = snake.START_MASS; // Reset animated segment count
    snake.money = currentBetAmount > 0 ? currentBetAmount : 1.05; // Reset to bet amount or default
    snake.foodsEaten = 0; // Reset foods eaten counter
    snake.isBoosting = false;
    snake.boostCooldown = 0;
    snake.speed = snake.baseSpeed;
    snake.updateVisibleSegments();
    setIsBoosting(false);
    setMouseDirection({ x: 1, y: 0 });
  };

  const exitGame = () => {
    setLocation('/');
  };

  const handleLoadingComplete = () => {
    setIsLoading(false);
    setGameStarted(true);
    setGameStartTime(Date.now()); // Track when the game started

    // Force immediate multiple renders to ensure all snake eyes appear instantly
    if (canvasRef.current) {
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          window.requestAnimationFrame(() => {
            // Force complete rendering of all snake elements including eyes
          });
        }, i * 16); // Render every frame for 10 frames
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-retro">
      {/* Loading Screen */}
      {isLoading && <LoadingScreen onLoadingComplete={handleLoadingComplete} />}

      {/* Friend Mode Indicator */}
      {friendModeConfig.isEnabled && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-gradient-to-r from-green-600 to-green-700 border-2 border-green-500 rounded-lg px-4 py-2 shadow-lg">
            <div className="text-green-100 text-sm font-retro font-bold flex items-center gap-2">
              <span>👥</span>
              {friendModeConfig.gameTitle}
            </div>
            <div className="text-green-200 text-xs font-retro">
              Friend vs Friend - No Bots
            </div>
          </div>
        </div>
      )}

      {/* Minimap - Snake.io style */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-black/80 border border-gray-600 rounded-lg p-2">
          <svg width="80" height="80" className="w-full h-full">
            {/* Map boundary circle */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="#111"
              stroke="#444"
              strokeWidth="1"
            />

            {/* Player snake dot (your color) */}
            {snake.visibleSegments.length > 0 && (
              <circle
                cx={40 + ((snake.head.x - getMapCenterX(arenaSize)) / getMapRadius(arenaSize)) * 36}
                cy={40 + ((snake.head.y - getMapCenterY(arenaSize)) / getMapRadius(arenaSize)) * 36}
                r="2"
                fill={myPlayerColor}
              />
            )}

            {/* Other players as colored dots */}
            {otherPlayers.map((player, index) => (
              player.segments && player.segments.length > 0 && (
                <circle
                  key={player.id}
                  cx={40 + ((player.segments[0].x - getMapCenterX(arenaSize)) / getMapRadius(arenaSize)) * 36}
                  cy={40 + ((player.segments[0].y - getMapCenterY(arenaSize)) / getMapRadius(arenaSize)) * 36}
                  r="1.5"
                  fill={player.color || '#888'}
                />
              )
            ))}

            {/* Server players (friends) as colored dots */}
            {serverPlayers.filter(player => player.id !== myPlayerId).map((player, index) => (
              player.segments && player.segments.length > 0 && (
                <circle
                  key={player.id}
                  cx={40 + ((player.segments[0].x - getMapCenterX(arenaSize)) / getMapRadius(arenaSize)) * 36}
                  cy={40 + ((player.segments[0].y - getMapCenterY(arenaSize)) / getMapRadius(arenaSize)) * 36}
                  r="1.5"
                  fill={player.color || '#888'}
                />
              )
            ))}
          </svg>
        </div>
      </div>

      {/* Right-top HUD stack */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-3">
        
        {/* Connection Status */}
        {/*<div className="bg-black/80 border border-gray-700 rounded px-4 py-3 shadow-lg">
          <div className={`text-sm font-mono ${connectionStatus === 'Connected' ? 'text-green-400' :
            connectionStatus === 'Connecting...' ? 'text-yellow-400' : 'text-red-400'
            }`}>
            {connectionStatus}
          </div>
          <div className="text-gray-300 text-xs font-mono text-right">
            Players: {serverPlayers.length}
          </div>
          {isGhostMode && (
            <div className="text-cyan-400 text-xs font-mono animate-pulse text-right">
              👻 SPAWN PROTECTION
            </div>
          )}
        </div>/}

        {/* Withdraw Button */}
       {/* {user && (
          <Button
            onClick={() => setShowWithdrawModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white border border-red-500 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-retro text-sm"
          >
            <Wallet size={16} />
            <span>Withdraw</span>
          </Button>
        )} */}

        {/**
         * Mass/Segments HUD hidden per request
         *
         * <div className="bg-black/60 border border-gray-500 rounded px-4 py-3 shadow-sm">
         *   <div className="text-white text-sm font-mono text-right">
         *     Mass: {Math.floor(snake.totalMass).toFixed(0)}
         *   </div>
         *   <div className="text-gray-300 text-xs font-mono text-right">
         *     Segments: {snake.visibleSegments.length}
         *   </div>
         * </div>
         */}

        {/* Betting Information */}
        {currentBetAmount > 0 && !cashOutCompleted && (
          <div className="bg-black/80 border border-green-600 rounded px-4 py-3 shadow-lg">
            <div className="text-green-400 text-sm font-mono text-right">
              Bet: ${currentBetAmount}
            </div>
            <div className="text-gray-300 text-xs font-mono text-right">
              Hold Wallet Active
            </div>
            {gameStartTime && (
              <div className="text-yellow-400 text-xs font-mono mt-1 text-right">
                Multiplier: {Math.min(5, Math.max(0.5, (snake.totalMass / 10) * (Math.floor((Date.now() - gameStartTime) / 1000) / 60))).toFixed(2)}x
              </div>
            )}
          </div>
        )}

        {/* Cash Out Button */}
        {currentBetAmount > 0 && !cashOutCompleted && (
          <div className="bg-black/80 border border-blue-600 rounded px-4 py-3 shadow-lg">
            <div className="text-blue-400 text-sm font-mono text-right">
              Current: ${snake.money.toFixed(2)}
            </div>
            <div className="text-yellow-400 text-xs font-mono text-right">
              Winnings: ${Math.max(0, snake.money - currentBetAmount).toFixed(2)}
            </div>
            <div className="text-gray-300 text-xs font-mono text-right mt-1">
              Hold Q to cash out
            </div>
            {cashingOut && (
              <div className="text-green-400 text-xs font-mono text-right mt-1">
                Cashing out... {(cashOutProgress * 100).toFixed(0)}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-black/80 border border-gray-700 rounded px-3 py-2 shadow-lg">
          {/* <div className="text-white text-sm font-mono">Hold Q to cash out</div> */}
          <div className="text-gray-300 text-sm font-mono">Left click to boost</div>
          <div className="text-gray-300 text-sm font-mono">Press A for auto-play</div>
          {autoPlay && (
            <div className="text-cyan-400 text-sm font-mono mt-1 animate-pulse">🤖 AUTO-PLAY ACTIVE</div>
          )}
          {currentBetAmount > 0 && !cashOutCompleted && (
            <>
              <div className="text-green-400 text-sm font-mono mt-2">💰 Bet: ${currentBetAmount}</div>
              <div className="text-yellow-400 text-xs font-mono">Survive longer for bigger winnings!</div>
            </>
          )}
        </div>
      </div>



      {/* {showCongrats && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-dark-card/90 backdrop-blur-sm border border-dark-border rounded-lg p-8 text-center">
            <div className="text-green-500 text-4xl font-bold mb-4">Congratulations!</div>
            <div className="text-white text-2xl mb-2">PumpGames.Fun Cash Out!</div>
            <div className="text-neon-yellow text-xl mb-6">${cashedOutAmount.toFixed(2)}</div>
            <div className="flex gap-4">
              <Button
                onClick={resetGame}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Play Again
              </Button>
              <Button
                onClick={exitGame}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCongrats && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-dark-card/90 backdrop-blur-sm border border-neon-green rounded-lg p-8 text-center">
            <div className="text-neon-green text-4xl font-bold mb-4">Congratulations!</div>
            <div className="text-white text-2xl mb-2">PumpGames.Fun Cash Out:</div>
            <div className="text-neon-yellow text-3xl font-bold mb-6">${cashedOutAmount.toFixed(2)}</div>
            <div className="flex gap-4 justify-center">
              <Button
                onClick={resetGame}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
              >
                Play Again
              </Button>
              <Button
                onClick={exitGame}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )} */}

      {/* Background Canvas - NEVER moves, always behind game canvas */}
      <canvas
        ref={backgroundCanvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute top-0 left-0 cursor-default block"
        style={{ zIndex: 0, background: '#000000' }}
      />
      
      {/* Game Canvas - Contains snake, food, etc. - moves with camera */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute top-0 left-0 cursor-default block"
        style={{ zIndex: 1, background: 'transparent' }}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        currentBalance={user?.balance || 0}
        onWithdrawComplete={(amount) => {
          // Update user balance after withdrawal
          if (user) {
            user.balance -= amount;
          }
          setShowWithdrawModal(false);
          toast({
            title: "Withdrawal Processed",
            description: `$${amount.toFixed(2)} withdrawn successfully`,
          });
        }}
      />
    </div>
  );
}