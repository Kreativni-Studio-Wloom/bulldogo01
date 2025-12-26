#!/bin/bash
# Skript pro nasazení Firebase Functions bez nutnosti globální instalace

cd "$(dirname "$0")"

echo "🔥 Používám lokální Firebase CLI..."
echo ""

# Přihlášení do Firebase
echo "1️⃣  Přihlašuji se do Firebase..."
./node_modules/.bin/firebase login --no-localhost

# Nastavení projektu
echo ""
echo "2️⃣  Nastavuji projekt..."
./node_modules/.bin/firebase use inzerio-inzerce

# Zkompilování TypeScript
echo ""
echo "3️⃣  Kompiluji TypeScript..."
cd functions && npm run build && cd ..

# Nasazení functions
echo ""
echo "4️⃣  Nasazuji Firebase Functions..."
./node_modules/.bin/firebase deploy --only functions:sendTopAdInvoiceOnCreate,functions:sendTopAdInvoice

echo ""
echo "✅ Hotovo!"

