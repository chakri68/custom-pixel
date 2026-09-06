const ACCEPTED = /^image\/(png|jpeg|jpg|webp|gif|bmp|avif)$/i;

export interface LoadedImage {
  bitmap: ImageBitmap;
  aspect: number;
  name: string;
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (file.type && !ACCEPTED.test(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  // Alpha is preserved so it stays available as a metric, and so `contain`
  // letterboxing and real transparency drop out of the same rule downstream.
  const bitmap = await createImageBitmap(file, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "default",
  });
  return {
    bitmap,
    aspect: bitmap.width / bitmap.height,
    name: file.name.replace(/\.[^.]+$/, ""),
  };
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker fires nothing in some browsers; the promise simply
    // never settles, which is harmless here.
    input.click();
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
