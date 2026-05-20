'use server';

import { revalidatePath } from 'next/cache';
import { sql, type JobStatus } from '@/lib/db';

const ALLOWED: JobStatus[] = ['new', 'interested', 'applied', 'dismissed'];

export async function updateJobStatus(externalId: string, status: JobStatus) {
  if (!ALLOWED.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (!externalId || typeof externalId !== 'string') {
    throw new Error('externalId required');
  }

  await sql`
    UPDATE jobs_seen
    SET status = ${status}
    WHERE external_id = ${externalId}
  `;

  revalidatePath('/');
}
