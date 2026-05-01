import { google } from 'googleapis';
import http from 'node:http';
import 'dotenv/config';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.');
    process.exit(1);
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3001/callback');
  const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log('\n1) Open this URL in your browser:\n', url, '\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '', 'http://localhost:3001');
      const c = u.searchParams.get('code');
      if (!c) { res.writeHead(400); res.end('no code'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Done. You can close this tab.</h1>');
      server.close();
      resolve(c);
    });
    server.listen(3001, () => console.log('Waiting for callback on http://localhost:3001/callback ...'));
    setTimeout(() => reject(new Error('Timeout')), 5 * 60_000);
  });

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    console.error('No refresh_token returned. Try removing app access from your Google account and re-running.');
    process.exit(1);
  }
  console.log('\nAdd this line to your .env:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
