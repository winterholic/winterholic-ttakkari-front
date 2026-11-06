// 로컬 UI 검증 전용. 운영 API를 연결하지 않고 5분 후 스스로 종료한다.
import { createServer } from 'vite';
const server = await createServer({ envDir: false, server: { host: '127.0.0.1', port: 5428, strictPort: true, watch: { usePolling: true } } });
await server.listen();
server.printUrls();
setTimeout(async () => { await server.close(); process.exit(0); }, 300_000);
