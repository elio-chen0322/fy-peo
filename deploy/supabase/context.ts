import { AsyncLocalStorage } from 'node:async_hooks';
export const requestUser = new AsyncLocalStorage<{userId:string;displayName:string;email:string;fullName:null}>();
export async function getChatGPTUser() {return requestUser.getStore() || null;}
