/**
 * ============================================================================
 *  google_drive.js — Google Drive Integration for CHA Export Automation
 * ============================================================================
 *
 *  Provides functions to:
 *   - Authenticate with Google OAuth 2.0
 *   - List and download files from Google Drive
 *   - Upload files to Google Drive
 *
 *  Requires Google OAuth credentials (client_secret.json) or a refresh token.
 *
 * ============================================================================
 */

import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __filename equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Google OAuth configuration.
 * Set these in your .env file or modify here.
 */
export const GOOGLE_DRIVE_CONFIG = {
  /**
   * Path to your Google OAuth credentials file.
   * Download from Google Cloud Console: https://console.cloud.google.com/
   * Required scopes: https://www.googleapis.com/auth/drive.readonly, https://www.googleapis.com/auth/drive
   */
  credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'client_secret.json'),

  /**
   * Path to store the OAuth token (refresh token).
   * Token is created automatically after first auth.
   */
  tokenPath: process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, 'token.json'),

  /**
   * Google Drive folder IDs (optional).
   * Set these if you want to specify source/destination folders.
   * - INPUT_FOLDER_ID: Google Drive folder ID containing input Excel files
   * - OUTPUT_FOLDER_ID: Google Drive folder ID for .sb output files
   */
  inputFolderId: process.env.GOOGLE_INPUT_FOLDER_ID || null,
  outputFolderId: process.env.GOOGLE_OUTPUT_FOLDER_ID || null,
};

// ─── Google Drive API Client ────────────────────────────────────────────────

/**
 * Google Drive API client wrapper.
 * Uses the Google APIs Node.js client library.
 */
class GoogleDriveClient {
  constructor() {
    this.auth = null;
    this.drive = null;
  }

  /**
   * Initialize Google OAuth2 authentication.
   * Tries to load saved token first, then prompts for authorization if needed.
   *
   * @param {object} oauth2Client - OAuth2 client from @googleapis/drive
   * @returns {Promise<void>}
   */
  async authorize(oauth2Client) {
    const { tokenPath } = GOOGLE_DRIVE_CONFIG;

    // Try to load saved token
    if (fs.existsSync(tokenPath)) {
      try {
        const savedToken = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        oauth2Client.setCredentials(savedToken);
        console.log('🔐 Loaded saved Google Drive token');
        this.auth = oauth2Client;
        return;
      } catch (err) {
        console.log('⚠️  Could not load saved token, initiating new auth...');
      }
    }

    // No token found, initiate new auth flow
    await this.promptForToken(oauth2Client);
  }

