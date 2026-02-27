// API layer: Ready Room routes
// Pre-game lobby where users select characters and indicate readiness before starting the game
import { Router } from 'express';
import { asyncHandler } from '@/api/middleware/errorHandler.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
const router = Router();
function wantsJson(req) {
    const accept = String(req.headers.accept || '');
    return accept.includes('application/json');
}
async function buildReadyRoomState(req, roomId) {
    const db = DatabaseService.getInstance();
    const room = db.rooms.getRoomById(roomId);
    if (!room) {
        const err = new Error('Room Not Found');
        err.statusCode = 404;
        err.code = 'ROOM_NOT_FOUND';
        throw err;
    }
    const ownerId = db.rooms.getOwnerId(roomId);
    const isOwner = ownerId === req.user?.id;
    const isRoomMember = await db.roomMemberships.isUserInRoom(roomId, req.user.id);
    if (room.lifecycleState === 'IN_GAME' || room.gameStarted) {
        // Let caller decide redirect
    }
    if (room.lifecycleState === 'SUSPENDED') {
        if (isOwner) {
            await db.rooms.setRoomReady(roomId);
        }
    }
    // READY rooms are only accessible to room members (or owner)
    if (room.lifecycleState === 'READY' && !isRoomMember && !isOwner) {
        const err = new Error('Forbidden');
        err.statusCode = 403;
        err.code = 'ROOM_FORBIDDEN';
        throw err;
    }
    const members = await db.roomMemberships.getRoomMembers(roomId);
    // Ensure current user is joined (OPEN only)
    let userMembership = members.find((m) => m.userId === req.user?.id);
    let membersToUse = members;
    if (!userMembership) {
        if (req.user && room.lifecycleState !== 'READY') {
            await db.roomMemberships.joinRoom(roomId, req.user.id);
            membersToUse = await db.roomMemberships.getRoomMembers(roomId);
            userMembership = membersToUse.find((m) => m.userId === req.user.id);
        }
    }
    if (!userMembership) {
        const err = new Error('Not in room');
        err.statusCode = 403;
        err.code = 'NOT_IN_ROOM';
        throw err;
    }
    const userCharactersResult = req.user
        ? db.characters.list({ userId: req.user.id, limit: 100 })
        : { characters: [] };
    const enrichedMembers = await Promise.all(membersToUse.map(async (member) => {
        const user = await db.users.findById(member.userId);
        let characterName = null;
        if (member.characterId) {
            const character = db.characters.findById(member.characterId);
            if (character)
                characterName = character.name;
        }
        return {
            id: member.id,
            userId: member.userId,
            username: user?.username || 'Unknown',
            characterId: member.characterId,
            characterName,
            isReady: member.isReady === true,
            isActive: member.isActive === true,
        };
    }));
    let selectedCharacterName = null;
    if (userMembership.characterId) {
        const selectedChar = db.characters.findById(userMembership.characterId);
        selectedCharacterName = selectedChar ? selectedChar.name : null;
    }
    const ownerMembership = ownerId ? await db.roomMemberships.getMembership(roomId, ownerId) : null;
    const ownerReady = !!(ownerMembership && ownerMembership.isReady && ownerMembership.characterId);
    // Start enablement rule:
    // - OPEN: owner must be ready
    // - READY: all bound members must be present + ready + selected character
    let canStart = false;
    if (room.lifecycleState === 'READY' || room.initializedAt) {
        const boundIds = room.boundMemberIds || [];
        canStart = boundIds.length > 0 && boundIds.every((uid) => {
            const m = enrichedMembers.find((x) => x.userId === uid);
            return !!(m && m.isActive && m.isReady && m.characterId);
        });
    }
    else {
        canStart = ownerReady;
    }
    return {
        room: {
            id: roomId,
            ownerId,
            moduleName: room.moduleName,
            lifecycleState: room.lifecycleState,
            initializedAt: room.initializedAt,
            suspendedAt: room.suspendedAt,
            gameStarted: room.gameStarted,
            boundMemberIds: room.boundMemberIds || [],
        },
        currentUser: {
            id: req.user.id,
            username: req.user.username,
            isOwner,
        },
        members: enrichedMembers,
        userMembership: {
            characterId: userMembership.characterId,
            isReady: userMembership.isReady === true,
        },
        userCharacters: userCharactersResult.characters,
        selectedCharacterName,
        canStart,
    };
}
async function renderReadyRoom(req, res) {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    const roomRecord = db.rooms.getRoomById(roomId);
    if (roomRecord && (roomRecord.lifecycleState === 'IN_GAME' || roomRecord.gameStarted)) {
        return res.redirect(`/game/${roomId}`);
    }
    try {
        const state = await buildReadyRoomState(req, roomId);
        return res.render('ready-room/index', {
            roomId,
            room: roomRecord,
            isOwner: state.currentUser.isOwner,
            ownerId: state.room.ownerId,
            members: state.members,
            userMembership: state.userMembership,
            userCharacters: state.userCharacters,
            isReady: state.userMembership.isReady,
            user: req.user,
            selectedCharacterName: state.selectedCharacterName,
            moduleName: state.room.moduleName,
            lifecycleState: state.room.lifecycleState,
            canStart: state.canStart,
        });
    }
    catch (e) {
        const code = e?.code;
        if (code === 'ROOM_FORBIDDEN')
            return res.redirect('/lobby?error=ROOM_FORBIDDEN');
        if (code === 'ROOM_NOT_FOUND')
            return res.redirect('/lobby?error=ROOM_NOT_FOUND');
        if (code === 'NOT_IN_ROOM')
            return res.redirect('/lobby');
        if (code === 'ROOM_SUSPENDED')
            return res.redirect('/lobby?error=ROOM_SUSPENDED');
        throw e;
    }
}
// GET /api/ready-room/:roomId - Ready room page
router.get('/:roomId', asyncHandler(renderReadyRoom));
// GET /api/ready-room/:roomId/state - JSON view model for state-driven frontend
router.get('/:roomId/state', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    const roomRecord = db.rooms.getRoomById(roomId);
    if (roomRecord && (roomRecord.lifecycleState === 'IN_GAME' || roomRecord.gameStarted)) {
        return res.json({ success: true, redirect: `/game/${roomId}` });
    }
    const state = await buildReadyRoomState(req, roomId);
    res.json({ success: true, state });
}));
// POST /api/ready-room/:roomId/module - owner-only module change (pre-initialization)
router.post('/:roomId/module', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const moduleName = String(req.body?.moduleName ?? '').trim() || null;
    const db = DatabaseService.getInstance();
    const ownerId = db.rooms.getOwnerId(roomId);
    if (!req.user || ownerId !== req.user.id) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    }
    const room = db.rooms.getRoomById(roomId);
    if (!room)
        return res.status(404).json({ success: false, error: { code: 'ROOM_NOT_FOUND' } });
    // Lock module after initialization
    if (room.initializedAt) {
        return res.status(400).json({ success: false, error: { code: 'MODULE_LOCKED' } });
    }
    await db.rooms.setModuleName(roomId, moduleName);
    const state = await buildReadyRoomState(req, roomId);
    res.json({ success: true, state });
}));
// POST /api/ready-room/:roomId/select-character - Select character
router.post('/:roomId/select-character', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { characterId } = req.body;
    const db = DatabaseService.getInstance();
    const roomRecord = db.rooms.getRoomById(roomId);
    if (!roomRecord) {
        return res.status(404).json({ success: false, error: { code: 'ROOM_NOT_FOUND' } });
    }
    if (roomRecord.initializedAt) {
        return res.status(400).json({ success: false, error: { code: 'CHARACTER_LOCKED' } });
    }
    // Validate character exists and belongs to user
    const character = db.characters.findById(characterId);
    if (!character || character.userId !== req.user.id) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_CHARACTER' } });
    }
    // Update membership with character
    await db.roomMemberships.updateCharacter(roomId, req.user.id, characterId);
    const state = await buildReadyRoomState(req, roomId);
    return res.json({ success: true, state });
}));
// POST /api/ready-room/:roomId/ready - Toggle ready status
router.post('/:roomId/ready', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    // Get current membership
    const membership = await db.roomMemberships.getMembership(roomId, req.user.id);
    if (!membership) {
        return res.status(403).json({ success: false, error: { code: 'NOT_IN_ROOM' } });
    }
    // Check if user has selected a character
    if (!membership.characterId) {
        return res.status(400).json({ success: false, error: { code: 'SELECT_CHARACTER_FIRST' } });
    }
    // Toggle ready status
    const newReadyStatus = !membership.isReady;
    await db.roomMemberships.setReady(roomId, req.user.id, newReadyStatus);
    // Update ready_at time if becoming ready
    if (newReadyStatus) {
        await db.roomMemberships.updateReadyAt(roomId, req.user.id, new Date().toISOString());
    }
    const state = await buildReadyRoomState(req, roomId);
    return res.json({ success: true, state });
}));
// POST /api/ready-room/:roomId/start - Start game (owner only)
router.post('/:roomId/start', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    // Verify owner
    const ownerId = db.rooms.getOwnerId(roomId);
    if (ownerId !== req.user?.id) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    }
    const roomRecord = db.rooms.getRoomById(roomId);
    if (!roomRecord) {
        return res.status(404).json({ success: false, error: { code: 'ROOM_NOT_FOUND' } });
    }
    // If room is suspended, owner must resume first (by visiting ready-room)
    if (roomRecord.lifecycleState === 'SUSPENDED') {
        return res.status(400).json({ success: false, error: { code: 'ROOM_SUSPENDED' } });
    }
    // Check if owner is ready
    const ownerMembership = await db.roomMemberships.getMembership(roomId, ownerId);
    if (!ownerMembership || !ownerMembership.isReady) {
        return res.status(400).json({ success: false, error: { code: 'OWNER_NOT_READY' } });
    }
    // If this is a re-start from READY (initialized room), require ALL bound members present + ready
    if (roomRecord.lifecycleState === 'READY' || roomRecord.initializedAt) {
        const boundIds = roomRecord.boundMemberIds || [];
        const activeMembers = await db.roomMemberships.getRoomMembers(roomId);
        const missing = boundIds.filter((uid) => !activeMembers.some((m) => m.userId === uid));
        const notReady = activeMembers.filter((m) => boundIds.includes(m.userId) && (!m.isReady || !m.characterId));
        if (missing.length > 0) {
            return res.status(400).json({ success: false, error: { code: 'MEMBERS_NOT_PRESENT' } });
        }
        if (notReady.length > 0) {
            return res.status(400).json({ success: false, error: { code: 'NOT_ALL_READY' } });
        }
    }
    // Remove non-ready users
    await db.roomMemberships.removeNonReadyUsers(roomId);
    // Bind all remaining active members to this room
    const boundMembers = await db.roomMemberships.getRoomMembers(roomId);
    await db.rooms.setBoundMembers(roomId, boundMembers.map((m) => m.userId));
    // Mark game as started
    await db.rooms.startGame(roomId);
    return res.json({ success: true, redirect: `/game/${roomId}` });
}));
// POST /api/ready-room/:roomId/leave - Leave ready room
router.post('/:roomId/leave', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    const roomRecord = db.rooms.getRoomById(roomId);
    if (roomRecord?.initializedAt) {
        return res.status(400).json({ success: false, error: { code: 'LEAVE_LOCKED' } });
    }
    const ownerId = db.rooms.getOwnerId(roomId);
    // If owner leaves, delete the room
    if (ownerId === req.user?.id) {
        await db.rooms.deleteRoom(roomId);
    }
    else {
        await db.roomMemberships.leaveRoom(roomId, req.user.id);
    }
    return res.json({ success: true, redirect: '/lobby' });
}));
// POST /api/ready-room/:roomId/chat - Send chat message
router.post('/:roomId/chat', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { message } = req.body;
    const db = DatabaseService.getInstance();
    // Check if user is in the room
    const membership = await db.roomMemberships.getMembership(roomId, req.user.id);
    if (!membership) {
        return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You are not in this room' },
        });
    }
    // Get username
    const username = req.user?.username || 'Unknown';
    const isJson = wantsJson(req);
    const escapeHtml = (value) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const safeUsername = escapeHtml(username);
    const safeMessage = escapeHtml(String(message ?? '')).trim();
    const time = new Date().toLocaleTimeString();
    return res.json({
        success: true,
        message: {
            roomId,
            userId: req.user.id,
            username,
            message: String(message ?? ''),
            timestamp: new Date().toISOString(),
        },
    });
}));
// POST /api/ready-room/:roomId/end - End game and return to ready room (owner only)
router.post('/:roomId/end', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    // Verify owner and that game has started
    const ownerId = db.rooms.getOwnerId(roomId);
    if (ownerId !== req.user?.id) {
        return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Only room owner can end the game' },
        });
    }
    // Reset all members to not ready
    await db.roomMemberships.resetReadyStatus(roomId);
    // Mark game as not started
    await db.rooms.endGame(roomId);
    res.redirect(`/api/ready-room/${roomId}`);
}));
// GET /api/ready-room/:roomId/status - SSE for member status updates
router.get('/:roomId/status', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const db = DatabaseService.getInstance();
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
    };
    res.writeHead(200, headers);
    const sendUpdate = async () => {
        const members = await db.roomMemberships.getRoomMembers(roomId);
        const ownerId = db.rooms.getOwnerId(roomId);
        const gameStarted = db.rooms.getGameStarted(roomId);
        const room = db.rooms.getRoomById(roomId);
        // Check if owner is ready
        let ownerReady = false;
        if (ownerId) {
            const ownerMembership = members.find(m => m.userId === ownerId);
            if (ownerMembership) {
                ownerReady = ownerMembership.isReady === true && ownerMembership.characterId !== undefined;
            }
        }
        const enrichedMembers = await Promise.all(members.map(async (member) => {
            const user = await db.users.findById(member.userId);
            let characterName = null;
            if (member.characterId) {
                const character = db.characters.findById(member.characterId);
                if (character) {
                    characterName = character.name;
                }
            }
            return {
                id: member.id,
                userId: member.userId,
                username: user?.username || 'Unknown',
                characterName,
                characterId: member.characterId,
                isReady: member.isReady,
                isActive: member.isActive,
            };
        }));
        const boundIds = room?.boundMemberIds || [];
        const canStart = room && (room.lifecycleState === 'READY' || room.initializedAt)
            ? (boundIds.length > 0 && boundIds.every((uid) => {
                const m = enrichedMembers.find((x) => x.userId === uid);
                return !!(m && m.isActive && m.isReady && m.characterId);
            }))
            : ownerReady;
        const data = JSON.stringify({
            members: enrichedMembers,
            canStart,
            gameStarted,
            currentUserId: req.user?.id,
            ownerId,
            moduleName: room?.moduleName ?? null,
            lifecycleState: room?.lifecycleState ?? 'OPEN',
            initializedAt: room?.initializedAt ?? null,
        });
        res.write(`data: ${data}\n\n`);
    };
    // Send initial data
    await sendUpdate();
    // Send updates every 2 seconds
    const interval = setInterval(sendUpdate, 2000);
    req.on('close', () => {
        clearInterval(interval);
    });
}));
export default router;
