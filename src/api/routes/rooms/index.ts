// API layer: Room routes (composed)
// Shared router with subroutes

import { Router } from 'express';
import { createRoutes } from './create.js';
import { actionRoutes } from './actions.js';
import { notesRoutes } from './notes.js';
import { stateRoutes } from './state.js';
import { debugRoutes } from './debug.js';
import { setRoomsMap } from './store.js';

const router = Router();

router.use('/', createRoutes);
router.use('/', actionRoutes);
router.use('/', notesRoutes);
router.use('/', stateRoutes);
router.use('/', debugRoutes);

export { setRoomsMap };

export default router;
