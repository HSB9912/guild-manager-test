// Cloudflare Worker — guild-manager 이미지 프록시
// R2 버킷에 이미지 업로드/삭제/목록 조회
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // 쓰기 작업은 API 키 인증 필요
    if (request.method === 'POST' || request.method === 'DELETE') {
      if (request.headers.get('X-API-Key') !== env.API_KEY) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    try {
      // POST /upload/guide-images/filename.webp
      if (request.method === 'POST' && path.startsWith('/upload/')) {
        const key = decodeURIComponent(path.slice('/upload/'.length));
        const body = await request.arrayBuffer();
        await env.R2_BUCKET.put(key, body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'image/webp',
            cacheControl: 'public, max-age=604800',
          },
        });
        return json({ success: true, url: `${env.PUBLIC_URL}/${key}` });
      }

      // DELETE /delete/guide-images/filename.webp
      if (request.method === 'DELETE' && path.startsWith('/delete/')) {
        const key = decodeURIComponent(path.slice('/delete/'.length));
        await env.R2_BUCKET.delete(key);
        return json({ success: true });
      }

      // GET /list/guide-images
      if (request.method === 'GET' && path.startsWith('/list/')) {
        const prefix = decodeURIComponent(path.slice('/list/'.length));
        const listed = await env.R2_BUCKET.list({
          prefix: prefix + '/',
          limit: 200,
        });
        const files = listed.objects
          .map((obj) => ({
            name: obj.key.slice(prefix.length + 1), // "guide-images/abc.webp" → "abc.webp"
            size: obj.size,
            created_at: obj.uploaded.toISOString(),
          }))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return json(files);
      }

      return new Response('Not Found', { status: 404, headers: cors });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
