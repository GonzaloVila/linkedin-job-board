import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Resume PDF attached to Tier A auto-sent emails. Defaults to the file
 * committed at public/resume.pdf, fetched over HTTP from the live
 * deployment rather than read off disk — Vercel's per-function file
 * tracing only reliably bundles files it can detect from literal fs
 * paths in the source, and a dynamically-joined path (this file's
 * previous approach) isn't guaranteed to be picked up, which would only
 * surface as a runtime failure in production, not locally. Static assets
 * under public/ are always served correctly regardless of tracing, so
 * fetching it is the robust option. VERCEL_URL is set automatically on
 * every Vercel deployment; RESUME_PDF_URL overrides it (e.g. to serve
 * from Vercel Blob instead) without a redeploy.
 */
export async function getResumeAttachment(): Promise<{ filename: string; content: Buffer }> {
  const url =
    process.env.RESUME_PDF_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/resume.pdf` : null);

  if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`resume PDF fetch failed (${url}): ${res.status}`);
    return { filename: 'CV.pdf', content: Buffer.from(await res.arrayBuffer()) };
  }

  // Local dev only (no VERCEL_URL, no override): read straight off disk.
  const filePath = path.join(process.cwd(), 'public', 'resume.pdf');
  try {
    const content = await readFile(filePath);
    return { filename: 'CV.pdf', content };
  } catch {
    throw new Error(
      'No hay CV en PDF disponible: falta public/resume.pdf o la env var RESUME_PDF_URL.'
    );
  }
}
