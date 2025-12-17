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

    let networkError = false;

    // Primární REST JSON API
    try {
      const aresUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-be/v1/ekonomicke-subjekty/${ico}`;
      const aresRes = await fetch(aresUrl, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Bulldogo-Vercel/1.0 (+https://bulldogo.cz)'
        }
      });
      if (aresRes.ok) {
        const data = await aresRes.json().catch(() => ({}));
        if (data && (data.obchodniJmeno || data.obchodni_jmeno || data.obchodni_name || data.ico || data.IC)) {
          const companyName = data.obchodniJmeno || data.obchodni_jmeno || data.obchodni_name || '';
          const seat = data.sidlo || data.sídlo || data.seat || null;
          return res.status(200).json({ ok: true, name: companyName, seat });
        }
      }
      networkError = true;
    } catch (e) {
      networkError = true;
    }

    // Fallback na XML API (stejně jako ve Firebase Function)
    try {
      const urlXml1 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/darv_bas.cgi?ico=${ico}`;
      const xmlRes1 = await fetch(urlXml1, {
        method: 'GET',
        headers: {
          'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Bulldogo-Vercel/1.0 (+https://bulldogo.cz)'
        }
      });
      
      let xml = '';
      if (xmlRes1.ok) {
        xml = await xmlRes1.text().catch(() => '');
      }
      
      if (!xml || xml.length < 50) {
        const urlXml2 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/xar.cgi?ico=${ico}&jazyk=cz&xml=1`;
        const xmlRes2 = await fetch(urlXml2, {
          method: 'GET',
          headers: {
            'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Bulldogo-Vercel/1.0 (+https://bulldogo.cz)'
          }
        });
        if (xmlRes2.ok) {
          xml = await xmlRes2.text().catch(() => '');
        }
      }

      if (xml && xml.length >= 50) {
        const icoMatch = xml.match(/<[^>]*ICO[^>]*>\s*([0-9]{8})\s*<\/[^>]*ICO[^>]*>/i);
        let name = null;
        const nameMatchOF = xml.match(/<[^>]*OF[^>]*>\s*([^<]+)\s*<\/[^>]*OF[^>]*>/i);
        const nameMatchObchodniFirma = xml.match(/<Obchodni[_ ]?firma[^>]*>\s*([^<]+)\s*<\/Obchodni[_ ]?firma[^>]*>/i);
        if (nameMatchOF && nameMatchOF[1]) name = nameMatchOF[1].trim();
        else if (nameMatchObchodniFirma && nameMatchObchodniFirma[1]) name = nameMatchObchodniFirma[1].trim();

        if (icoMatch && icoMatch[1]) {
          return res.status(200).json({ ok: true, ico, name });
        }
      }
      networkError = true;
    } catch (e) {
      networkError = true;
    }

    if (networkError) {
      return res.status(503).json({ ok: false, reason: 'ARES je dočasně nedostupný. Zkuste to později.' });
    }
    
    return res.status(404).json({ ok: false, reason: 'Subjekt s tímto IČO nebyl nalezen.' });
  } catch (e) {
    return res.status(503).json({ ok: false, reason: 'ARES je dočasně nedostupný. Zkuste to později.' });
  }
}