  /**
   * Prompt user for OAuth authorization (web flow).
   * Open browser for user to grant permissions.
   *
   * @param {object} oauth2Client - OAuth2 client
   * @returns {Promise<void>}
   */
  async promptForToken(oauth2Client) {
    const { credentialsPath, tokenPath } = GOOGLE_DRIVE_CONFIG;

    // Read credentials file
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(
        `Google OAuth credentials not found at: ${credentialsPath}\n` +
        'Please download client_secret.json from Google Cloud Console:\n' +
        '1. Go to https://console.cloud.google.com/\n' +
        '2. Create a project → API & Services → Credentials\n' +
        '3. Create "Desktop app" credentials → Download JSON\n' +
        '4. Save as automation/cha_export/client_secret.json'
      );
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const { client_secret, client_id } = credentials.installed || credentials.web;
    const { google } = await import('googleapis');
    oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');

    // Generate auth URL
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ];
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes.join(' '),
      prompt: 'consent',
    });

    console.log(`\n🔐 Authorize Google Drive Access:`);
    console.log(`   Open this URL in your browser:`);
    console.log(`   ${authUrl}\n`);

    // Read authorization code from user
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve, reject) => {
      rl.question('Enter the authorization code: ', async (code) => {
        rl.close();
        try {
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          // Save token for future use
          fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
          console.log(`✅ Token saved to: ${tokenPath}\n`);

          this.auth = oauth2Client;
          resolve();
        } catch (err) {
          console.error(`❌ Token exchange failed: ${err.message}`);
          reject(err);
        }
      });
    });
  }

  /**
   * Get Google Drive API instance.
   *
   * @param {object} oauth2Client - OAuth2 client
   * @returns {object} Google Drive API instance
   */
  async getDriveApi(oauth2Client) {
    const { google } = await import('googleapis');
    return google.drive({
      version: 'v3',
      auth: oauth2Client,
    });
  }

  /**
   * List files in Google Drive folder.
   *
   * @param {string} folderId - Google Drive folder ID
   * @param {string} mimeType - File type filter (e.g., 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   * @returns {Promise<Array>} Array of file metadata
   */
  async listFiles(folderId, mimeType = null) {
    if (!this.auth) {
      throw new Error('Google Drive not authorized. Call authorize() first.');
    }

    const drive = await this.getDriveApi(this.auth);

    let q = `'${folderId}' in parents and trashed = false`;
    if (mimeType) {
      q += ` and mimeType = '${mimeType}'`;
    }

    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, createdTime, size)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return response.data.files || [];
  }

  /**
   * Download a file from Google Drive.
   *
   * @param {string} fileId - Google Drive file ID
   * @param {string} destinationPath - Local path to save the file
   * @returns {Promise<void>}
   */
  async downloadFile(fileId, destinationPath) {
    if (!this.auth) {
      throw new Error('Google Drive not authorized. Call authorize() first.');
    }

    const drive = await this.getDriveApi(this.auth);

    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    const dest = fs.createWriteStream(destinationPath);
    response.data.on('end', () => {
      console.log(`   📥 Downloaded: ${path.basename(destinationPath)}`);
    });
    response.data.on('error', (err) => {
      console.error(`   ❌ Download failed: ${err.message}`);
      throw err;
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(dest);
      dest.on('finish', resolve);
      dest.on('error', reject);
    });
  }

  /**
   * Upload a file to Google Drive.
   *
   * @param {string} filePath - Local file path
   * @param {string} folderId - Target Google Drive folder ID (optional)
   * @returns {Promise<object>} Uploaded file metadata
   */
  async uploadFile(filePath, folderId = null) {
    if (!this.auth) {
      throw new Error('Google Drive not authorized. Call authorize() first.');
    }

    const drive = await this.getDriveApi(this.auth);
    const fileName = path.basename(filePath);

    // ── Check if file already exists in target folder ────────────────────
    let existingFileId = null;
    if (folderId) {
      const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
      const listResp = await drive.files.list({
        q,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (listResp.data.files && listResp.data.files.length > 0) {
        existingFileId = listResp.data.files[0].id;
      }
    }

    const media = {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath),
    };

    let response;
    try {
      if (existingFileId) {
        // ── Update (Overwrite) existing file ───────────────────────────────
        response = await drive.files.update({
          fileId: existingFileId,
          media: media,
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });
        console.log(`   📤 Overwritten: ${fileName} → ${response.data.webViewLink}`);
      } else {
        // ── Create new file ────────────────────────────────────────────────
        const fileMetadata = {
          name: fileName,
          parents: folderId ? [folderId] : undefined,
        };
        response = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });
        console.log(`   📤 Uploaded: ${fileName} → ${response.data.webViewLink}`);
      }
    } catch (err) {
      if (existingFileId && err.message.includes('write access')) {
        console.log(`   ⚠️ Cannot overwrite existing file due to permissions. Creating new file instead...`);
        const fileMetadata = {
          name: fileName,
          parents: folderId ? [folderId] : undefined,
        };
        // We have to re-create the read stream because the previous one might have been consumed
        const newMedia = {
          mimeType: 'application/octet-stream',
          body: fs.createReadStream(filePath),
        };
        response = await drive.files.create({
          resource: fileMetadata,
          media: newMedia,
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });
        console.log(`   📤 Uploaded (as new): ${fileName} → ${response.data.webViewLink}`);
      } else {
        throw err;
      }
    }

    return response.data;
  }

  /**
   * Create a folder in Google Drive.
   *
   * @param {string} folderName - Name of the folder to create
   * @param {string} parentId - Parent folder ID (optional)
   * @returns {Promise<object>} Created folder metadata
   */
  async createFolder(folderName, parentId = null) {
    if (!this.auth) {
      throw new Error('Google Drive not authorized. Call authorize() first.');
    }

    const drive = await this.getDriveApi(this.auth);

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name, webViewLink',
    });

    return response.data;
  }
}

// ─── Integration Functions ──────────────────────────────────────────────────

/**
 * Initialize Google Drive client and authorize.
 * Returns a configured GoogleDriveClient instance.
 *
 * @returns {Promise<GoogleDriveClient>} Authorized Google Drive client
 */
