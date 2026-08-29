import { Env } from './types'
import { handlePull, handlePush, handlePair, handleGeneratePairCode, handleStatus, handleDevices, handleUnpair } from './sync'
import { uploadImage, getImage } from './r2'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
    }

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      let response: Response

      // Route requests
      if (path === '/api/sync/pull' && method === 'POST') {
        response = await handlePull(env, request)
      } else if (path === '/api/sync/push' && method === 'POST') {
        response = await handlePush(env, request)
      } else if (path === '/api/sync/pair' && method === 'POST') {
        response = await handlePair(env, request)
      } else if (path === '/api/sync/pair-code' && method === 'POST') {
        response = await handleGeneratePairCode(env, request)
      } else if (path === '/api/sync/status' && method === 'GET') {
        response = await handleStatus(env, request)
      } else if (path === '/api/sync/devices' && method === 'GET') {
        response = await handleDevices(env, request)
      } else if (path.startsWith('/api/sync/device/') && method === 'DELETE') {
        const deviceId = path.split('/').pop()!
        response = await handleUnpair(env, request, deviceId)
      } else if (path === '/api/image/upload' && method === 'POST') {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const imageId = formData.get('imageId') as string
        
        if (!file || !imageId) {
          response = Response.json({ error: 'Missing file or imageId' }, { status: 400 })
        } else {
          const key = await uploadImage(env, imageId, await file.arrayBuffer(), file.type)
          response = Response.json({ ok: true, key })
        }
      } else if (path.startsWith('/api/image/') && method === 'GET') {
        const r2Key = path.replace('/api/image/', '')
        const object = await getImage(env, `images/${r2Key}`)
        
        if (!object) {
          response = new Response('Not found', { status: 404 })
        } else {
          response = new Response(object.body, {
            headers: {
              'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
              'Cache-Control': 'public, max-age=31536000',
            }
          })
        }
      } else if (path === '/health') {
        response = Response.json({ status: 'ok', timestamp: Date.now() })
      } else {
        response = Response.json({ error: 'Not found' }, { status: 404 })
      }

      // Add CORS headers to response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
      
      return response
    } catch (error) {
      return Response.json(
        { error: 'Internal server error', details: (error as Error).message },
        { status: 500, headers: corsHeaders }
      )
    }
  }
}
