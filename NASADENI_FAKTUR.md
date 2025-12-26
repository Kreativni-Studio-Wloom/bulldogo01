# Návod na nasazení faktur za topování do Firebase Functions

## Krok 1: Zkontrolovat Firebase CLI

Ujisti se, že máš nainstalovaný Firebase CLI:
```bash
npm install -g firebase-tools
```

## Krok 2: Přihlásit se do Firebase

```bash
firebase login
```

## Krok 3: Nastavit správný projekt

Projekt je nastaven na: **inzerio-inzerce**

Pro ověření:
```bash
firebase use inzerio-inzerce
```

## Krok 4: Zkompilovat TypeScript (volitelné, ale doporučeno)

Kompilace proběhne automaticky při nasazení, ale můžeš to udělat ručně:
```bash
cd functions
npm run build
cd ..
```

## Krok 5: Nasadit Functions

Nasazení všech functions:
```bash
firebase deploy --only functions
```

Nebo nasadit pouze konkrétní functions (rychlejší):
```bash
firebase deploy --only functions:sendTopAdInvoiceOnCreate,functions:sendTopAdInvoice
```

## Co se nasadí

Po nasazení budou dostupné tyto nové triggers:

1. **sendTopAdInvoiceOnCreate** - Odesílá fakturu při vytvoření checkout session s úspěšnou platbou
2. **sendTopAdInvoice** - Odesílá fakturu při změně statusu checkout session na 'paid'

## Ověření

Po nasazení zkontroluj logy:
```bash
firebase functions:log
```

Nebo v Firebase Console:
1. Otevři Firebase Console
2. Přejdi na Functions
3. Klikni na konkrétní funkci
4. Zobraz si logy

## Testování

Pro otestování:
1. Vytvoř testovací platbu za topování
2. Po úspěšné platbě by se měla automaticky odeslat faktura na **ucetni@bulldogo.cz**
3. Zkontroluj email účetní a logy v Firebase Console

