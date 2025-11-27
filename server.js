const express = require("express");
const multer = require("multer");
const NodeID3 = require("node-id3");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const app = express();
const upload = multer({ dest: "uploads/" });

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("output")) fs.mkdirSync("output");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

async function downloadImage(url) {
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    let parsed;
    let attempt = url;
    try {
        parsed = new URL(attempt);
    } catch (e) {
        // try adding https:// if user omitted scheme
        try {
            attempt = 'https://' + url;
            parsed = new URL(attempt);
        } catch (e2) {
            throw new Error('Invalid URL');
        }
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');

    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(parsed, (res) => {
            if (res.statusCode !== 200) return reject(new Error('Image fetch failed: ' + res.statusCode));
            const contentType = res.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) return reject(new Error('URL did not return an image'));
            const contentLength = parseInt(res.headers['content-length'] || '0', 10);
            if (contentLength && contentLength > MAX_BYTES) return reject(new Error('Image too large'));

            const mime = contentType.split(';')[0];
            const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' };
            const ext = extMap[mime] || '';
            const filename = path.join('uploads', 'cover-' + Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
            const fileStream = fs.createWriteStream(filename);
            let received = 0;
            res.on('data', (chunk) => {
                received += chunk.length;
                if (received > MAX_BYTES) {
                    req.abort();
                    fileStream.destroy();
                    try { fs.unlinkSync(filename); } catch (e) {}
                    return reject(new Error('Image too large'));
                }
            });

            streamPipeline(res, fileStream).then(() => {
                resolve({ path: filename, mime });
            }).catch((err) => {
                try { fs.unlinkSync(filename); } catch (e) {}
                reject(err);
            });
        });
        req.on('error', (err) => reject(err));
    });
}

app.post("/update-mp3", upload.fields([
    { name: "mp3file" },
    { name: "cover" }
]), async (req, res) => {

    const mp3File = req.files["mp3file"][0];
    const mp3Path = path.resolve(mp3File.path);
    const coverFileUploaded = req.files["cover"] ? req.files["cover"][0] : null;
    const coverUrl = (req.body.coverUrl || '').trim();

    let downloadedCover = null;
    if (coverUrl) {
        try {
            downloadedCover = await downloadImage(coverUrl);
        } catch (err) {
            // If download fails, respond with error
            try { fs.unlinkSync(mp3Path); } catch (e) {}
            return res.status(400).send('Failed to download cover image: ' + err.message);
        }
    }

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

    // Prefer a downloaded URL cover if provided, otherwise uploaded file
    let tempCoverPath = null;
    let coverMime = null;
    if (downloadedCover) {
        tempCoverPath = downloadedCover.path;
        coverMime = downloadedCover.mime;
    } else if (coverFileUploaded) {
        tempCoverPath = coverFileUploaded.path;
        coverMime = coverFileUploaded.mimetype;
    }

    if (tempCoverPath) {
        try {
            const imageBuffer = fs.readFileSync(tempCoverPath);
            tags.image = {
                mime: coverMime || 'image/jpeg',
                type: { id: 3, name: 'front cover' },
                description: 'Cover',
                imageBuffer: imageBuffer
            };
        } catch (e) {
            console.error('Failed to read cover image:', e);
        }
    }

    NodeID3.write(tags, outputPath);

    res.download(outputPath, "updated.mp3", () => {
        try { fs.unlinkSync(mp3Path); } catch (e) {}
        // remove uploaded cover if present and not the downloaded one
        try {
            if (coverFileUploaded && (!downloadedCover)) fs.unlinkSync(coverFileUploaded.path);
        } catch (e) {}
        // remove downloaded cover if present
        try { if (downloadedCover) fs.unlinkSync(downloadedCover.path); } catch (e) {}
    });
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

