#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src");

function flatten(obj, prefix = "", out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== ".next"
      ) {
        findFiles(file, files);
      }
    } else if (extname(entry.name) === ".ts" || extname(entry.name) === ".tsx") {
      files.push(file);
    }
  }
  return files;
}

const NAMESPACE_CALL =
  /(?:useTranslations|getTranslations)\(\s*(?:["'`]([\w.]+)["'`]|\{[^}]*?namespace\s*:\s*["'`]([\w.]+)["'`][^}]*?\})/g;

function extract(content) {
  const calls = [];
  const dynamic = new Set();
  const namespacesByVar = new Map();

  function addNamespace(variable, namespace) {
    if (!namespacesByVar.has(variable)) namespacesByVar.set(variable, new Set());
    namespacesByVar.get(variable).add(namespace);
  }

  for (const match of content.matchAll(NAMESPACE_CALL)) {
    const namespace = match[1] ?? match[2];
    if (!namespace) continue;

    const before = content.slice(Math.max(0, match.index - 160), match.index);
    const declaration = before.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?$/);
    addNamespace(declaration ? declaration[1] : "t", namespace);
  }

  if (namespacesByVar.size === 0) addNamespace("t", "common");

  for (const [variable] of namespacesByVar) {
    const escaped = variable.replace(/[$]/g, "\\$");

    const staticCall = new RegExp(
      `\\b${escaped}(?:\\.(?:rich|raw|markup))?\\(\\s*["'\`]([^"'\`]+)["'\`]`,
      "g",
    );
    for (const match of content.matchAll(staticCall)) {
      if (match[1].includes("${")) {
        dynamic.add(`${variable}: ${match[1]}`);
      } else {
        calls.push({ variable, key: match[1] });
      }
    }

    const dynamicCall = new RegExp(
      `\\b${escaped}(?:\\.(?:rich|raw|markup))?\\(\\s*([^"'\\\`\\s)][^)]*)\\)`,
      "g",
    );
    for (const match of content.matchAll(dynamicCall)) {
      dynamic.add(`${variable}: ${match[1].trim()}`);
    }
  }

  return { calls, dynamic, namespacesByVar };
}

function main() {
  const en = JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8"));
  const ar = JSON.parse(readFileSync(join(ROOT, "messages/ar.json"), "utf8"));

  const enKeys = new Set(flatten(en));
  const arKeys = new Set(flatten(ar));

  const usages = new Map();
  const dynamic = new Set();

  for (const file of findFiles(SRC_DIR)) {
    const result = extract(readFileSync(file, "utf8"));
    for (const item of result.dynamic) dynamic.add(item);

    for (const { variable, key } of result.calls) {
      const namespaces = result.namespacesByVar.get(variable) ?? new Set(["common"]);
      if (!usages.has(key)) usages.set(key, new Set());
      for (const namespace of namespaces) usages.get(key).add(namespace);
    }
  }

  const missing = [];
  for (const [key, namespaces] of [...usages].sort(([a], [b]) => a.localeCompare(b))) {
    const candidates = [...namespaces].map((namespace) => `${namespace}.${key}`);
    const inEn = candidates.some((candidate) => enKeys.has(candidate));
    const inAr = candidates.some((candidate) => arKeys.has(candidate));
    if (!inEn || !inAr) missing.push({ key: candidates[0] ?? key, inEn, inAr });
  }

  const localeOnly = [];
  for (const key of enKeys) if (!arKeys.has(key)) localeOnly.push(`only EN: ${key}`);
  for (const key of arKeys) if (!enKeys.has(key)) localeOnly.push(`only AR: ${key}`);

  console.log("\n=== i18n Key Check ===");
  console.log(
    `EN: ${enKeys.size} | AR: ${arKeys.size} | Used keys: ${usages.size} | Dynamic: ${dynamic.size}`,
  );

  if (localeOnly.length > 0) {
    console.log("\n=== Locale parity ===");
    for (const line of localeOnly.sort()) console.log(`  ${line}`);
  }

  if (missing.length > 0) {
    console.log("\n=== Missing static keys ===");
    for (const { key, inEn, inAr } of missing) {
      console.log(`  ${key} (EN:${inEn ? "yes" : "no"} AR:${inAr ? "yes" : "no"})`);
    }
  }

  if (localeOnly.length > 0 || missing.length > 0) {
    console.log(
      `\nMissing EN:${missing.filter((item) => !item.inEn).length} AR:${
        missing.filter((item) => !item.inAr).length
      } Locale-only:${localeOnly.length}`,
    );
    process.exit(1);
  }

  console.log("All static keys are present in both locales, with full parity.");
}

main();
