import { CosmosStore } from './cosmos-store.js';
import { MemoryStore } from './memory-store.js';

export function createStore(cosmosConfig) {
  if (cosmosConfig.endpoint && cosmosConfig.key) {
    return new CosmosStore(cosmosConfig);
  }
  return new MemoryStore();
}
