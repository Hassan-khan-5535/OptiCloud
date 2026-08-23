export * from './schema.js';

export type ResourceState = 'detected' | 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back';
