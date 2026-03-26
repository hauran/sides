import supabase from "./db/index.js";

/** Upload a buffer to Supabase Storage, overwriting if exists. */
export async function uploadFile(
  bucket: string,
  filePath: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed (${bucket}/${filePath}): ${error.message}`);
  return filePath;
}

/** Get a public URL for a file in a public bucket. */
export function publicUrl(bucket: string, filePath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/** Download a file from Supabase Storage as a Buffer. */
export async function downloadFile(bucket: string, filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) throw new Error(`Storage download failed (${bucket}/${filePath}): ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Delete one or more files from a bucket. */
export async function deleteFiles(bucket: string, filePaths: string[]): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove(filePaths);
  if (error) throw new Error(`Storage delete failed (${bucket}): ${error.message}`);
}

/** Check if a file exists in a bucket. */
export async function fileExists(bucket: string, filePath: string): Promise<boolean> {
  const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
  const name = filePath.includes("/") ? filePath.substring(filePath.lastIndexOf("/") + 1) : filePath;
  const { data } = await supabase.storage.from(bucket).list(dir || undefined, {
    search: name,
    limit: 1,
  });
  return (data ?? []).some((f) => f.name === name);
}
