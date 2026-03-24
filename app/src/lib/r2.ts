const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL ?? 'https://guild-images.hongsb9912.workers.dev'
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL ?? 'https://pub-ee3a7d1dfe0a442b96336f0c81289a46.r2.dev'
const R2_API_KEY = import.meta.env.VITE_R2_API_KEY ?? 'guild-manager-r2-key-2026'

export { R2_PUBLIC_URL }

export async function r2Upload(bucket: string, filename: string, file: Blob): Promise<string> {
  const res = await fetch(`${R2_WORKER_URL}/upload/${bucket}/${filename}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/webp', 'X-API-Key': R2_API_KEY },
    body: file,
  })
  const data = await res.json()
  return data.url
}

export async function r2Delete(bucket: string, filename: string): Promise<void> {
  await fetch(`${R2_WORKER_URL}/delete/${bucket}/${filename}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': R2_API_KEY },
  })
}

export async function r2List(bucket: string) {
  const res = await fetch(`${R2_WORKER_URL}/list/${bucket}`)
  return res.json() as Promise<{ name: string; size: number; created_at: string }[]>
}
