const ARGENTINA_RE = /argentina/i;
const LATAM_RE =
  /\b(chile|colombia|m[eé]xico|mexico|per[uú]|uruguay|paraguay|bolivia|ecuador|venezuela|costa\s*rica|panam[aá]|latam|latin\s*america|am[eé]rica\s*latina|south\s*america|am[eé]rica\s*del\s*sur)\b/i;
const SPAIN_RE = /\b(spain|espa[ñn]a)\b/i;
const REMOTE_RE = /\b(remote|remoto)\b/i;

/**
 * Auto-apply scope, per explicit user preference: Argentina (any modality),
 * other LatAm countries/regions only if remote, Spain only if remote.
 * Everything else — Europe outside Spain, the US, "Worldwide Remote"
 * postings that turn out to be based anywhere (this is what let a Berlin
 * listing through — the bot's search matrix has a genuinely worldwide
 * remote bucket) — is out of scope for drafting/sending, even though the
 * bot's broader search still finds it for manual browsing in the dashboard.
 *
 * Checks both the raw scraped location and the AI's extracted location
 * (analysisLocation) since the AI sometimes infers a country the raw
 * LinkedIn/RemoteOK location string didn't spell out.
 */
export function isInApplyScope(
  rawLocation: string | null,
  analysisLocation: string | null,
  modality: string,
): boolean {
  const text = `${rawLocation ?? ''} ${analysisLocation ?? ''}`;

  if (ARGENTINA_RE.test(text)) return true;

  const isRemote = REMOTE_RE.test(text) || modality === 'remote';
  if (!isRemote) return false;

  return LATAM_RE.test(text) || SPAIN_RE.test(text);
}
