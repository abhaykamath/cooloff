import { Hono } from 'hono';
import { getStats } from '../services/items';

export const stats = new Hono().get('/', async (c) => c.json(await getStats()));
