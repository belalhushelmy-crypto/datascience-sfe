#!/usr/bin/env node
import sharp from "sharp";
import { fileURLToPath } from "url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const inputDark = `${publicDir}brand/logo-dark.jpeg`;
const inputLight = `${publicDir}brand/logo-light.jpeg`;

async function trimAndSave(inputPath, outputPath) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  console.log(`Input: ${metadata.width}x${metadata.height}`);

  // Trim transparent/white borders
  const trimmed = await image
    .trim({ threshold: 10 })
    .png()
    .toBuffer();

  const trimmedMetadata = await sharp(trimmed).metadata();
  console.log(`Trimmed: ${trimmedMetadata.width}x${trimmedMetadata.height}`);

  await sharp(trimmed).toFile(outputPath);
  console.log(`Saved: ${outputPath}`);
}

// Generate favicon from dark logo
async function generateFavicon(inputPath) {
  const image = sharp(inputPath);
  await image
    .trim({ threshold: 10 })
    .resize(32, 32, { fit: "cover", position: "center" })
    .png()
    .toFile(`${publicDir}favicon.png`);
  console.log("Generated: public/favicon.png");

  // Also generate 16x16, 48x48 for good measure
  await image
    .trim({ threshold: 10 })
    .resize(16, 16, { fit: "cover", position: "center" })
    .png()
    .toFile(`${publicDir}favicon-16.png`);

  await image
    .trim({ threshold: 10 })
    .resize(48, 48, { fit: "cover", position: "center" })
    .png()
    .toFile(`${publicDir}favicon-48.png`);

  await image
    .trim({ threshold: 10 })
    .resize(180, 180, { fit: "cover", position: "center" })
    .png()
    .toFile(`${publicDir}apple-touch-icon.png`);

  // Generate ICO file (multiple sizes)
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((size) =>
      image
        .trim({ threshold: 10 })
        .resize(size, size, { fit: "cover", position: "center" })
        .png()
        .toBuffer()
    )
  );
  // Simple ICO creation - just use the 32x32 as favicon.ico
  await sharp(buffers[1]).toFile(`${publicDir}favicon.ico`);
  console.log("Generated: public/favicon.ico");
}

async function main() {
  await trimAndSave(inputDark, `${publicDir}brand/logo-dark-trim.png`);
  await trimAndSave(inputLight, `${publicDir}brand/logo-light-trim.png`);
  await generateFavicon(inputDark);
  console.log("Done!");
}

main().catch(console.error);
