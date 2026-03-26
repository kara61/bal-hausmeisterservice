import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

export async function savePhotoFromTwilio(mediaUrl, mediaContentType) {
  const ext = mediaContentType?.includes('png') ? 'png' : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `tasks/${filename}`;

  // Download from Twilio with Basic Auth
  const response = await fetch(mediaUrl, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${config.twilio.accountSid}:${config.twilio.authToken}`
      ).toString('base64'),
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  // Upload to Supabase Storage
  const { error } = await getSupabase().storage
    .from('photos')
    .upload(storagePath, buffer, {
      contentType: mediaContentType || 'image/jpeg',
    });

  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  // Return public URL
  const { data: { publicUrl } } = getSupabase().storage
    .from('photos')
    .getPublicUrl(storagePath);

  return publicUrl;
}
