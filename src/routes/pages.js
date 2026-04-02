const express = require("express");
const path = require("path");
const { publicDir } = require("../config");

const router = express.Router();

function sendPublicHtml(res, filename) {
  res.sendFile(path.join(publicDir, filename));
}

router.get("/", (req, res) => sendPublicHtml(res, "welcome.html"));

router.get("/welcome", (req, res) => res.redirect(302, "/"));

router.get(["/signup", "/signup.html"], (req, res) =>
  res.redirect(302, "/?auth=signup")
);

router.get(["/signin", "/signin.html"], (req, res) =>
  res.redirect(302, "/?auth=signin")
);

router.get("/chat", (req, res) => sendPublicHtml(res, "chat.html"));

/** Legacy filename → same app */
router.get("/index.html", (req, res) => res.redirect(302, "/chat"));

module.exports = router;
