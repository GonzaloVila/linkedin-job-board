export function getCV(): string {
  const content = process.env.CV_CONTENT;
  if (!content) throw new Error('CV no disponible. Asegurate de que src/lib/cv.md exista y hacé un redeploy.');
  return content;
}
