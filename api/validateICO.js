// Vercel Serverless Function: Proxy pro ARES s CORS
export default async function handler(req, res) {
  const allowOrigins = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://bulldogo.cz',
  ];
  const origin = req.headers.origin || '';
  const isAllowed =
    allowOrigins.includes(origin) || /\.vercel\.app$/.test(origin || '');

  res.setHeader(
    'Access-Control-Allow-Origin',
    isAllowed ? origin : 'https://bulldogo.cz'
  );
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const ico = (req.query.ico || '').toString().replace(/\D+/g, '').slice(0, 8);
    if (ico.length !== 8) {
      return res.status(400).json({ ok: false, reason: 'IČO musí mít 8 číslic.' });
    }

    const aresUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-be/v1/ekonomicke-subjekty/${ico}`;
    const aresRes = await fetch(aresUrl, { method: 'GET' });
    if (!aresRes.ok) {
      return res
        .status(404)
        .json({ ok: false, reason: 'Subjekt s tímto IČO nebyl nalezen.' });
    }
    const data = await aresRes.json().catch(() => ({}));
    if (!data) {
      return res
        .status(404)
        .json({ ok: false, reason: 'Subjekt s tímto IČO nebyl nalezen.' });
    }
    const companyName =
      data.obchodniJmeno || data.obchodni_name || data.obchodni_jmeno || '';
    const seat = data.sidlo || data.sídlo || data.seat || null;
    return res.status(200).json({ ok: true, name: companyName, seat });
  } catch (e) {
    return res
      .status(503)
      .json({ ok: false, reason: 'ARES je dočasně nedostupný. Zkuste to později.' });
  }
}