export async function initGoogleDrive() {
  const { google } = await import('googleapis');
  const client = new GoogleDriveClient();

  // Create OAuth2 client using googleapis (correct approach for ES modules)
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'  // redirect URI for desktop apps
  );

  // Authorize
  await client.authorize(oauth2Client);

  return client;
}

/**
 * Fetch Excel files from Google Drive input folder.
 *
 * @param {GoogleDriveClient} driveClient - Authorized Google Drive client
 * @param {string} inputFolderId - Google Drive folder ID containing input files
 * @param {string} tempDir - Local temporary directory to download files
 * @returns {Promise<Array>} Array of { fileName, localPath, driveId }
 */
export async function fetchFilesFromGoogleDrive(driveClient, inputFolderId, tempDir) {
  console.log(`📂 Fetching Excel files from Google Drive folder: ${inputFolderId}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // List Excel files
  const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const files = await driveClient.listFiles(inputFolderId, excelMimeType);

  if (files.length === 0) {
    console.log(`   No Excel files found in Google Drive folder.`);
    return [];
  }

  console.log(`   Found ${files.length} Excel file(s)\n`);

  // Download files
  const downloaded = [];
  for (const file of files) {
    const localPath = path.join(tempDir, file.name);
    await driveClient.downloadFile(file.id, localPath);
    downloaded.push({
      fileName: file.name,
      localPath: localPath,
      driveId: file.id,
      driveName: file.name,
    });
  }

  return downloaded;
}

/**
 * Upload .sb files to Google Drive output folder.
 *
 * @param {GoogleDriveClient} driveClient - Authorized Google Drive client
 * @param {string} outputFolderId - Google Drive folder ID for outputs
 * @param {string} localSbDir - Local directory containing .sb files
 * @returns {Promise<Array>} Array of uploaded file metadata
 */
export async function uploadFilesToGoogleDrive(driveClient, outputFolderId, localSbDir) {
  console.log(`\n📤 Uploading .sb files to Google Drive folder: ${outputFolderId}`);

  if (!fs.existsSync(localSbDir)) {
    console.log(`   Local output directory does not exist: ${localSbDir}`);
    return [];
  }

  const sbFiles = fs.readdirSync(localSbDir)
    .filter(f => f.endsWith('.sb'))
    .sort();

  if (sbFiles.length === 0) {
    console.log(`   No .sb files found in: ${localSbDir}`);
    return [];
  }

  const uploaded = [];
  for (const fileName of sbFiles) {
    const localPath = path.join(localSbDir, fileName);
    try {
      const fileMetadata = await driveClient.uploadFile(localPath, outputFolderId);
      uploaded.push({
        fileName: fileName,
        driveId: fileMetadata.id,
        webLink: fileMetadata.webViewLink,
      });
    } catch (err) {
      console.error(`   ❌ Failed to upload ${fileName}: ${err.message}`);
    }
  }

  console.log(`   Uploaded ${uploaded.length}/${sbFiles.length} file(s)\n`);
  return uploaded;
}

// ─── Usage Instructions ─────────────────────────────────────────────────────

/**
 * Print setup instructions for Google Drive integration.
 */
export function printSetupInstructions() {
  console.log(`
${'═'.repeat(60)}
 📁 Google Drive Integration Setup
${'═'.repeat(60)}

1️⃣  Create Google Cloud Project
   - Go to: https://console.cloud.google.com/
   - Create a new project (e.g., "Xemi-Automation")

2️⃣  Enable Google Drive API
   - Go to: API & Services → Library
   - Search for "Google Drive API"
   - Click "Enable"

3️⃣  Create OAuth 2.0 Credentials
   - Go to: API & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Desktop app"
   - Download the JSON file
   - Save as: automation/cha_export/client_secret.json

4️⃣  Set Environment Variables (.env)
   GOOGLE_CLIENT_ID=<from client_secret.json>
   GOOGLE_CLIENT_SECRET=<from client_secret.json>
   GOOGLE_INPUT_FOLDER_ID=<your-input-folder-id>    (optional)
   GOOGLE_OUTPUT_FOLDER_ID=<your-output-folder-id>  (optional)

5️⃣  First Run
   - Run the automation script
   - Open the authorization URL in your browser
   - Grant permissions
   - Token will be saved for future runs

${'═'.repeat(60)}
`);
}

// Export classes for direct use
export { GoogleDriveClient };
