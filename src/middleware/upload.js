const multer = require("multer");
const path = require("path");
const { uploadsDir } = require("../config");

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

module.exports = { upload };
