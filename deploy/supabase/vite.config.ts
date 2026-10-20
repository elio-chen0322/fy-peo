import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({
 resolve:{alias:[{find:'cloudflare:workers',replacement:root+'/deploy/supabase/runtime.ts'},{find:'@/app/chatgpt-auth',replacement:root+'/deploy/supabase/context.ts'},{find:'@',replacement:root}]},
 build:{target:'es2022',minify:false,outDir:root+'/supabase/functions/peo-api',emptyOutDir:true,lib:{entry:root+'/deploy/supabase/entry.ts',formats:['es'],fileName:()=> 'index.js'},rollupOptions:{external:['npm:pg@8.23.1','node:async_hooks']}},
});
