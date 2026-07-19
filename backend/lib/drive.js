const { google } = require('googleapis')

// Service-account client — read-only, used for the public mod library
// (Cars/Tracks/Tools). Uploads use a separate per-user OAuth client (see oauth.js)
// since the service account has no write access to Drive on its own behalf.
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})
const drive = google.drive({ version: 'v3', auth })

async function listFolder(folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,size,modifiedTime,mimeType,description)',
  })
  return res.data.files || []
}

async function getFileMetadata(fileId) {
  const res = await drive.files.get({ fileId, fields: 'id,name,size,modifiedTime,mimeType,description' })
  return res.data
}

async function downloadFile(fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  return res.data
}

// Uploads go through the calling user's own OAuth token, never the service
// account, so files land in Drive attributed to the uploader.
async function uploadFile(oauth2Client, { name, mimeType, stream, folderId, description }) {
  const userDrive = google.drive({ version: 'v3', auth: oauth2Client })
  const res = await userDrive.files.create({
    requestBody: { name, parents: [folderId], description },
    media: { mimeType, body: stream },
    fields: 'id,name',
  })
  return res.data
}

module.exports = { listFolder, getFileMetadata, downloadFile, uploadFile }
