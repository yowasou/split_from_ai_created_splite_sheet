const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

function parseIntOrDefault(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

async function splitSpriteSheet(inputFile, outputDir, cols = 3, rows = 4, padding = 0) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const image = sharp(inputFile);
    const meta = await image.metadata();

    if (!meta.width || !meta.height) {
        throw new Error("Unable to read image dimensions.");
    }

    if (cols < 1 || rows < 1) {
        throw new Error("cols and rows must be positive integers.");
    }

    const cellWidth = Math.floor(meta.width / cols);
    const cellHeight = Math.floor(meta.height / rows);

    if (cellWidth < 1 || cellHeight < 1) {
        throw new Error(`Invalid grid size: image too small for ${cols}×${rows}.`);
    }

    const sprites = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const left = x * cellWidth;
            const top = y * cellHeight;
            const width = x === cols - 1 ? meta.width - left : cellWidth;
            const height = y === rows - 1 ? meta.height - top : cellHeight;
            console.log({ left, top, width, height });
            if (width <= 0 || height <= 0 || left < 0 || top < 0 || left >= meta.width || top >= meta.height) {
                throw new Error(`Invalid extract area at cell (${x}, ${y}): left=${left}, top=${top}, width=${width}, height=${height}.`);
            }

            const sprite = image.clone().extract({
                left,
                top,
                width,
                height
            });

            const extractedBuffer = await sprite
                .ensureAlpha()
                .toBuffer();

            const trimmedBuffer = await sharp(extractedBuffer)
                .trim()
                .toBuffer();

            const trimmedMeta = await sharp(trimmedBuffer).metadata();
            sprites.push({ buffer: trimmedBuffer, width: trimmedMeta.width, height: trimmedMeta.height });
        }
    }

    const maxWidth = Math.max(...sprites.map((sprite) => sprite.width));
    const maxHeight = Math.max(...sprites.map((sprite) => sprite.height));
    const canvasWidth = maxWidth + padding * 2;
    const canvasHeight = maxHeight + padding * 2;

    let index = 0;
    for (const sprite of sprites) {
        const left = Math.round((canvasWidth - sprite.width) / 2);
        const top = canvasHeight - padding - sprite.height;
        const output = path.join(outputDir, `output_${String(index).padStart(2, "0")}.png`);

        await sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
            .composite([{ input: sprite.buffer, left, top }])
            .png()
            .toFile(output);
        console.log(output);
        index++;
    }
}

const input = process.argv[2] || "input";
const outputRoot = process.argv[3] || "output";
const cols = parseIntOrDefault(process.argv[4], 3);
const rows = parseIntOrDefault(process.argv[5], 4);
const padding = parseIntOrDefault(process.argv[6], 0);

function findPngFiles(dir) {
    let results = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(findPngFiles(fullPath));
        } else if (entry.isFile() &&
            /\.(png)$/i.test(entry.name)) {
            results.push(fullPath);
        }
    }

    return results;
}

async function main() {

    const stat = fs.statSync(input);

    if (stat.isFile()) {

        await splitSpriteSheet(
            input,
            outputRoot,
            cols,
            rows,
            padding
        );

    } else {

        const files = findPngFiles(input);

        console.log(`${files.length} files found.`);

        for (const file of files) {

            const relative = path.relative(input, file);
            const name = path.parse(relative).name;

            const outDir = path.join(outputRoot, name);

            console.log(`Processing ${file}`);

            await splitSpriteSheet(
                file,
                outDir,
                cols,
                rows,
                padding
            );
        }
    }

    console.log("Done");
}

main().catch(console.error);
