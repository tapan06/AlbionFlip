module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const srv = (req.query && typeof req.query.server === 'string') ? req.query.server : 'europe';
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
    const data = await r.text();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
