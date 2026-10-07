import { createApp, seedCategories } from './app.js';
import { config } from './config.js';
import { createStore } from './store/index.js';

const store = createStore(config.cosmos);
await store.init();
await seedCategories(store);

const usingCosmos = Boolean(config.cosmos.endpoint && config.cosmos.key);
if (!usingCosmos) {
  console.warn('COSMOS_ENDPOINT/COSMOS_KEY not set: using in-memory store (data is lost on restart).');
}

createApp(store, { corsOrigin: config.corsOrigin }).listen(config.port, () => {
  console.log(
    `SimpleBudge API listening on http://localhost:${config.port}` +
      (usingCosmos ? ` (Cosmos DB database "${config.cosmos.database}")` : ''),
  );
});
