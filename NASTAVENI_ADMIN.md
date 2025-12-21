# Nastavení Admin Statusu pro Uživatele

## Admin uživatel:
- **Email**: admin@bulldogo.cz
- **Heslo**: Bulldogo
- **UID**: c8eMk8gNI9RZzLWucfBWRu8gYx42

## Metoda 1: Přes Firebase Console (Nejjednodušší)

1. Otevři [Firebase Console](https://console.firebase.google.com/)
2. Vyber projekt **inzerio-inzerce**
3. Jdi na **Firestore Database**
4. Najdi dokument: `users/c8eMk8gNI9RZzLWucfBWRu8gYx42/profile/profile`
5. Pokud dokument neexistuje, vytvoř ho
6. Přidej nebo uprav pole:
   ```json
   {
     "isAdmin": true,
     "role": "admin"
   }
   ```
7. Ulož změny

## Metoda 2: Přes Firebase Function (Po deployi)

1. Deployni funkci:
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions:setAdminStatus
   ```

2. Zavolej funkci přes HTTP:
   ```bash
   curl -X POST https://europe-west1-inzerio-inzerce.cloudfunctions.net/setAdminStatus \
     -H "Content-Type: application/json" \
     -d '{"uid": "c8eMk8gNI9RZzLWucfBWRu8gYx42"}'
   ```

   Nebo přes GET:
   ```
   https://europe-west1-inzerio-inzerce.cloudfunctions.net/setAdminStatus?uid=c8eMk8gNI9RZzLWucfBWRu8gYx42
   ```

## Metoda 3: Přes Firebase CLI (Pokud máš přihlášený Firebase CLI)

```bash
firebase firestore:set users/c8eMk8gNI9RZzLWucfBWRu8gYx42/profile/profile \
  '{"isAdmin": true, "role": "admin"}' \
  --project inzerio-inzerce
```

## Ověření

Po nastavení admin statusu:
1. Přihlas se jako admin@bulldogo.cz
2. V sidebaru by se měla zobrazit sekce **ADMIN** s odkazy:
   - Dashboard
   - Uživatelé
   - Inzeráty
   - Statistiky

## Poznámka

Admin status se kontroluje v pořadí:
1. Firebase profil (`isAdmin: true` nebo `role: 'admin'`)
2. Email (`admin@bulldogo.cz` nebo `support@bulldogo.cz`)
3. localStorage (`adminLoggedIn: 'true'` - pro dashboard login)

