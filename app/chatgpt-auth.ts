import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';
const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const config = env as unknown as Record<string, string>;
  if (config.DEPLOYMENT_MODE === 'team') {
    const token = (await cookies()).get('peo_access')?.value;
    if (!token || !config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) return null;
    const result = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!result.ok) return null;
    const user = await result.json() as {email?: string; email_confirmed_at?: string};
    const email = String(user.email || '').toLowerCase();
    const allowed = config.TEAM_EMAILS.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!email || !allowed.includes(email) || !user.email_confirmed_at) return null;
    return { userId: config.PUBLIC_DATA_OWNER, displayName: email, email, fullName: null };
  }
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const direct = env as unknown as Record<string, string>;
  if (direct.DEPLOYMENT_MODE === 'public-readonly') return {userId: direct.PUBLIC_DATA_OWNER, displayName: '公开只读', email: '', fullName: null};
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if ((env as unknown as Record<string, string>).DEPLOYMENT_MODE === 'team') return `/login?return_to=${encodeURIComponent(safeReturnTo)}`;
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
