// server.js
const path = require('node:path');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.FOFO_DB_PATH || path.join(__dirname, 'data', 'fofo.db');

const app = createApp(DB_PATH);
app.listen(PORT, () => {
  console.log(`fofo server listening on port ${PORT}`);
});
