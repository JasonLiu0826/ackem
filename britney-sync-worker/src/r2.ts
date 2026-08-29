import { Env } from './types'

// Upload image to R2
export async function uploadImage(
  env: Env,
  imageId: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  const key = `images/${imageId}`
  
  await env.IMAGES.put(key, data, {
    httpMetadata: { contentType }
  })
  
  return key
}

// Get image from R2
export async function getImage(
  env: Env,
  r2Key: string
): Promise<R2ObjectBody | null> {
  return env.IMAGES.get(r2Key)
}

// Delete image from R2
export async function deleteImage(
  env: Env,
  r2Key: string
): Promise<void> {
  await env.IMAGES.delete(r2Key)
}
