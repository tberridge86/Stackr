import { supabase } from './supabase';

export async function uploadCardScan(uri: string) {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error('Authentication is required to upload a card scan.');

    const response = await fetch(uri);
    const blob = await response.blob();

    const fileName = `${authData.user.id}/scan_${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from('card-scans')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
      });

    if (error) throw error;

    const { data, error: signedUrlError } = await supabase.storage
      .from('card-scans')
      .createSignedUrl(fileName, 300);

    if (signedUrlError) throw signedUrlError;

    return data.signedUrl;
  } catch (error) {
    console.log('Upload failed', error);
    throw error;
  }
}
