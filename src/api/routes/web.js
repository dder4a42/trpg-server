// API layer: Web page routes
// Serves HTML pages using Pug templates with HTMX
import { Router } from 'express';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import { parseMarkdown } from '@/utils/markdown.js';
import { GameStateManager } from '@/application/game/GameStateManager.js';
const router = Router();
// Auth module injection (set by app.ts)
let authModule = null;
export function setAuthModule(module) {
    authModule = module;
}
// Helper to check if user is authenticated
async function requireAuth(req, res, next) {
    // Use injected authModule if available (Clean Architecture)
    if (authModule) {
        return authModule.requireAuth(req, res, next);
    }
    // Fallback to direct DatabaseService access (for backward compatibility)
    const sessionId = req.cookies?.sessionId || req.headers.authorization?.slice(7);
    if (!sessionId) {
        return res.redirect('/login');
    }
    const dbService = DatabaseService.getInstance();
    const session = await dbService.userSessions.findById(sessionId);
    if (!session || session.expiresAt < new Date()) {
        if (session)
            await dbService.userSessions.delete(sessionId);
        res.clearCookie('sessionId');
        return res.redirect('/login');
    }
    const user = await dbService.users.findById(session.userId);
    if (!user || !user.isActive) {
        res.clearCookie('sessionId');
        return res.redirect('/login');
    }
    req.user = user;
    req.sessionId = sessionId;
    next();
}
// Helper function to get member display name
async function getMemberName(room, userId) {
    const members = await room.getMembers();
    const member = members.find(m => m.userId === userId);
    return member?.characterName || member?.username;
}
// In-memory room reference (shared with rooms.ts)
// In production, rooms are managed by Room class with persistent storage
const rooms = new Map();
// Helper function to check if user is admin (uses injected authModule or fallback)
function isAdminCheck(user) {
    if (authModule) {
        return authModule.isAdmin(user);
    }
    // Fallback to environment variable check
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    return !!user && !!ADMIN_USERNAME && user.username === ADMIN_USERNAME;
}
function generateRoomId() {
    return `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
/**
 * Helper function to render conversation history with markdown
 * Eliminates duplicate code between game page and story partial routes
 */
async function renderConversationHistory(history) {
    const rendered = await Promise.all(history.map(async (turn) => {
        const userContent = await parseMarkdown(turn.userInputs.map(action => {
            if (action.characterName) {
                return `[${action.characterName}] ${action.action}`;
            }
            else {
                return `[${action.username}] ${action.action}`;
            }
        }).join('\n'));
        const assistantContent = await parseMarkdown(turn.assistantResponse);
        return [
            { role: 'user', content: userContent },
            { role: 'assistant', content: assistantContent }
        ];
    }));
    return rendered.flat();
}
async function ensureRoom(roomId) {
    let room = rooms.get(roomId);
    if (room)
        return room;
    const { Room } = await import('../../application/room/Room.js');
    const { RoomFactory } = await import('../../infrastructure/room/RoomFactory.js');
    const roomDefaults = RoomFactory.getRoomDefaults();
    const deps = RoomFactory.createDependencies(roomId);
    room = new Room(roomId, {
        moduleName: 'default',
        maxPlayers: roomDefaults.maxPlayers,
        maxHistoryTurns: roomDefaults.maxHistoryTurns,
    }, deps);
    await room.initialize();
    // Load conversation history from database
    await room.load();
    rooms.set(roomId, room);
    const dbService = DatabaseService.getInstance();
    await dbService.rooms.saveRoom(room);
    return room;
}
// Middleware to check if room exists
function getRoomOr404(roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    return room;
}
// ========== Page Routes ==========
// Login page (public)
router.get('/login', (req, res) => {
    // If already logged in, redirect to home
    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
        return res.redirect('/');
    }
    res.render('login/index', { title: 'Login - TRPG' });
});
// Home page - protected
router.get('/', requireAuth, async (req, res) => {
    const dbService = DatabaseService.getInstance();
    // Get user's active rooms (instead of relying on currentRoomId)
    const userRooms = await dbService.roomMemberships.getUserRooms(req.user.id);
    const activeRoom = userRooms.length > 0
        ? dbService.rooms.getRoomById(userRooms[0].roomId)
        : null;
    res.render('index', {
        title: 'TRPG Game',
        user: req.user,
        isAdmin: isAdminCheck(req.user),
        boundRoom: activeRoom,
    });
});
// Game lobby - protected
router.get('/lobby', requireAuth, async (req, res) => {
    const dbService = DatabaseService.getInstance();
    const activeRooms = dbService.rooms.listRooms(true);
    const roomsForLobby = [];
    const userId = req.user?.id ?? '';
    for (const room of activeRooms) {
        // Check if user is a member of this room
        const isMember = userId ? await dbService.roomMemberships.isUserInRoom(room.id, userId) : false;
        // Visibility rule:
        // - OPEN rooms are visible to everyone
        // - initialized rooms (READY/IN_GAME/SUSPENDED) are visible to members
        if (room.initializedAt && !isMember) {
            continue;
        }
        const memberCount = await dbService.roomMemberships.getActiveMemberCount(room.id);
        const turnCount = dbService.conversations.countTurns(room.id);
        // Only show rooms that haven't started or have active members
        if (turnCount === 0 || memberCount > 0) {
            // Create room data object without spreading the interface
            roomsForLobby.push({
                id: room.id,
                moduleName: room.moduleName,
                createdAt: room.createdAt,
                lastActivityAt: room.lastActivityAt,
                isActive: room.isActive,
                maxPlayers: room.maxPlayers,
                maxHistoryTurns: room.maxHistoryTurns,
                lifecycleState: room.lifecycleState,
                ownerId: room.ownerId,
                initializedAt: room.initializedAt,
                boundMemberIds: room.boundMemberIds,
                memberCount,
                turnCount,
                isFull: memberCount >= room.maxPlayers,
                isMember, // Include membership info for template
            });
        }
    }
    res.render('lobby/index', {
        title: 'Game Lobby',
        user: req.user,
        isAdmin: isAdminCheck(req.user),
        rooms: roomsForLobby,
        error: req.query.error,
    });
});
// Create room from lobby
router.post('/lobby/create', requireAuth, async (req, res) => {
    const roomId = generateRoomId();
    await ensureRoom(roomId);
    const dbService = DatabaseService.getInstance();
    if (req.user) {
        await dbService.roomMemberships.joinRoom(roomId, req.user.id);
        // Set the room owner
        await dbService.rooms.setOwner(roomId, req.user.id);
    }
    // Redirect to ready room instead of game
    res.redirect(`/api/ready-room/${roomId}`);
});
// Join room from lobby
router.post('/lobby/join', requireAuth, async (req, res) => {
    const roomId = String(req.body?.roomId || '').trim();
    if (!roomId) {
        return res.redirect('/lobby?error=ROOM_ID_REQUIRED');
    }
    const dbService = DatabaseService.getInstance();
    const roomRecord = dbService.rooms.getRoomById(roomId);
    if (!roomRecord) {
        return res.redirect('/lobby?error=ROOM_NOT_FOUND');
    }
    // Check if user is already a member
    const isMember = req.user ? await dbService.roomMemberships.isUserInRoom(roomId, req.user.id) : false;
    // Join rule for initialized rooms: only members can join (resume) or new players can join OPEN rooms
    if (roomRecord.initializedAt && !isMember) {
        return res.redirect('/lobby?error=ROOM_FORBIDDEN');
    }
    // Suspended rooms can only be resumed by the owner
    if (roomRecord.lifecycleState === 'SUSPENDED') {
        const ownerId = dbService.rooms.getOwnerId(roomId);
        if (ownerId !== req.user?.id) {
            return res.redirect('/lobby?error=ROOM_SUSPENDED');
        }
    }
    // Check capacity
    const memberCount = await dbService.roomMemberships.getActiveMemberCount(roomId);
    if (memberCount >= roomRecord.maxPlayers && !isMember) {
        return res.redirect('/lobby?error=ROOM_FULL');
    }
    // Join the room (if not already a member)
    if (req.user && !isMember) {
        await dbService.roomMemberships.joinRoom(roomId, req.user.id);
    }
    // Redirect to ready room
    res.redirect(`/api/ready-room/${roomId}`);
});
// Game page redirect (create a new room if no roomId provided) - protected
router.get('/game', requireAuth, (req, res) => {
    // Generate a new room ID and redirect
    const roomId = generateRoomId();
    res.redirect(`/game/${roomId}`);
});
// New game shortcut (same as /game)
router.get('/game/new', requireAuth, (req, res) => {
    // Generate a new room ID and redirect
    const roomId = generateRoomId();
    res.redirect(`/game/${roomId}`);
});
// Game page (main gameplay interface) - protected
router.get('/game/:roomId', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const dbService = DatabaseService.getInstance();
    const roomRecord = dbService.rooms.getRoomById(roomId);
    if (!roomRecord) {
        return res.redirect(`/api/ready-room/${roomId}`);
    }
    // Access rule for initialized rooms: only actual members can access
    const isUserInRoom = await dbService.roomMemberships.isUserInRoom(roomId, req.user.id);
    if (roomRecord.initializedAt && !isUserInRoom) {
        return res.redirect('/lobby?error=ROOM_FORBIDDEN');
    }
    // If suspended, everyone should be in lobby
    if (roomRecord.lifecycleState === 'SUSPENDED') {
        return res.redirect('/lobby?error=ROOM_SUSPENDED');
    }
    // If not in game, redirect to ready room
    if (!roomRecord.gameStarted || roomRecord.lifecycleState !== 'IN_GAME') {
        return res.redirect(`/api/ready-room/${roomId}`);
    }
    // Create room if it doesn't exist in memory (lazy creation)
    const room = await ensureRoom(roomId);
    if (req.user) {
        // Join room via membership system if not already joined
        const alreadyInRoom = await dbService.roomMemberships.isUserInRoom(roomId, req.user.id);
        if (!alreadyInRoom) {
            await dbService.roomMemberships.joinRoom(roomId, req.user.id);
        }
    }
    // Get room data for template
    const history = room.getConversationHistory().getRecent(10);
    const statusBar = room.getStatusBarManager().getStatusBar();
    const ownerId = dbService.rooms.getOwnerId(roomId);
    const isOwner = ownerId !== null && req.user?.id === ownerId;
    // Get user's selected character for this room
    let character = null;
    if (req.user) {
        const membership = await dbService.roomMemberships.getRoomMembers(roomId);
        const userMembership = membership.find(m => m.userId === req.user.id);
        if (userMembership && userMembership.characterId) {
            character = dbService.characters.findById(userMembership.characterId);
        }
    }
    // Build player notes with resolved names
    const playerNotesRaw = room.getAllPlayerNotes();
    const playerNotes = [];
    for (const [userId, notes] of playerNotesRaw.entries()) {
        const name = await getMemberName(room, userId);
        const mappedNotes = notes.map((note) => ({
            id: note.id,
            content: note.content,
            createdAt: note.createdAt,
        }));
        playerNotes.push({
            userId,
            name: name || `Player ${userId.slice(0, 4)}`,
            notes: mappedNotes,
        });
    }
    // Pre-render history markdown
    const renderedHistory = await renderConversationHistory(history);
    res.render('game/index', {
        title: `Game - ${roomId}`,
        roomId,
        user: req.user,
        isAdmin: isAdminCheck(req.user),
        ownerId,
        isOwner,
        history: renderedHistory,
        statusBar,
        playerNotes,
        currentUserId: req.user?.id,
        character,
    });
}));
// Character selection page - protected
router.get('/characters', requireAuth, (req, res) => {
    // Get user's characters from persistent storage
    const characterRepo = DatabaseService.getInstance().characters;
    const result = characterRepo.list({ userId: req.user.id, limit: 100 });
    res.render('characters/index', {
        title: 'Characters',
        user: req.user,
        isAdmin: isAdminCheck(req.user),
        characters: result.characters.map((char) => ({
            _id: char.id,
            name: char.name,
            race: char.race,
            characterClass: char.characterClass,
            level: char.level,
            maxHp: char.maxHp,
            currentHp: char.currentHp,
            armorClass: char.armorClass,
            abilityScores: char.abilityScores,
            alignment: char.alignment,
            background: char.background,
            appearance: char.appearance,
            personalityTraits: char.personalityTraits,
            backstory: char.backstory,
            statusEffects: char.statusEffects,
        })),
    });
});
// Create character page - protected
router.get('/characters/create', requireAuth, (req, res) => {
    res.render('characters/create', {
        title: 'Create Character',
        user: req.user,
        isAdmin: isAdminCheck(req.user),
    });
});
// Owner suspends room and returns everyone to lobby
router.post('/game/:roomId/suspend', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const dbService = DatabaseService.getInstance();
    const ownerId = dbService.rooms.getOwnerId(roomId);
    if (!req.user || ownerId !== req.user.id) {
        return res.redirect(`/game/${roomId}?error=FORBIDDEN`);
    }
    await dbService.rooms.suspendRoom(roomId);
    // Bindings are stored in roomMemberships table, so bound members can see/rejoin later
    return res.redirect('/lobby');
}));
// ========== HTMX Partial Routes ==========
// Get recent room history partial (now using fetch)
router.get('/partials/room/:roomId/story', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const room = getRoomOr404(roomId);
    const history = room.getConversationHistory().getRecent(5);
    // Pre-render history markdown
    const renderedHistory = await renderConversationHistory(history);
    res.render('partials/story', {
        history: renderedHistory,
        layout: false, // Render without layout for partial use
    });
}));
// Get save menu partial
router.get('/partials/room/:roomId/saves', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const room = getRoomOr404(roomId);
    const dbService = DatabaseService.getInstance();
    const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
    const slots = await gameStateManager.listSlots(room.id);
    res.render('partials/save-menu', {
        slots,
        layout: false,
    });
}));
// Get status bar partial
router.get('/partials/room/:roomId/status', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const dbService = DatabaseService.getInstance();
    // Get room from database to ensure we have the latest data
    const roomRecord = dbService.rooms.getRoomById(roomId);
    if (!roomRecord) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    // Get or create room instance for status bar data
    const room = getRoomOr404(roomId);
    const statusBar = room.getStatusBarManager().getStatusBar();
    const playerNotes = [];
    const playerNotesRaw = room.getAllPlayerNotes();
    for (const [userId, notes] of playerNotesRaw.entries()) {
        const user = await dbService.users.findById(userId);
        const name = user?.username || `Player ${userId.slice(0, 4)}`;
        const mappedNotes = notes.map((note) => ({
            id: note.id,
            content: note.content,
            createdAt: note.createdAt,
        }));
        playerNotes.push({
            userId,
            name,
            notes: mappedNotes,
        });
    }
    res.render('partials/status-bar', {
        statusBar,
        playerNotes,
        roomId,
        currentUserId: req.user?.id,
        layout: false,
    });
}));
// Export rooms map for sharing with other routes
export function getRoomsMap() {
    return rooms;
}
export default router;
