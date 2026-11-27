/** Open a notebook stored behind a signed URL directly in Google Colab. */
export function colabUrl(fileUrl: string): string {
  return `https://colab.research.google.com/#fileUrl=${encodeURIComponent(fileUrl)}`;
}

export function isNotebookPath(path: string | null | undefined): boolean {
  return /\.ipynb$/i.test(path ?? "");
}

export function fileNameFromPath(path: string | null | undefined, fallback: string): string {
  const name = path?.split("/").pop();
  return name && name.length > 0 ? name : fallback;
}
