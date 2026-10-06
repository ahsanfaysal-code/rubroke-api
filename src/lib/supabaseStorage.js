const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');

const BUCKET_NAME = 'story-images';

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Upload an image file buffer to Supabase Storage.
 *
 * @param {Object} file - Multer file object ({ buffer, mimetype, originalname })
 * @param {string|number} userId - ID of the authenticated user
 * @returns {Promise<string>} Public URL of the uploaded image
 */
async function uploadStoryImageToSupabase(file, userId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured on the server. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  const ext = mimeToExt[file.mimetype] || path.extname(file.originalname || '').slice(1).toLowerCase() || 'jpg';
  const uniqueName = `${crypto.randomUUID()}.${ext}`;
  const filePath = `${userId}/${uniqueName}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  if (!urlData || !urlData.publicUrl) {
    throw new Error('Failed to retrieve public URL from Supabase Storage');
  }

  return urlData.publicUrl;
}

module.exports = {
  BUCKET_NAME,
  isStorageConfigured,
  getSupabaseClient,
  uploadStoryImageToSupabase,
};
