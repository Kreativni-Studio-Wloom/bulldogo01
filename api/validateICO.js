// Vercel Serverless Function: Proxy pro HlídačStátu s CORS
export default async function handler(req, res) {
  const allowOrigins = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://bulldogo.cz',
  ];
  const origin = req.headers.origin || '';
  const isAllowed =
    allowOrigins.includes(origin) || /\.vercel\.app$/.test(origin || '');

  // Allow all Vercel preview deployments
  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://bulldogo.cz');
  }
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

    let networkError = false;

    // HlídačStátu API - endpoint pro firmy podle IČO
    const hlidacToken = process.env.HLIDACSTATU_API_TOKEN || '36a6940d34774a5c90270f60ea73130b';
    try {
      const hlidacUrl = `https://api.hlidacstatu.cz/api/v2/firmy/ico/${ico}`;
      const hlidacRes = await fetch(hlidacUrl, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Token ${hlidacToken}`,
          'User-Agent': 'Bulldogo-Vercel/1.0 (+https://bulldogo.cz)'
        }
      });
      if (hlidacRes.ok) {
        const data = await hlidacRes.json().catch(() => ({}));
        // HlídačStátu API vrací FirmaDTO: { ico, jmeno, datoveSchranky, zalozena }
        if (data && data.ico && data.jmeno) {
          return res.status(200).json({ ok: true, name: data.jmeno, seat: null });
        }
      } else if (hlidacRes.status === 404) {
        // Firma neexistuje
        return res.status(200).json({ ok: false, reason: 'Subjekt s tímto IČO nebyl nalezen.' });
      }
      networkError = true;
    } catch (e) {
      networkError = true;
    }

    if (networkError) {
      return res.status(503).json({ ok: false, reason: 'HlídačStátu je dočasně nedostupný. Zkuste to později.' });
    }
    
    return res.status(404).json({ ok: false, reason: 'Subjekt s tímto IČO nebyl nalezen.' });
  } catch (e) {
    return res.status(503).json({ ok: false, reason: 'HlídačStátu je dočasně nedostupný. Zkuste to později.' });
  }
}

