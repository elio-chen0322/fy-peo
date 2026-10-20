import { requireChatGPTUser } from '../chatgpt-auth';
import PeoCycle from './view';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireChatGPTUser('/peo-cycle'); return <PeoCycle />; }
