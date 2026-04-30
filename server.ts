import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { google } from 'googleapis';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

// OAuth 2.0 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${APP_URL}/auth/callback`;

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'vendor-ticket-tracker-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: 'none',
      httpOnly: true 
    }
  }));

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  // Helper to load saved tokens
  const loadTokens = () => {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oauth2Client.setCredentials(tokens);
      return true;
    }
    return false;
  };

  // --- API Routes ---

  app.get('/api/auth/url', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Google OAuth credentials not configured' });
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/auth/status', (req, res) => {
    const hasTokens = loadTokens();
    res.json({ authenticated: hasTokens });
  });

  // Ticket Extraction Logic (Regex)
  const extractTicketNumber = (subject: string) => {
    const patterns = [
      /Ticket[#\s]*(\d+)/i,
      /#(\d+)/,
      /Ticket\s+Number[:\s]*(\d+)/i,
      /(\d{5,})/
    ];
    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const extractStatusAndDate = (text: string) => {
    const lowerText = text.toLowerCase();
    let status = 'open';
    if (lowerText.includes('completed') || lowerText.includes('resolved') || lowerText.includes('closed')) {
      status = 'completed';
    } else if (lowerText.includes('scheduled') || lowerText.includes('schdualed')) {
      status = 'scheduled';
    } else if (lowerText.includes('pending')) {
      status = 'pending';
    }

    const datePatterns = [
      /scheduled[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /scheduled[:\s]*(\d{4}-\d{2}-\d{2})/i,
      /date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /will[^.]*on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /scheduled for (\w+ \d{1,2}, \d{4})/i
    ];

    let scheduledDate = null;
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        scheduledDate = match[1];
        break;
      }
    }
    return { status, scheduledDate };
  };

  app.post('/api/sync', async (req, res) => {
    if (!loadTokens()) {
      return res.status(401).json({ error: 'Gmail not authenticated' });
    }

    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const response = await gmail.users.messages.list({ userId: 'me', maxResults: 20 });
      const messages = response.data.messages || [];
      
      const processedTickets = [];

      for (const msg of messages) {
        const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
        const headers = fullMsg.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        
        const ticketNumber = extractTicketNumber(subject);
        if (ticketNumber) {
          // Simplified extraction from snippet/parts
          let body = fullMsg.data.snippet || '';
          // If we wanted full HTML we'd look deeper into payload.parts
          
          const { status, scheduledDate } = extractStatusAndDate(body + ' ' + subject);
          
          processedTickets.push({
            ticketNumber,
            subject,
            status,
            scheduledDate,
            id: msg.id
          });
        }
      }

      res.json({ tickets: processedTickets });
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({ error: 'Failed to sync with Gmail' });
    }
  });

  app.post('/api/report', async (req, res) => {
    const { tickets, month, year } = req.body;
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tickets');
    
    sheet.columns = [
      { header: 'Ticket #', key: 'ticketNumber', width: 15 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Scheduled Date', key: 'scheduledDate', width: 20 }
    ];

    tickets.forEach((t: any) => sheet.addRow(t));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report-${year}-${month}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
