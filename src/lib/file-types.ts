const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".pdf",
]);

export function isBinaryPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const name = path.split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index >= 0 && BINARY_EXTENSIONS.has(name.slice(index).toLowerCase());
}

export function fileNameFromPath(path: string | null | undefined, fallback: string): string {
  const name = path?.split("/").pop();
  return name && name.length > 0 ? name : fallback;
}
