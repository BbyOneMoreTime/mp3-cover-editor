const express = require("express");
const multer = require("multer");
const NodeID3 = require("node-id3");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("output")) fs.mkdirSync("output");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.post("/update-mp3", upload.fields([
    { name: "mp3file" },
    { name: "cover" }
]), (req, res) => {

    const mp3File = req.files["mp3file"][0];
    const mp3Path = path.resolve(mp3File.path);
    const coverFile = req.files["cover"] ? req.files["cover"][0] : null;

    const outputPath = path.resolve("output", "updated-" + Date.now() + ".mp3");

    fs.copyFileSync(mp3Path, outputPath);

    let title = req.body.title?.trim();
    if (!title) {
        title = mp3File.originalname.replace(/\.mp3$/i, "");
    }

    const tags = {
        title: title,
        artist: req.body.artist || "",
        album: req.body.album || ""
    };

    if (coverFile) {
        tags.image = coverFile.path;
    }

    NodeID3.write(tags, outputPath);

    res.download(outputPath, "updated.mp3", () => {
        fs.unlinkSync(mp3Path);
        if (coverFile) fs.unlinkSync(coverFile.path);
    });
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

