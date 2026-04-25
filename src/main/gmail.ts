import { ipcMain } from 'electron'
import { google } from 'googleapis'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

let authClient: any = null

function getAuthClient() {
  if (authClient) return authClient

  const madoPath = join(homedir(), '.mado', 'mado_mail')
  // Ensure the mado directory exists as requested
  if (!existsSync(madoPath)) {
    mkdirSync(madoPath, { recursive: true })
  }

  const pathsToTry = [
    process.cwd(),
    join(process.cwd(), '..'),
    madoPath
  ]

  let secretPath = ''
  let tokenPath = ''

  for (const p of pathsToTry) {
    const s = join(p, 'client_secret.json')
    const t = join(p, 'token.json')
    if (existsSync(s) && existsSync(t)) {
      secretPath = s
      tokenPath = t
      break
    }
  }

  if (!secretPath || !tokenPath) {
    throw new Error(`Credentials not found. Checked: ${pathsToTry.join(', ')}. Run Go app first.`)
  }

  const secretContent = readFileSync(secretPath, 'utf8')
  const credentials = JSON.parse(secretContent)
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  const tokenContent = readFileSync(tokenPath, 'utf8')
  const token = JSON.parse(tokenContent)
  oAuth2Client.setCredentials(token)
  
  authClient = oAuth2Client
  return authClient
}

export function setupGmailIPC() {
  ipcMain.handle('gmail-fetch-inbox', async () => {
    try {
      const auth = getAuthClient()
      const gmail = google.gmail({ version: 'v1', auth })
      
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'label:INBOX',
        maxResults: 400
      })

      const messages = res.data.messages || []
      const detailedMessages = await Promise.all(
        messages.map(async (msg) => {
          const m = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']
          })
          
          let from = '', subject = '', date = ''
          const headers = m.data.payload?.headers || []
          for (const header of headers) {
            if (header.name === 'From') from = header.value || ''
            if (header.name === 'Subject') subject = header.value || ''
            if (header.name === 'Date') date = header.value || ''
          }
          
          return {
            id: m.data.id,
            threadId: m.data.threadId,
            snippet: m.data.snippet,
            from,
            subject,
            date
          }
        })
      )
      
      return { success: true, data: detailedMessages }
    } catch (error: any) {
      console.error(error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('gmail-archive', async (_, ids: string[]) => {
    try {
      const auth = getAuthClient()
      const gmail = google.gmail({ version: 'v1', auth })
      
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids,
          removeLabelIds: ['INBOX', 'UNREAD']
        }
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('gmail-trash', async (_, ids: string[]) => {
    try {
      const auth = getAuthClient()
      const gmail = google.gmail({ version: 'v1', auth })
      
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids,
          addLabelIds: ['TRASH'],
          removeLabelIds: ['INBOX', 'UNREAD']
        }
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
