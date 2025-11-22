const express = require("express");
const multer = require("multer");
const NodeID3 = require("node-id3");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

if (!fs.existsSync("output")) fs.mkdirSync("output");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.post("/update-mp3", upload.fields([
    { name: "mp3file" },
    { name: "cover" }
]), (req, res) => {

    const mp3Path = path.resolve(req.files["mp3file"][0].path);
    const cover = req.files["cover"] ? path.resolve(req.files["cover"][0].path) : null;

    const outputPath = path.resolve("output", "mp3-updated-" + Date.now() + ".mp3");

    fs.copyFileSync(mp3Path, outputPath);

    const tags = {
        title: req.body.title || "",
        artist: req.body.artist || "",
        album: req.body.album || "",
    };

    if (cover) {
        tags.image = cover;
    }

    NodeID3.write(tags, outputPath);

    res.download(outputPath, "updated.mp3", () => {
        fs.unlinkSync(mp3Path);
        if (cover) fs.unlinkSync(cover);
    });
});

app.listen(3000, () => {
    console.log("🚀 Server chạy tại http://localhost:3000");
});
