const express = require("express");
const cors = require("cors");
const { publicDir } = require("./config");
const pagesRouter = require("./routes/pages");
const apiRouter = require("./routes/api");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.use(pagesRouter);
  app.use(apiRouter);

  app.use(express.static(publicDir, { index: false, fallthrough: true }));

  return app;
}

module.exports = { createApp };
