import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker";

let workerReady = false;

function ensureWorker() {
  if (workerReady) return;
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  workerReady = true;
}

// Извлекает текст из PDF страницами (порядок строк — сверху вниз).
export async function extractPdfText(source: File | Blob | ArrayBuffer): Promise<string> {
  ensureWorker();
  const data =
    source instanceof ArrayBuffer
      ? source.slice(0)
      : new Uint8Array(await source.arrayBuffer()).buffer as ArrayBuffer;
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const bucket = byY.get(y) ?? [];
      bucket.push({ x, text: item.str });
      byY.set(y, bucket);
    }
    const lines = Array.from(byY.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, bucket]) =>
        bucket
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }
  await doc.destroy();
  return pages.join("\n");
}
