"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/production.ts
var import_express = __toESM(require("express"), 1);
var import_http2 = require("http");
var import_socket = require("socket.io");

// server/simple-routes.ts
var import_http = require("http");
var import_ws = require("ws");

// server/simple-auth.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var USERS_FILE = import_path.default.join(process.cwd(), "users.json");
function loadUsers() {
  try {
    if (import_fs.default.existsSync(USERS_FILE)) {
      const data = import_fs.default.readFileSync(USERS_FILE, "utf8");
      const users = JSON.parse(data);
      return users.map((user) => ({
        ...user,
        balance: Number(user.balance),
        holdBalance: Number(user.holdBalance)
      }));
    }
  } catch (error) {
    console.log("No users file found, starting fresh");
  }
  return [];
}
function saveUsers(users) {
  import_fs.default.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function registerUser(username, password) {
  const users = loadUsers();
  if (users.find((u) => u.username === username)) {
    return { success: false, message: "Username already exists" };
  }
  if (username.length < 3) {
    return { success: false, message: "Username must be at least 3 characters" };
  }
  if (password.length < 6) {
    return { success: false, message: "Password must be at least 6 characters" };
  }
  const newUser = {
    id: Date.now().toString(),
    username,
    password,
    // Plain text for simplicity
    balance: 0,
    // Starting balance is $0 - users must top up
    holdBalance: 0
    // Starting hold balance is $0
  };
  users.push(newUser);
  saveUsers(users);
  return {
    success: true,
    message: "Account created successfully",
    user: { ...newUser, password: "" }
    // Don't return password
  };
}
function loginUser(username, password) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return { success: false, message: "Invalid username or password" };
  }
  return {
    success: true,
    message: "Login successful",
    user: { ...user, password: "" }
    // Don't return password
  };
}
function updateDailyRewardClaim(username, rewardAmount = 0.1) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.username === username);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const lastClaim = users[userIndex].lastDailyRewardClaim;
  if (lastClaim) {
    const lastClaimDate = new Date(lastClaim);
    const nowDate = new Date(now);
    const hoursSinceLastClaim = (nowDate.getTime() - lastClaimDate.getTime()) / (1e3 * 60 * 60);
    if (hoursSinceLastClaim < 24) {
      const hoursLeft = Math.ceil(24 - hoursSinceLastClaim);
      return {
        success: false,
        message: `Daily reward already claimed. Next claim available in ${hoursLeft} hours.`
      };
    }
  }
  users[userIndex].lastDailyRewardClaim = now;
  users[userIndex].balance += rewardAmount;
  saveUsers(users);
  return {
    success: true,
    message: "Daily reward claimed successfully!",
    user: { ...users[userIndex], password: "" }
  };
}
function updateUsername(userId, newUsername) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  if (newUsername.length < 3) {
    return { success: false, message: "Username must be at least 3 characters" };
  }
  if (newUsername.length > 20) {
    return { success: false, message: "Username must be less than 20 characters" };
  }
  const existingUser = users.find((u) => u.username === newUsername && u.id !== userId);
  if (existingUser) {
    return { success: false, message: "Username already taken" };
  }
  users[userIndex].username = newUsername;
  saveUsers(users);
  return {
    success: true,
    message: "Username updated successfully!",
    user: { ...users[userIndex], password: "" }
  };
}
function placeBet(userId, betAmount) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  const user = users[userIndex];
  const userBalance = Number(user.balance);
  console.log("Server bet validation:", { userId, userBalance, betAmount, userBalanceType: typeof user.balance, betAmountType: typeof betAmount });
  if (userBalance < betAmount) {
    return { success: false, message: `Insufficient balance. You have $${userBalance.toFixed(2)} but need $${betAmount.toFixed(2)}` };
  }
  users[userIndex].balance = userBalance - betAmount;
  users[userIndex].holdBalance = Number(users[userIndex].holdBalance) + betAmount;
  saveUsers(users);
  return {
    success: true,
    message: `Bet of $${betAmount.toFixed(2)} placed successfully`,
    user: { ...users[userIndex], password: "" }
  };
}
function winBet(userId, betAmount, winnings) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  const user = users[userIndex];
  const userHoldBalance = Number(user.holdBalance);
  if (userHoldBalance < betAmount) {
    return { success: false, message: "Bet amount not found in hold balance" };
  }
  users[userIndex].holdBalance = userHoldBalance - betAmount;
  users[userIndex].balance = Number(users[userIndex].balance) + betAmount + winnings;
  saveUsers(users);
  return {
    success: true,
    message: `Won $${winnings.toFixed(2)}! Total returned: $${(betAmount + winnings).toFixed(2)}`,
    user: { ...users[userIndex], password: "" }
  };
}
function loseBet(userId, betAmount) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  const user = users[userIndex];
  const userHoldBalance = Number(user.holdBalance);
  if (userHoldBalance < betAmount) {
    return { success: false, message: "Bet amount not found in hold balance" };
  }
  users[userIndex].holdBalance = userHoldBalance - betAmount;
  saveUsers(users);
  return {
    success: true,
    message: `Lost bet of $${betAmount.toFixed(2)}`,
    user: { ...users[userIndex], password: "" }
  };
}
function migrateHasPlayedGame() {
  const users = loadUsers();
  let migratedCount = 0;
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.gamesPlayedToday && user.gamesPlayedToday > 0 || user.lastGameDate) {
      if (user.hasPlayedGame === void 0) {
        users[i].hasPlayedGame = true;
        migratedCount++;
      }
    }
  }
  if (migratedCount > 0) {
    saveUsers(users);
  }
  return {
    success: true,
    message: `Migration completed. ${migratedCount} users updated.`,
    migratedCount
  };
}
function trackGamePlayed(userId) {
  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    return { success: false, message: "User not found" };
  }
  const user = users[userIndex];
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const lastGameDate = user.lastGameDate ? user.lastGameDate.split("T")[0] : null;
  user.hasPlayedGame = true;
  if (lastGameDate !== today) {
    user.gamesPlayedToday = 1;
  } else {
    user.gamesPlayedToday = (user.gamesPlayedToday || 0) + 1;
  }
  user.lastGameDate = (/* @__PURE__ */ new Date()).toISOString();
  users[userIndex] = user;
  saveUsers(users);
  return {
    success: true,
    message: "Game tracked successfully",
    user: { ...user, password: "" }
    // Don't return password
  };
}

