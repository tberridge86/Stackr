import { supabase } from './supabase';

export async function uploadCardScan(uri: string) {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const fileName = `scan_${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from('card-scans')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from('card-scans')
      .getPublicUrl(fileName);

    return data.publicUrl;
  } catch (error) {
    console.log('Upload failed', error);
    throw error;
  }
}