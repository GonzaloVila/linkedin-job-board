'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const password = formData.get('password') as string;
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    redirect('/login?error=1');
  }

  const cookieStore = await cookies();
  cookieStore.set('auth', btoa(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  redirect('/');
}