// server/wallet-utils.ts
var import_web3 = require("@solana/web3.js");
var import_bs58 = __toESM(require("bs58"), 1);
var MAIN_WALLET_PRIVATE_KEY = "PPDmTNT9eFTRfbEMr7ZxmAyJe2SZEVRSQv3ZQg4dMFxBGaqGMfnLKT5zrAjK6bwEjSinoK5o6gnENJpbqBpxFGv";
var SOLANA_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
  // Primary Solana endpoint
  "https://rpc.ankr.com/solana",
  // Ankr endpoint (more reliable)
  "https://solana-api.projectserum.com",
  // Project Serum endpoint
  "https://solana-mainnet.g.alchemy.com/v2/demo"
  // Alchemy (last resort - often blocked)
];
var PRODUCTION_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com"
];
var solPriceCache = null;
var SOL_PRICE_CACHE_DURATION = 5 * 60 * 1e3;
var connection = new import_web3.Connection(SOLANA_RPC_URLS[0], {
  commitment: "confirmed",
  wsEndpoint: "wss://api.mainnet-beta.solana.com",
  disableRetryOnRateLimit: false,
  // Enable retry on rate limit
  confirmTransactionInitialTimeout: 3e4,
  // 30 seconds
  httpHeaders: {
    "User-Agent": "PumpGame/1.0"
  }
});
var mainWalletKeypair = import_web3.Keypair.fromSecretKey(import_bs58.default.decode(MAIN_WALLET_PRIVATE_KEY));
var generatedAddresses = /* @__PURE__ */ new Map();
async function checkPaymentToUserAddress(userAddress, expectedAmount, timeWindow = 30 * 60 * 1e3) {
  try {
    console.log(`\u{1F50D} Checking payments to user address: ${userAddress}`);
    console.log(`\u{1F4B0} Expected amount: $${expectedAmount}`);
    console.log(`\u23F0 Time window: ${timeWindow / 1e3 / 60} minutes`);
    const publicKey = new import_web3.PublicKey(userAddress);
    const cutoffTime = Date.now() - timeWindow;
    console.log(`\u{1F4C5} Checking transactions after: ${new Date(cutoffTime).toISOString()}`);
    const solPrice = await getSOLPrice();
    console.log(`\u{1F4B1} Current SOL price: $${solPrice}`);
    const endpoints = process.env.NODE_ENV === "production" || process.env.RENDER ? PRODUCTION_RPC_URLS : SOLANA_RPC_URLS;
    let signatures = null;
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        console.log(`\u{1F504} Trying RPC endpoint: ${endpoint}`);
        const testConnection = new import_web3.Connection(endpoint, {
          commitment: "confirmed",
          confirmTransactionInitialTimeout: 15e3,
          httpHeaders: {
            "User-Agent": "PumpGame-Payment-Verification/1.0"
          }
        });
        signatures = await testConnection.getSignaturesForAddress(publicKey, {
          limit: 3
          // Very small limit to avoid rate limiting
        });
        console.log(`\u2705 Successfully connected to ${endpoint}`);
        break;
      } catch (error) {
        console.error(`\u274C Failed to connect to ${endpoint}:`, error.message);
        lastError = error;
        if (error.message.includes("1015") || error.message.includes("Cloudflare") || error.message.includes("banned")) {
          console.log(`\u{1F6AB} Endpoint ${endpoint} is blocked, trying next...`);
          continue;
        }
      }
    }
    if (!signatures) {
      console.error("\u274C All RPC endpoints failed:", lastError?.message);
      return { verified: false };
    }
    console.log(`\u{1F4CB} Found ${signatures.length} recent signatures for user address`);
    let checkedTransactions = 0;
    let recentTransactions = 0;
    for (const sig of signatures) {
      checkedTransactions++;
      if (sig.blockTime && sig.blockTime * 1e3 > cutoffTime) {
        recentTransactions++;
        console.log(`\u{1F504} Checking transaction ${recentTransactions}: ${sig.signature.substring(0, 16)}... (${new Date(sig.blockTime * 1e3).toISOString()})`);
        const result = await verifyTransactionWithFallbacks(sig, userAddress, expectedAmount, solPrice, endpoints);
        if (result.verified) {
          console.log(`\u2705 Payment verified!`);
          return result;
        }
        if (recentTransactions < signatures.length) {
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
      if (checkedTransactions >= 2) {
        console.log(`\u23F0 Early exit after checking ${checkedTransactions} transactions to avoid rate limiting`);
        break;
      }
    }
    console.log(`\u{1F4CA} Checked ${checkedTransactions} transactions, ${recentTransactions} were recent`);
    console.log(`\u274C No matching payment found for $${expectedAmount}`);
    return { verified: false };
  } catch (error) {
    console.error("Error checking payment to user address:", error);
    return { verified: false };
  }
}
async function verifyTransactionWithFallbacks(sig, userAddress, expectedAmount, solPrice, endpoints) {
  for (const endpoint of endpoints) {
    try {
      console.log(`\u{1F504} Trying to verify transaction with ${endpoint}`);
      const testConnection = new import_web3.Connection(endpoint, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 15e3,
        httpHeaders: {
          "User-Agent": "PumpGame-Payment-Verification/1.0"
        }
      });
      const transaction = await testConnection.getTransaction(sig.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      if (transaction && transaction.meta) {
        const preBalances = transaction.meta.preBalances;
        const postBalances = transaction.meta.postBalances;
        for (let i = 0; i < transaction.transaction.message.staticAccountKeys.length; i++) {
          const accountKey = transaction.transaction.message.staticAccountKeys[i].toString();
          if (accountKey === userAddress) {
            const balanceChange = (postBalances[i] - preBalances[i]) / import_web3.LAMPORTS_PER_SOL;
            if (balanceChange > 0) {
              const estimatedUSD = balanceChange * solPrice;
              console.log(`\u{1F4B0} Payment received: ${balanceChange.toFixed(6)} SOL (~$${estimatedUSD.toFixed(2)}) - Expected: $${expectedAmount}`);
              const tolerance = expectedAmount * 0.3;
              if (Math.abs(estimatedUSD - expectedAmount) <= tolerance) {
                console.log(`\u2705 Payment verified! Transaction: ${sig.signature}`);
                console.log(`\u2705 Amount: $${estimatedUSD.toFixed(2)} (within $${tolerance.toFixed(2)} tolerance)`);
                return {
                  verified: true,
                  transactionHash: sig.signature,
                  actualAmount: estimatedUSD
                };
              } else {
                console.log(`\u274C Amount mismatch: $${estimatedUSD.toFixed(2)} vs $${expectedAmount} (tolerance: $${tolerance.toFixed(2)})`);
              }
            }
          }
        }
      }
      return { verified: false };
    } catch (error) {
      console.error(`\u274C Failed to verify transaction with ${endpoint}:`, error.message);
      if (error.message.includes("1015") || error.message.includes("Cloudflare") || error.message.includes("banned")) {
        console.log(`\u{1F6AB} Endpoint ${endpoint} is blocked, trying next...`);
        continue;
      }
      continue;
    }
  }
  console.log(`\u274C All endpoints failed to verify transaction ${sig.signature}`);
  return { verified: false };
}
async function getSOLPrice() {
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_PRICE_CACHE_DURATION) {
    console.log(`\u{1F4BE} Using cached SOL price: $${solPriceCache.price}`);
    return solPriceCache.price;
  }
  const maxRetries = 1;
  const retryDelay = 2e3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\u{1F310} Fetching SOL price from CoinGecko... (attempt ${attempt}/${maxRetries})`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1e4);
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
        headers: {
          "User-Agent": "PumpGame-Payment-Verification/1.0",
          "Accept": "application/json",
          "Cache-Control": "no-cache",
          "X-Requested-With": "XMLHttpRequest"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`CoinGecko API returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const price = data.solana?.usd;
      if (!price || price <= 0 || price > 1e3) {
        throw new Error(`Invalid price data received: ${price}`);
      }
      solPriceCache = { price, timestamp: Date.now() };
      console.log(`\u2705 SOL price fetched successfully: $${price} (cached for 5 minutes)`);
      return price;
    } catch (error) {
      console.error(`\u274C Attempt ${attempt} failed to fetch SOL price:`, error);
      if (attempt === maxRetries) {
        console.error("\u274C All attempts failed to fetch SOL price");
        if (solPriceCache) {
          console.log(`\u26A0\uFE0F Using expired cached SOL price: $${solPriceCache.price}`);
          return solPriceCache.price;
        }
        console.log("\u26A0\uFE0F Using fallback SOL price: $240");
        return 240;
      }
      if (attempt < maxRetries) {
        console.log(`\u23F3 Waiting ${retryDelay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
  return 240;
}
async function withdrawSOL(toAddress, solAmount, userId) {
  try {
    console.log(`\u{1F4B0} Withdrawing ${solAmount} SOL to ${toAddress} for user ${userId}`);
    let toPublicKey;
    try {
      toPublicKey = new import_web3.PublicKey(toAddress);
    } catch (error) {
      console.error("Invalid destination address:", error);
      return { success: false, error: "Invalid wallet address" };
    }
    const lamports = Math.floor(solAmount * import_web3.LAMPORTS_PER_SOL);
    console.log(`\u{1F4B8} Converting ${solAmount} SOL to ${lamports} lamports`);
    const balance = await connection.getBalance(mainWalletKeypair.publicKey);
    const balanceInSOL = balance / import_web3.LAMPORTS_PER_SOL;
    console.log(`\u{1F4B3} Main wallet balance: ${balanceInSOL.toFixed(6)} SOL`);
    if (balance < lamports) {
      console.error(`\u274C Insufficient balance. Required: ${solAmount} SOL, Available: ${balanceInSOL.toFixed(6)} SOL`);
      return { success: false, error: `Insufficient balance. Available: ${balanceInSOL.toFixed(6)} SOL` };
    }
    const transaction = new import_web3.Transaction();
    const transferInstruction = import_web3.SystemProgram.transfer({
      fromPubkey: mainWalletKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports
    });
    transaction.add(transferInstruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = mainWalletKeypair.publicKey;
    console.log(`\u{1F4DD} Signing transaction with main wallet...`);
    transaction.sign(mainWalletKeypair);
    console.log(`\u{1F680} Sending transaction to blockchain...`);
    const signature = await connection.sendTransaction(transaction, [mainWalletKeypair]);
    console.log(`\u23F3 Waiting for confirmation...`);
    await connection.confirmTransaction(signature);
    console.log(`\u2705 Withdrawal successful! Transaction: ${signature}`);
    console.log(`\u2705 Sent ${solAmount} SOL to ${toAddress}`);
    return {
      success: true,
      transactionHash: signature
    };
  } catch (error) {
    console.error("\u274C Withdrawal error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}
async function getMainWalletBalance() {
  try {
    const balance = await connection.getBalance(mainWalletKeypair.publicKey);
    const balanceInSOL = balance / import_web3.LAMPORTS_PER_SOL;
    const solPrice = await getSOLPrice();
    const balanceUSD = balanceInSOL * solPrice;
    return {
      balance: balanceInSOL,
      balanceUSD
    };
  } catch (error) {
    console.error("Error getting main wallet balance:", error);
    return { balance: 0, balanceUSD: 0 };
  }
}
function cleanupExpiredAddresses() {
  const now = Date.now();
  const expired = [];
  for (const [address, data] of generatedAddresses.entries()) {
    if (now - data.createdAt > 30 * 60 * 1e3) {
      expired.push(address);
    }
  }
  expired.forEach((address) => {
    generatedAddresses.delete(address);
    console.log(`\u{1F5D1}\uFE0F Cleaned up expired address: ${address.substring(0, 8)}...`);
  });
  if (expired.length > 0) {
    console.log(`\u{1F9F9} Cleaned up ${expired.length} expired addresses`);
  }
}
function getMainWalletAddress() {
  return mainWalletKeypair.publicKey.toBase58();
}
function getAllGeneratedAddresses() {
  return generatedAddresses;
}

// server/simple-routes.ts
async function registerRoutes(app2) {
  const httpServer2 = (0, import_http.createServer)(app2);
  cleanupExpiredAddresses();
  setInterval(() => {
    cleanupExpiredAddresses();
  }, 10 * 60 * 1e3);
  app2.post("/api/auth/register", (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const result = registerUser(username, password);
      if (result.success) {
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ message: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const result = loginUser(username, password);
      if (result.success) {
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(401).json({ message: result.message });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({ message: "Login failed" });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    res.json({ message: "Logged out successfully" });
  });
  app2.post("/api/auth/migrate-has-played-game", (req, res) => {
    try {
      const result = migrateHasPlayedGame();
      res.json({
        success: result.success,
        message: result.message,
        migratedCount: result.migratedCount
      });
    } catch (error) {
      console.error("Migration error:", error);
      res.status(500).json({
        success: false,
        message: "Migration failed",
        migratedCount: 0
      });
    }
  });
  app2.post("/api/auth/claim-daily-reward", (req, res) => {
    try {
      const { username, rewardAmount } = req.body;
      if (!username) {
        return res.status(400).json({ message: "Username required" });
      }
      const result = updateDailyRewardClaim(username, rewardAmount);
      if (result.success) {
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Daily reward claim error:", error);
      res.status(400).json({ message: "Failed to claim daily reward" });
    }
  });
  app2.post("/api/auth/update-username", (req, res) => {
    try {
      const { userId, newUsername } = req.body;
      if (!userId || !newUsername) {
        return res.status(400).json({ message: "User ID and new username required" });
      }
      const result = updateUsername(userId, newUsername);
      if (result.success) {
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Username update error:", error);
      res.status(400).json({ message: "Failed to update username" });
    }
  });
  app2.post("/api/wallet/add-funds", (req, res) => {
    try {
      const { userId, amount } = req.body;
      if (!userId || !amount) {
        return res.status(400).json({ message: "User ID and amount required" });
      }
      if (amount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }
      if (amount > 1e4) {
        return res.status(400).json({ message: "Maximum top-up amount is $10,000" });
      }
      const users = loadUsers();
      const userIndex = users.findIndex((u) => u.id === userId);
      if (userIndex === -1) {
        return res.status(404).json({ message: "User not found" });
      }
      users[userIndex].balance += amount;
      saveUsers(users);
      res.json({
        success: true,
        message: `Successfully added $${amount.toFixed(2)} to your wallet`,
        newBalance: users[userIndex].balance,
        user: { ...users[userIndex], password: "" }
      });
    } catch (error) {
      console.error("Add funds error:", error);
      res.status(500).json({ message: "Failed to add funds" });
    }
  });
  app2.get("/api/wallet/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }
      const users = loadUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        balance: user.balance,
        holdBalance: user.holdBalance,
        availableBalance: user.balance - user.holdBalance
      });
    } catch (error) {
      console.error("Get wallet error:", error);
      res.status(500).json({ message: "Failed to get wallet info" });
    }
  });
  app2.post("/api/payment/generate-address", async (req, res) => {
    try {
      const { userId, amount, currency } = req.body;
      if (!userId || !amount || !currency) {
        return res.status(400).json({ message: "User ID, amount, and currency required" });
      }
      if (amount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }
      const users = loadUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const staticWalletAddress = "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv";
      const paymentSessionId = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const createdAt = Date.now();
      const expiresAt = createdAt + 30 * 60 * 1e3;
      if (!user.paymentSessions) {
        user.paymentSessions = [];
      }
      user.paymentSessions.push({
        sessionId: paymentSessionId,
        amount,
        currency,
        walletAddress: staticWalletAddress,
        createdAt,
        expiresAt,
        status: "pending"
      });
      saveUsers(users);
      console.log(`\u2705 Generated payment session for user ${userId} using static address: ${staticWalletAddress}`);
      res.json({
        success: true,
        paymentSessionId,
        walletAddress: staticWalletAddress,
        amount,
        currency,
        expiresAt
      });
    } catch (error) {
      console.error("Generate payment address error:", error);
      res.status(500).json({ message: "Failed to generate payment address" });
    }
  });
  app2.post("/api/wallet/cleanup", (req, res) => {
    try {
      cleanupExpiredAddresses();
      res.json({
        success: true,
        message: "Expired addresses cleaned up successfully"
      });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to cleanup addresses" });
    }
  });
  app2.get("/api/wallet/debug/addresses", (req, res) => {
    try {
      const addresses = getAllGeneratedAddresses();
      const addressList = Array.from(addresses.entries()).map(([address, data]) => ({
        address: address.substring(0, 8) + "...",
        userId: data.userId,
        createdAt: new Date(data.createdAt).toISOString(),
        expired: Date.now() - data.createdAt > 30 * 60 * 1e3
      }));
      res.json({
        success: true,
        count: addressList.length,
        addresses: addressList
      });
    } catch (error) {
      console.error("Debug error:", error);
      res.status(500).json({ message: "Failed to get debug info" });
    }
  });
  app2.get("/api/wallet/test-payment/:amount", async (req, res) => {
    try {
      const { amount } = req.params;
      console.log(`\u{1F9EA} Testing payment verification for $${amount}`);
      const result = await checkPaymentToUserAddress(
        "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv",
        parseFloat(amount)
      );
      res.json({
        success: true,
        amount: parseFloat(amount),
        wallet: "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv",
        result
      });
    } catch (error) {
      console.error("Test payment error:", error);
      res.status(500).json({ message: "Failed to test payment verification" });
    }
  });
  app2.get("/api/wallet/test-user-payment/:address/:amount", async (req, res) => {
    try {
      const { address, amount } = req.params;
      console.log(`\u{1F9EA} Testing payment verification for $${amount} to address ${address}`);
      const result = await checkPaymentToUserAddress(
        address,
        parseFloat(amount)
      );
      res.json({
        success: true,
        amount: parseFloat(amount),
        wallet: address,
        result
      });
    } catch (error) {
      console.error("Test user payment error:", error);
      res.status(500).json({ message: "Failed to test user payment verification" });
    }
  });
  app2.get("/api/wallet/test-static-payment/:amount", async (req, res) => {
    try {
      const { amount } = req.params;
      const staticWalletAddress = "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv";
      console.log(`\u{1F9EA} Testing static wallet payment verification for $${amount}`);
      const result = await checkPaymentToUserAddress(
        staticWalletAddress,
        parseFloat(amount)
      );
      res.json({
        success: true,
        amount: parseFloat(amount),
        wallet: staticWalletAddress,
        result
      });
    } catch (error) {
      console.error("Test static payment error:", error);
      res.status(500).json({ message: "Failed to test static payment verification" });
    }
  });
  app2.get("/api/wallet/debug/transactions", async (req, res) => {
    try {
      const { PublicKey: PublicKey2 } = await import("@solana/web3.js");
      const publicKey = new PublicKey2("3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv");
      const signatures = await connection.getSignaturesForAddress(publicKey, {
        limit: 10
      });
      const transactions = [];
      for (const sig of signatures.slice(0, 5)) {
        try {
          const transaction = await connection.getTransaction(sig.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
          });
          if (transaction && transaction.meta) {
            const preBalances = transaction.meta.preBalances;
            const postBalances = transaction.meta.postBalances;
            for (let i = 0; i < transaction.transaction.message.staticAccountKeys.length; i++) {
              const accountKey = transaction.transaction.message.staticAccountKeys[i].toString();
              if (accountKey === "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv") {
                const balanceChange = (postBalances[i] - preBalances[i]) / 1e9;
                if (balanceChange > 0) {
                  transactions.push({
                    signature: sig.signature.substring(0, 16) + "...",
                    timestamp: new Date(sig.blockTime * 1e3).toISOString(),
                    solAmount: balanceChange.toFixed(6),
                    blockTime: sig.blockTime
                  });
                }
              }
            }
          }
        } catch (txError) {
          console.error(`Error processing transaction ${sig.signature}:`, txError);
        }
      }
      res.json({
        success: true,
        wallet: "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv",
        totalSignatures: signatures.length,
        incomingTransactions: transactions
      });
    } catch (error) {
      console.error("Debug transactions error:", error);
      res.status(500).json({ message: "Failed to get transaction debug info" });
    }
  });
  app2.post("/api/withdraw", async (req, res) => {
    try {
      const { userId, walletAddress, amount } = req.body;
      if (!userId || !walletAddress || !amount) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: userId, walletAddress, amount"
        });
      }
      const withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount. Must be a positive number."
        });
      }
      if (withdrawAmount < 0.01) {
        return res.status(400).json({
          success: false,
          message: "Minimum withdrawal amount is 0.01 SOL"
        });
      }
      const users = loadUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      const solPrice = await getSOLPrice();
      const userBalanceInSOL = user.balance / solPrice;
      console.log(`\u{1F4B0} User ${userId} balance: $${user.balance} (${userBalanceInSOL.toFixed(6)} SOL)`);
      console.log(`\u{1F4B8} Requested withdrawal: ${withdrawAmount} SOL ($${(withdrawAmount * solPrice).toFixed(2)})`);
      if (userBalanceInSOL < withdrawAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Available: ${userBalanceInSOL.toFixed(6)} SOL ($${user.balance.toFixed(2)})`
        });
      }
      const mainWalletBalance = await getMainWalletBalance();
      console.log(`\u{1F4B3} Main wallet balance: ${mainWalletBalance.balance.toFixed(6)} SOL ($${mainWalletBalance.balanceUSD.toFixed(2)})`);
      if (mainWalletBalance.balance < withdrawAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient main wallet balance. Available: ${mainWalletBalance.balance.toFixed(6)} SOL`
        });
      }
      console.log(`\u{1F680} Processing withdrawal: ${withdrawAmount} SOL to ${walletAddress}`);
      const withdrawalResult = await withdrawSOL(walletAddress, withdrawAmount, userId);
      if (withdrawalResult.success) {
        const withdrawalAmountUSD = withdrawAmount * solPrice;
        user.balance -= withdrawalAmountUSD;
        saveUsers(users);
        console.log(`\u2705 Withdrawal successful! User ${userId} balance updated to $${user.balance.toFixed(2)}`);
        res.json({
          success: true,
          message: "Withdrawal successful",
          transactionHash: withdrawalResult.transactionHash,
          newBalance: user.balance,
          withdrawnAmount: withdrawAmount,
          withdrawnAmountUSD: withdrawalAmountUSD
        });
      } else {
        console.error(`\u274C Withdrawal failed: ${withdrawalResult.error}`);
        res.status(400).json({
          success: false,
          message: withdrawalResult.error || "Withdrawal failed"
        });
      }
    } catch (error) {
      console.error("Withdrawal error:", error);
      res.status(500).json({
        success: false,
        message: "Withdrawal failed due to server error"
      });
    }
  });
  app2.get("/api/wallet/main/balance", async (req, res) => {
    try {
      const balance = await getMainWalletBalance();
      res.json({
        success: true,
        balance: balance.balance,
        balanceUSD: balance.balanceUSD,
        walletAddress: getMainWalletAddress()
      });
    } catch (error) {
      console.error("Error getting main wallet balance:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get wallet balance"
      });
    }
  });
  app2.post("/api/game/place-bet", (req, res) => {
    try {
      const { userId, betAmount } = req.body;
      if (!userId || !betAmount) {
        return res.status(400).json({ message: "User ID and bet amount required" });
      }
      const result = placeBet(userId, betAmount);
      if (result.success) {
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Place bet error:", error);
      res.status(400).json({ message: "Failed to place bet" });
    }
  });
  app2.post("/api/game/win-bet", (req, res) => {
    try {
      const { userId, betAmount, winnings } = req.body;
      if (!userId || !betAmount || winnings === void 0) {
        return res.status(400).json({ message: "User ID, bet amount, and winnings required" });
      }
      const result = winBet(userId, betAmount, winnings);
      if (result.success) {
        trackGamePlayed(userId);
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Win bet error:", error);
      res.status(400).json({ message: "Failed to process win" });
    }
  });
  app2.post("/api/game/lose-bet", (req, res) => {
    try {
      const { userId, betAmount } = req.body;
      if (!userId || !betAmount) {
        return res.status(400).json({ message: "User ID and bet amount required" });
      }
      const result = loseBet(userId, betAmount);
      if (result.success) {
        trackGamePlayed(userId);
        res.json({
          user: result.user,
          message: result.message
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Lose bet error:", error);
      res.status(400).json({ message: "Failed to process loss" });
    }
  });
  app2.post("/api/verify-payment", async (req, res) => {
    try {
      const { paymentSessionId, userId } = req.body;
      if (!paymentSessionId || !userId) {
        return res.status(400).json({
          verified: false,
          message: "Missing required fields: paymentSessionId, userId"
        });
      }
      console.log(`\u{1F50D} Payment verification request:`, { paymentSessionId, userId });
      const users = loadUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) {
        console.log(`\u274C User not found: ${userId}`);
        return res.status(404).json({
          verified: false,
          message: "User not found"
        });
      }
      const paymentSession = user.paymentSessions?.find(
        (session) => session.sessionId === paymentSessionId
      );
      if (!paymentSession) {
        console.log(`\u274C Payment session not found: ${paymentSessionId}`);
        return res.status(404).json({
          verified: false,
          message: "Payment session not found"
        });
      }
      if (paymentSession.status === "completed") {
        console.log(`\u26A0\uFE0F Payment session already completed: ${paymentSessionId}`);
        return res.status(400).json({
          verified: false,
          message: "This payment has already been processed and credited to your account."
        });
      }
      if (Date.now() - paymentSession.createdAt > 60 * 60 * 1e3) {
        console.log(`\u23F0 Payment session expired: ${paymentSessionId}`);
        return res.status(400).json({
          verified: false,
          message: "Payment session has expired. Please create a new payment request."
        });
      }
      console.log(`\u2705 Payment session found:`, {
        sessionId: paymentSession.sessionId,
        walletAddress: paymentSession.walletAddress,
        amount: paymentSession.amount,
        currency: paymentSession.currency,
        status: paymentSession.status
      });
      const allProcessedTransactions = /* @__PURE__ */ new Set();
      users.forEach((u) => {
        if (u.paymentSessions) {
          u.paymentSessions.forEach((session) => {
            if (session.transactionHash && session.status === "completed") {
              allProcessedTransactions.add(session.transactionHash);
            }
          });
        }
      });
      console.log(`\u{1F4CB} Found ${allProcessedTransactions.size} already processed transactions`);
      const staticWalletAddress = "3XVzfnAsvCPjTm4LJKaVWJVMWMYAbNRra3twrzBaokJv";
      console.log(`\u{1F50D} Checking payment to static address: ${staticWalletAddress} for amount: $${paymentSession.amount}`);
      const verificationResult = await checkPaymentToUserAddress(
        staticWalletAddress,
        paymentSession.amount
      );
      console.log(`\u{1F4CA} Verification result:`, verificationResult);
      if (verificationResult.verified) {
        if (verificationResult.transactionHash && allProcessedTransactions.has(verificationResult.transactionHash)) {
          console.log(`\u26A0\uFE0F Transaction ${verificationResult.transactionHash} has already been processed`);
          return res.status(400).json({
            verified: false,
            message: "This payment transaction has already been processed. Please check your account balance."
          });
        }
        const userIndex = users.findIndex((u) => u.id === userId);
        if (userIndex >= 0) {
          users[userIndex].balance = (users[userIndex].balance || 0) + paymentSession.amount;
          if (users[userIndex].paymentSessions) {
            const sessionIndex = users[userIndex].paymentSessions.findIndex(
              (session) => session.sessionId === paymentSessionId
            );
            if (sessionIndex >= 0) {
              users[userIndex].paymentSessions[sessionIndex].status = "completed";
              users[userIndex].paymentSessions[sessionIndex].completedAt = Date.now();
              users[userIndex].paymentSessions[sessionIndex].transactionHash = verificationResult.transactionHash;
              users[userIndex].paymentSessions[sessionIndex].verifiedAmount = verificationResult.actualAmount || paymentSession.amount;
            }
          }
          saveUsers(users);
          console.log(`\u2705 Payment verified successfully! User ${userId} balance updated to $${users[userIndex].balance.toFixed(2)}`);
          console.log(`\u{1F517} Transaction hash: ${verificationResult.transactionHash}`);
          res.json({
            verified: true,
            transactionHash: verificationResult.transactionHash,
            currency: "SOL",
            amount: verificationResult.actualAmount || paymentSession.amount,
            newBalance: users[userIndex].balance
          });
        } else {
          res.status(500).json({
            verified: false,
            message: "Failed to update user balance"
          });
        }
      } else {
        console.log(`\u274C No payment detected for user ${userId} to static address ${staticWalletAddress}`);
        res.json({
          verified: false,
          message: "No payment detected. Please ensure your transaction is confirmed and try again."
        });
      }
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({
        verified: false,
        message: "Payment verification failed"
      });
    }
  });
  app2.get("/api/room/join", (req, res) => {
    const requestedRegion = req.query.region || "us";
    if (requestedRegion !== "us" && requestedRegion !== "eu") {
      return res.status(400).json({ message: 'Invalid region. Must be "us" or "eu"' });
    }
    const room = findBestRoom(requestedRegion);
    if (!room) {
      return res.status(500).json({ message: "Failed to find or create room" });
    }
    res.json({
      roomId: room.id,
      region: room.region,
      currentPlayers: room.players.size + (room.bots ? room.bots.size : 0),
      maxPlayers: room.maxPlayers,
      arenaSize: room.gameState.arenaSize
    });
  });
  const gameRooms = /* @__PURE__ */ new Map();
  const playerToRoom = /* @__PURE__ */ new Map();
  function createRoom(region, id) {
    const roomKey = `${region}:${id}`;
    if (!gameRooms.has(roomKey)) {
      const room = {
        id,
        region,
        players: /* @__PURE__ */ new Map(),
        bots: /* @__PURE__ */ new Map(),
        maxPlayers: 80,
        // Increased from 8 to 80
        gameState: {
          players: /* @__PURE__ */ new Map(),
          food: [],
          lastUpdate: Date.now(),
          arenaSize: calculateArenaSize(15)
          // Initial arena size for 15 bots
        }
      };
      gameRooms.set(roomKey, room);
      createBots(room, 15);
      console.log(`Created room ${region}/${id} with capacity 80 players and 15 bots`);
    }
  }
  function calculateArenaSize(playerCount) {
    const baseSize = 2e3;
    const minSize = 1500;
    const maxSize = 4e3;
    if (playerCount <= 1) return { width: minSize, height: minSize };
    if (playerCount >= 80) return { width: maxSize, height: maxSize };
    const scaleFactor = (playerCount - 1) / 79;
    const currentSize = minSize + (maxSize - minSize) * scaleFactor;
    return {
      width: Math.round(currentSize),
      height: Math.round(currentSize)
    };
  }
  function updateArenaSize(room) {
    const totalCount = room.players.size + (room.bots ? room.bots.size : 0);
    const newArenaSize = calculateArenaSize(totalCount);
    const currentArena = room.gameState.arenaSize;
    const sizeDifference = Math.abs(currentArena.width - newArenaSize.width);
    if (sizeDifference >= 50) {
      room.gameState.arenaSize = newArenaSize;
      const arenaSizeMessage = JSON.stringify({
        type: "arenaSize",
        arenaSize: newArenaSize,
        playerCount: totalCount
      });
      room.players.forEach((playerData, playerId) => {
        if (playerData.ws && playerData.ws.readyState === 1) {
          playerData.ws.send(arenaSizeMessage);
        }
      });
      console.log(`Updated arena size for room ${room.region}:${room.id} to ${newArenaSize.width}x${newArenaSize.height} (${room.players.size} players + ${room.bots ? room.bots.size : 0} bots)`);
    }
  }
  function createBots(room, count) {
    const botNames = [
      "SnakeBot_Alpha",
      "SnakeBot_Beta",
      "SnakeBot_Gamma",
      "SnakeBot_Delta",
      "SnakeBot_Epsilon",
      "SnakeBot_Zeta",
      "SnakeBot_Eta",
      "SnakeBot_Theta",
      "SnakeBot_Iota",
      "SnakeBot_Kappa",
      "SnakeBot_Lambda",
      "SnakeBot_Mu",
      "SnakeBot_Nu",
      "SnakeBot_Xi",
      "SnakeBot_Omicron",
      "SnakeBot_Pi",
      "SnakeBot_Rho",
      "SnakeBot_Sigma",
      "SnakeBot_Tau",
      "SnakeBot_Upsilon"
    ];
    const botColors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff", "#fd79a8"];
    for (let i = 0; i < count; i++) {
      const botId = `bot_${room.region}_${room.id}_${i}`;
      const centerX = 2e3;
      const centerY = 2e3;
      const radius = Math.min(room.gameState.arenaSize.width, room.gameState.arenaSize.height) / 2;
      const angle = i / count * Math.PI * 2;
      const spawnRadius = radius * 0.3 + Math.random() * radius * 0.4;
      const spawnX = centerX + Math.cos(angle) * spawnRadius;
      const spawnY = centerY + Math.sin(angle) * spawnRadius;
      const bot = {
        id: botId,
        name: botNames[i % botNames.length],
        segments: [{ x: spawnX, y: spawnY }],
        color: botColors[i % botColors.length],
        mass: 15 + Math.random() * 20,
        direction: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 0.5,
        targetX: spawnX,
        targetY: spawnY,
        lastDirectionChange: Date.now(),
        isBot: true,
        money: 1,
        segmentRadius: 10,
        cashingOut: false,
        cashOutProgress: 0
      };
      room.bots.set(botId, bot);
      room.gameState.players.set(botId, bot);
    }
    console.log(`Created ${count} bots in room ${room.region}/${room.id}`);
  }
  function updateBots(room) {
    if (!room.bots) return;
    const currentTime = Date.now();
    const centerX = 2e3;
    const centerY = 2e3;
    const radius = Math.min(room.gameState.arenaSize.width, room.gameState.arenaSize.height) / 2;
    room.bots.forEach((bot) => {
      const distToTarget = Math.sqrt((bot.segments[0].x - bot.targetX) ** 2 + (bot.segments[0].y - bot.targetY) ** 2);
      if (distToTarget < 50 || currentTime - bot.lastDirectionChange > 3e3 + Math.random() * 2e3) {
        const targetAngle = Math.random() * Math.PI * 2;
        const targetRadius = Math.random() * radius * 0.8;
        bot.targetX = centerX + Math.cos(targetAngle) * targetRadius;
        bot.targetY = centerY + Math.sin(targetAngle) * targetRadius;
        bot.lastDirectionChange = currentTime;
      }
      const directionToTarget = Math.atan2(bot.targetY - bot.segments[0].y, bot.targetX - bot.segments[0].x);
      bot.direction = directionToTarget;
      const newX = bot.segments[0].x + Math.cos(bot.direction) * bot.speed;
      const newY = bot.segments[0].y + Math.sin(bot.direction) * bot.speed;
      const distFromCenter = Math.sqrt((newX - centerX) ** 2 + (newY - centerY) ** 2);
      if (distFromCenter > radius - 50) {
        bot.direction = Math.atan2(centerY - bot.segments[0].y, centerX - bot.segments[0].x);
        bot.targetX = centerX;
        bot.targetY = centerY;
      }
      const head = { x: newX, y: newY };
      bot.segments.unshift(head);
      const maxSegments = Math.floor(bot.mass / 3);
      if (bot.segments.length > maxSegments) {
        bot.segments = bot.segments.slice(0, maxSegments);
      }
      room.gameState.players.set(bot.id, bot);
    });
  }
  function findSafeSpawnPosition(room) {
    const arenaSize = room.gameState.arenaSize;
    const centerX = arenaSize.width / 2;
    const centerY = arenaSize.height / 2;
    const radius = Math.min(arenaSize.width, arenaSize.height) * 0.45;
    const minDistance = 300;
    const existingPlayers = Array.from(room.gameState.players.values()).filter(
      (p) => p.segments && p.segments.length > 0
    );
    const isPositionSafe = (x, y) => {
      for (const player of existingPlayers) {
        if (player.segments && player.segments.length > 0) {
          const headX = player.segments[0]?.x || 0;
          const headY = player.segments[0]?.y || 0;
          const distance = Math.sqrt((x - headX) ** 2 + (y - headY) ** 2);
          if (distance < minDistance) {
            return false;
          }
        }
      }
      return true;
    };
    const gridSize = 8;
    const cellWidth = arenaSize.width / gridSize;
    const cellHeight = arenaSize.height / gridSize;
    const densityMap = [];
    for (let i = 0; i < gridSize; i++) {
      densityMap[i] = [];
      for (let j = 0; j < gridSize; j++) {
        densityMap[i][j] = 0;
      }
    }
    for (const player of existingPlayers) {
      if (player.segments && player.segments.length > 0) {
        const headX = player.segments[0]?.x || centerX;
        const headY = player.segments[0]?.y || centerY;
        const gridX = Math.floor((headX - (centerX - arenaSize.width / 2)) / cellWidth);
        const gridY = Math.floor((headY - (centerY - arenaSize.height / 2)) / cellHeight);
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
          densityMap[gridX][gridY]++;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const nx = gridX + dx;
              const ny = gridY + dy;
              if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                densityMap[nx][ny] += 0.5;
              }
            }
          }
        }
      }
    }
    const lowDensityCells = [];
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        lowDensityCells.push({ x: i, y: j, density: densityMap[i][j] });
      }
    }
    lowDensityCells.sort((a, b) => a.density - b.density);
    for (const cell of lowDensityCells) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const cellCenterX = centerX - arenaSize.width / 2 + (cell.x + 0.5) * cellWidth;
        const cellCenterY = centerY - arenaSize.height / 2 + (cell.y + 0.5) * cellHeight;
        const offsetX = (Math.random() - 0.5) * cellWidth * 0.8;
        const offsetY = (Math.random() - 0.5) * cellHeight * 0.8;
        const spawnX2 = cellCenterX + offsetX;
        const spawnY2 = cellCenterY + offsetY;
        const distFromCenter = Math.sqrt((spawnX2 - centerX) ** 2 + (spawnY2 - centerY) ** 2);
        if (distFromCenter <= radius - 50 && isPositionSafe(spawnX2, spawnY2)) {
          return { x: spawnX2, y: spawnY2, isOuterRing: false };
        }
      }
    }
    const outerRadius = radius + 100;
    const angle = Math.random() * Math.PI * 2;
    const spawnX = centerX + Math.cos(angle) * outerRadius;
    const spawnY = centerY + Math.sin(angle) * outerRadius;
    console.log(`\u26A0\uFE0F No safe spawn found, spawning in outer ring at (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);
    return { x: spawnX, y: spawnY, isOuterRing: true };
  }
  function findBestRoom(region) {
    for (const [key, room] of gameRooms.entries()) {
      if (room.region === region && room.players.size < room.maxPlayers) {
        return room;
      }
    }
    const newRoomId = gameRooms.size + 1;
    createRoom(region, newRoomId);
    return gameRooms.get(`${region}:${newRoomId}`);
  }
  const wss = new import_ws.WebSocketServer({
    server: httpServer2,
    path: "/ws"
  });
  if (gameRooms.size === 0) {
    createRoom("us", 1);
    createRoom("eu", 1);
  }
  wss.on("connection", function connection2(ws, req) {
    const playerId = `player_${Date.now()}_${Math.random()}`;
    console.log(`Player ${playerId} attempting to join. Total WebSocket connections: ${wss.clients.size}`);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedRoomId = parseInt(url.searchParams.get("room") || "1");
    const requestedRegion = url.searchParams.get("region") || "us";
    if (requestedRegion !== "us" && requestedRegion !== "eu") {
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid region"
      }));
      ws.close();
      return;
    }
    let targetRoom = findBestRoom(requestedRegion);
    if (targetRoom.players.size >= targetRoom.maxPlayers) {
      ws.send(JSON.stringify({
        type: "error",
        message: "Room is full"
      }));
      ws.close();
      return;
    }
    ws.playerId = playerId;
    ws.roomId = targetRoom.id;
    ws.region = targetRoom.region;
    const finalRoomKey = `${targetRoom.region}:${targetRoom.id}`;
    playerToRoom.set(playerId, finalRoomKey);
    console.log(`Player ${playerId} joined room ${targetRoom.region}/${targetRoom.id}. Room players: ${targetRoom.players.size + 1}/${targetRoom.maxPlayers}`);
    const spawnPosition = findSafeSpawnPosition(targetRoom);
    const colors = ["#d55400", "#4ecdc4", "#ff6b6b", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff"];
    const playerColor = colors[targetRoom.players.size % colors.length];
    const player = {
      id: playerId,
      segments: [{ x: spawnPosition.x, y: spawnPosition.y }],
      // Start with spawn position
      color: playerColor,
      mass: 20,
      direction: 0,
      speed: 2,
      spawnTime: Date.now(),
      isGhost: true,
      // Start in ghost mode
      isOuterRing: spawnPosition.isOuterRing,
      spawnX: spawnPosition.x,
      spawnY: spawnPosition.y
    };
    targetRoom.players.set(playerId, player);
    targetRoom.gameState.players.set(playerId, player);
    updateArenaSize(targetRoom);
    const broadcastPlayerList = () => {
      const players = Array.from(targetRoom.gameState.players.values());
      const message = JSON.stringify({
        type: "players",
        players
      });
      targetRoom.players.forEach((_, pid) => {
        const playerWs = Array.from(wss.clients).find((client) => client.playerId === pid);
        if (playerWs && playerWs.readyState === 1) {
          playerWs.send(message);
        }
      });
    };
    ws.send(JSON.stringify({
      type: "welcome",
      playerId,
      room: finalRoomKey,
      playerCount: targetRoom.players.size + (targetRoom.bots ? targetRoom.bots.size : 0),
      arenaSize: targetRoom.gameState.arenaSize
    }));
    broadcastPlayerList();
    ws.on("message", function message(data) {
      try {
        const message2 = JSON.parse(data.toString());
        if (message2.type === "playerUpdate") {
          const player2 = targetRoom.players.get(playerId);
          if (player2) {
            if (player2.isGhost && (message2.data.segments || message2.data.direction !== void 0)) {
              player2.isGhost = false;
              console.log(`\u{1F47B} Player ${playerId} exited ghost mode (moved)`);
            }
            Object.assign(player2, message2.data);
            targetRoom.gameState.players.set(playerId, player2);
          }
        } else if (message2.type === "boost") {
          const player2 = targetRoom.players.get(playerId);
          if (player2 && player2.isGhost) {
            player2.isGhost = false;
            console.log(`\u{1F47B} Player ${playerId} exited ghost mode (boosted)`);
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    });
    ws.on("close", function close(code, reason) {
      console.log(`Player ${playerId} left room ${finalRoomKey}. Code: ${code}, Reason: ${reason.toString()}`);
      if (targetRoom.players.has(playerId)) {
        targetRoom.players.delete(playerId);
        targetRoom.gameState.players.delete(playerId);
      }
      playerToRoom.delete(playerId);
      console.log(`Room ${finalRoomKey} now has ${targetRoom.players.size}/${targetRoom.maxPlayers} players`);
      updateArenaSize(targetRoom);
      broadcastPlayerList();
    });
    const gameLoop = setInterval(() => {
      if (ws.readyState === 1) {
        const players = Array.from(targetRoom.gameState.players.values());
        ws.send(JSON.stringify({
          type: "players",
          players
        }));
      } else {
        clearInterval(gameLoop);
      }
    }, 50);
  });
  setInterval(() => {
    const currentTime = Date.now();
    gameRooms.forEach((room) => {
      let hasUpdates = false;
      room.players.forEach((player, playerId) => {
        if (player.isGhost && currentTime - player.spawnTime > 1500) {
          player.isGhost = false;
          hasUpdates = true;
          console.log(`\u{1F47B} Player ${playerId} ghost mode expired after 1.5s`);
        }
        if (player.isOuterRing && player.segments && player.segments.length > 0) {
          const arenaSize = room.gameState.arenaSize;
          const centerX = arenaSize.width / 2;
          const centerY = arenaSize.height / 2;
          const radius = Math.min(arenaSize.width, arenaSize.height) * 0.45;
          const headX = player.segments[0].x;
          const headY = player.segments[0].y;
          const distFromCenter = Math.sqrt((headX - centerX) ** 2 + (headY - centerY) ** 2);
          if (distFromCenter > radius - 50) {
            const slideSpeed = 2;
            const angle = Math.atan2(centerY - headY, centerX - headX);
            const newX = headX + Math.cos(angle) * slideSpeed;
            const newY = headY + Math.sin(angle) * slideSpeed;
            player.segments[0].x = newX;
            player.segments[0].y = newY;
            hasUpdates = true;
          } else {
            player.isOuterRing = false;
            hasUpdates = true;
            console.log(`\u{1F3DF}\uFE0F Player ${playerId} slid into arena`);
          }
        }
      });
      if (hasUpdates) {
        const players = Array.from(room.gameState.players.values());
        const message = JSON.stringify({
          type: "players",
          players
        });
        room.players.forEach((_, pid) => {
          const playerWs = Array.from(wss.clients).find((client) => client.playerId === pid);
          if (playerWs && playerWs.readyState === 1) {
            playerWs.send(message);
          }
        });
      }
    });
  }, 100);
  setInterval(() => {
    gameRooms.forEach((room) => {
      const currentBotCount = room.bots ? room.bots.size : 0;
      const minBots = 15;
      if (currentBotCount < minBots) {
        if (!room.bots) {
          room.bots = /* @__PURE__ */ new Map();
        }
        const botsToAdd = minBots - currentBotCount;
        createBots(room, botsToAdd);
        updateArenaSize(room);
      }
      updateBots(room);
      if (room.players.size > 0) {
        const allPlayers = Array.from(room.gameState.players.values());
        const message = JSON.stringify({
          type: "players",
          players: allPlayers
        });
        room.players.forEach((_, playerId) => {
          const playerWs = Array.from(wss.clients).find((client) => client.playerId === playerId);
          if (playerWs && playerWs.readyState === 1) {
            playerWs.send(message);
          }
        });
      }
    });
  }, 200);
  return httpServer2;
}

// server/production.ts
var app = (0, import_express.default)();
var httpServer = (0, import_http2.createServer)(app);
var isProduction = process.env.NODE_ENV === "production";
var io = new import_socket.Server(httpServer, {
  path: "/socket.io",
  // default, matches socket.io-client
  cors: {
    origin: isProduction ? [
      process.env.FRONTEND_URL || "https://harmonious-boba-11ae9e.netlify.app",
      "https://harmonious-boba-11ae9e.netlify.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ] : ["http://localhost:5173", "http://localhost:3000", "*"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
var onlineUsers = /* @__PURE__ */ new Map();
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("join", (username) => {
    if (!username) return;
    onlineUsers.set(username, socket.id);
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });
  socket.on("invite", ({ from, to, roomId, region }) => {
    const toSocketId = onlineUsers.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit("game-invite", { from, roomId, region });
    }
  });
  socket.on("accept-invite", ({ from, to, roomId, region }) => {
    const fromSocketId = onlineUsers.get(from);
    if (fromSocketId) {
      io.to(fromSocketId).emit("invite-accepted", { to, roomId, region });
    }
  });
  socket.on("disconnect", () => {
    onlineUsers.forEach((id, username) => {
      if (id === socket.id) onlineUsers.delete(username);
    });
    io.emit("online-users", Array.from(onlineUsers.keys()));
    console.log("User disconnected:", socket.id);
  });
});
app.use((req, res, next) => {
  const allowedOrigins = isProduction ? [
    process.env.FRONTEND_URL || "https://harmonious-boba-11ae9e.netlify.app",
    "https://harmonious-boba-11ae9e.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ] : ["*"];
  const origin = req.get("origin");
  if (allowedOrigins.includes("*") || origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});
app.use(import_express.default.json({ limit: "10mb" }));
app.use(import_express.default.urlencoded({ extended: false, limit: "10mb" }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: process.env.NODE_ENV || "production"
  });
});
app.use(import_express.default.static("public"));
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (isProduction) console.error("Production error:", err);
    res.status(status).json({ message: isProduction ? "Internal Server Error" : message });
  });
  const port = parseInt(process.env.PORT || "5174", 10);
  const host = "0.0.0.0";
  httpServer.listen(port, host, () => {
    console.log(`\u{1F680} Server running in ${isProduction ? "PRODUCTION" : "DEVELOPMENT"} mode`);
    console.log(`\u{1F310} Listening on ${host}:${port}`);
    console.log(`\u{1F4CA} Health check: http://localhost:${port}/health`);
  });
})();
