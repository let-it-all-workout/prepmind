const fs = require("fs");
const { createApp } = require("./app");
const { port, uploadsDir } = require("./config");

fs.mkdirSync(uploadsDir, { recursive: true });

const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`PrepMind running at http://localhost:${port}`);
});
