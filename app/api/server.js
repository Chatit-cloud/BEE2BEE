import app from './index.js';
import { bridge } from './bridge.js';

// Initialize P2P bridge connection for local development
console.log("\x1b[35m🛰️  Initializing Neural Bridge...\x1b[0m");
bridge.connect();

const PORT = process.env.API_PORT || 3001;

app.listen(PORT, () => {
    console.log(`\x1b[35m🛰️  CoitHub Unified Gateway: http://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[32mEndpoints: REGISTER, GENERATE (Stream), STATUS, METRICS, SUBSCRIBE\x1b[0m`);
    console.log(`\x1b[33mProxying to: ${process.env.VITE_SUPABASE_URL || 'Local Mesh'}\x1b[0m`);
});
