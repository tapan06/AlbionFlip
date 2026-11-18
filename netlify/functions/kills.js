exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: ''
    };
  }
  const srv = (event.queryStringParameters && event.queryStringParameters.server) || 'europe';
  const hosts = {
    europe: 'https://gameinfo-ams.albiononline.com',
    west: 'https://gameinfo.albiononline.com',
    east: 'https://gameinfo-sgp.albiononline.com'
  };
  const host = Object.prototype.hasOwnProperty.call(hosts, srv) ? hosts[srv] : hosts.europe;
  try {
    const r = await fetch(`${host}/api/gameinfo/events?limit=51&offset=0`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'AlbionFlip/2.0' }
    });
    const body = await r.text();
    return {
      statusCode: r.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=60',
        'CDN-Cache-Control': 'public, max-age=60',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
