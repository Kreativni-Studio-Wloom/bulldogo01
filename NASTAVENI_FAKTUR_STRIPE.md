# Nastavení odesílání faktur pro Stripe

## Přehled

Po úspěšné platbě přes Stripe se automaticky odesílá faktura:
- **Uživateli** na jeho email (z profilu nebo z Stripe customer data)
- **Účetní** na nastavený email (pokud je nastavený)

## Jak to funguje

Systém používá Firestore triggery, které se spustí automaticky:
1. **`sendStripeInvoice`** - spustí se při vytvoření nové Stripe subscription
2. **`sendStripeInvoiceOnUpdate`** - spustí se při změně statusu subscription na aktivní

Faktura se odešle pouze když:
- Subscription má status `active` nebo `trialing`
- Faktura ještě nebyla odeslána (ochrana před duplicitami)

## Nastavení emailu pro účetní

### Metoda 1: Pomocí Firebase Functions Config (doporučeno)

```bash
cd functions
firebase functions:config:set accounting.email="ucetni@bulldogo.cz"
firebase deploy --only functions
```

### Metoda 2: Přímá úprava v kódu

Pokud nechcete používat config, můžete upravit přímo v souboru `functions/src/index.ts`:

Najděte řádek:
```typescript
const accountingEmail = functions.config().accounting?.email || "ucetni@bulldogo.cz";
```

A změňte výchozí email:
```typescript
const accountingEmail = functions.config().accounting?.email || "vas-email@bulldogo.cz";
```

## Co se odesílá

### Faktura obsahuje:
- Číslo faktury (zkrácené subscription ID)
- Datum vystavení
- Údaje dodavatele (BULLDOGO.CZ)
- Údaje odběratele (uživatel, IČO, DIČ, název firmy)
- Položky (balíček, cena z Stripe)
- Celková částka
- Platební údaje

### Formát
- HTML email s profesionálním designem
- Textová verze jako fallback

## Struktura dat v Firestore

Subscription jsou uloženy v:
```
customers/{userId}/subscriptions/{subscriptionId}
```

Po odeslání faktury se do subscription přidá:
- `invoiceSent: true`
- `invoiceSentAt: timestamp`

## Testování

Pro testování faktur:
1. Vytvořte testovací platbu přes Stripe Checkout
2. Po úspěšné platbě se subscription vytvoří v Firestore
3. Trigger se automaticky spustí a odešle fakturu
4. Zkontrolujte email uživatele
5. Zkontrolujte email účetní (pokud je nastavený)

## Poznámky

- Faktury se odesílají automaticky po úspěšné platbě (status "active" nebo "trialing")
- Pokud uživatel nemá email, faktura se neodešle (zaloguje se varování)
- Faktury se odesílají pouze jednou (ochrana před duplicitami pomocí `invoiceSent` flagu)
- Ceny se berou z Stripe subscription data (v centech, převádí se na koruny)

## Deployment

Po úpravě kódu nezapomeňte nasadit funkce:

```bash
cd functions
firebase deploy --only functions
```

