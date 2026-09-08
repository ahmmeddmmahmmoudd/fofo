// server.js
const path = require('node:path');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.FADY_DB_PATH || path.join(__dirname, 'data', 'fady.db');

const app = createApp(DB_PATH);
app.listen(PORT, () => {
  console.log(`fady server listening on port ${PORT}`);
});
