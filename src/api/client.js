import { createMockApi } from '../mock/mockApi';

/**
 * Single entry point to the backend. In Electron this is the preload bridge
 * (window.torrentAPI); in a plain browser it is an in-memory mock with the
 * same shape, so components never branch on the environment.
 */
const bridge = typeof window !== 'undefined' ? window.torrentAPI : undefined;

export const isDesktop = Boolean(bridge);

export const api = bridge || createMockApi();
