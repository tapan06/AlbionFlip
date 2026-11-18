// Необязательный скрипт для Cloudflare Workers (бесплатно 100 000 запросов/день),
// если хочется хостить сайт на чистом GitHub Pages и иметь собственный Killboard-прокси.
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' }
      });
    }
    const url = new URL(request.url);
    const srv = url.searchParams.get('server') || 'europe';
    const hosts = {
      europe: 'https://gameinfo-ams.albiononline.com',
      west: 'https://gameinfo.albiononline.com',
      east: 'https://gameinfo-sgp.albiononline.com'
    };
    const target = `${hosts[srv] || hosts.europe}/api/gameinfo/events?limit=51&offset=0`;
    const r = await fetch(target, { headers: { 'Accept': 'application/json', 'User-Agent': 'AlbionFlip/2.0' } });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }
};
