import { env } from 'cloudflare:workers';
import FeedbackApp from './feedback-app';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  await requireChatGPTUser('/');
  return <FeedbackApp readOnly={(env as unknown as Record<string, string>).DEPLOYMENT_MODE === 'public-readonly'} />;
}
