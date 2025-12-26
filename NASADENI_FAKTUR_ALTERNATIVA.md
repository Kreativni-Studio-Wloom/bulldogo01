# Alternativní způsoby nasazení Firebase Functions

## Možnost 1: Globální instalace Firebase CLI (doporučeno)

Pokud máš sudo práva, nainstaluj Firebase CLI globálně:

```bash
sudo npm install -g firebase-tools
```

Pak se přihlas:
```bash
firebase login
```

A nasaď:
```bash
firebase deploy --only functions
```

## Možnost 2: Nasadit pouze konkrétní functions

Pokud už máš Firebase CLI nainstalované jinde nebo přes jiný způsob:

```bash
firebase deploy --only functions:sendTopAdInvoiceOnCreate,functions:sendTopAdInvoice
```

## Možnost 3: Nasazení přes Firebase Console

1. Otevři https://console.firebase.google.com
2. Vyber projekt **inzerio-inzerce**
3. Přejdi na **Functions**
4. Klikni na **Deploy functions** nebo použij **Cloud Console** pro Git-based deployment

## Možnost 4: Použít GitHub Actions nebo CI/CD

Pokud máš nastavený GitHub repository, můžeš použít GitHub Actions pro automatické nasazení při push.

## Co se nasadí

Po úspěšném nasazení budou dostupné tyto nové Firebase Functions:

1. **sendTopAdInvoiceOnCreate** 
   - Trigger: `customers/{userId}/checkout_sessions/{sessionId}` onCreate
   - Odesílá fakturu při vytvoření checkout session s úspěšnou platbou za topování

2. **sendTopAdInvoice**
   - Trigger: `customers/{userId}/checkout_sessions/{sessionId}` onUpdate  
   - Odesílá fakturu při změně statusu checkout session na 'paid' pro topování

## Ověření nasazení

Po nasazení zkontroluj:

1. **Firebase Console** → Functions → Měly by být vidět nové funkce
2. **Logy**: `firebase functions:log` nebo v Firebase Console
3. **Test**: Vytvoř testovací platbu za topování a zkontroluj, zda se odeslala faktura na ucetni@bulldogo.cz

## Důležité poznámky

- Functions se automaticky zkompilují před nasazením (díky predeploy v firebase.json)
- Faktury se odesílají pouze na **ucetni@bulldogo.cz**
- Faktury obsahují správné údaje dodavatele (Dominik Hašek, IČO: 17059470)
- Číslo faktury: `TOP-{sessionId}`
- Ochrana před duplicitami: každá faktura se odešle maximálně jednou (díky `invoiceSent` flagu)

