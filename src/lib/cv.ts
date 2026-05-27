import { readFileSync } from 'fs';
import { join } from 'path';

let cached: string | null = null;

export function getCV(): string {
  if (cached) return cached;
  cached = readFileSync(join(process.cwd(), 'src/lib/cv.md'), 'utf-8');
  return cached;
}
