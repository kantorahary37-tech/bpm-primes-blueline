# Rapport d'avancement — BPM Primes Blueeline (v2)

**Date :** 15 juillet 2026  
**Branche :** `feat/new_feature2`  
**Dernier commit :** `1e55399`

---

## 1. Gestion des critères et notation

| Exigence | Statut | Détails |
|----------|--------|---------|
| Confirmation avant suppression de critère | ✅ Fait | Modal de confirmation avec « Annuler / Supprimer » (`BonusForm.jsx:1584-1590`) |
| Triptyque Coefficient → Note /10 → Montant | ✅ Fait | Tableaux quanti + quali avec les 3 colonnes + formule `PrimeMax × (Coeff/10) × (Note/10)` (`BonusForm.jsx:1186-1230`, `BonusDetail.jsx:185-230`) |

---

## 2. Droits de modification élargis pour les Directeurs

| Exigence | Statut | Détails |
|----------|--------|---------|
| Directeur peut modifier individuellement (mensuel, astreinte, commission) | ✅ Fait | Backend vérifie rôle + département + statut (`endpoints.py:147-166`). Frontend affiche le bouton modifier pour Directeur (`BonusDetail.jsx:251, 620-623`) |

---

## 3. Historique et notification

| Exigence | Statut | Détails |
|----------|--------|---------|
| Journal d'historique traçant les actions sensibles | ✅ Fait | Modèle `AuditLog` avec snapshots avant/après. Modifications, rejets et paiements tracés (`endpoints.py:214-223, 776-781, 829-834`). Affiché dans `BonusDetail.jsx:534-616` |
| Notification automatique au supérieur hiérarchique | ✅ Fait | Modèle `Notification`. DG → notifie manager + directeur. Directeur → notifie manager. Rejet → notifie N+1. UI dropdown avec compteur, mark-all-read (`NotificationDropdown.jsx`) |

---

## 4. Export filtré par type de prime

| Exigence | Statut | Détails |
|----------|--------|---------|
| Export « prime astreinte », « prime mensuelle », etc. | ✅ Fait | Paramètre `bonus_type` sur les endpoints CSV (`/bonuses/export`) et XLSX (`/bonuses/export/xlsx`). Filtre type dans le frontend (`BonusesList.jsx:526-531`). L'XLSX crée aussi des onglets par département |

---

## 5. Section « Autres » dans prime mensuelle

| Exigence | Statut | Détails |
|----------|--------|---------|
| Champ libre libellé | ✅ Fait | Input « Libellé » (`BonusForm.jsx:1450-1452`) |
| PJ obligatoire | ✅ Fait | Champ fichier « Pièce jointe (obligatoire) » (`BonusForm.jsx:1503`) avec validation magic bytes côté backend |
| Champ libre montant | ✅ Fait | Input numérique « Montant (Ar) » (`BonusForm.jsx:1497-1499`) |
| Type (temporaire / périodique / autres) | ✅ Fait | Sélecteur avec option « autres » pour texte libre (`BonusForm.jsx:1456-1464`) |

---

## Améliorations supplémentaires (non demandées)

### Sécurité

| Fonctionnalité | Statut | Détails |
|----------------|--------|---------|
| Authentification obligatoire sur tous les endpoints | ✅ Fait | `Depends(get_current_user)` sur chaque router |
| Upload sécurisé (JWT, whitelist extensions, magic bytes, taille max 10MB, noms UUID) | ✅ Fait | `upload.py` complet |
| Rate-limiting login (5 tentatives / 15 min) | ✅ Fait | `rate_limit.py` + message 429 orange dans `Login.jsx` |
| Vérification rôle/département/statut sur chaque endpoint | ✅ Fait | `validate_bonus`, `update_bonus`, `list_bonuses`, `export`, `get_bonus` |
| Headers de sécurité | 🔲 Reste | CSP, X-Frame-Options, X-Content-Type-Options |

### Fonctionnalités

| Fonctionnalité | Statut | Détails |
|----------------|--------|---------|
| Changement de mot de passe | ✅ Fait | Endpoint `POST /auth/change-password` + modal dans le menu utilisateur |
| Dashboard DRH avec « À marquer payés » | ✅ Fait | Section dédiée au lieu de « À valider par vous », « Voir tout » redirige vers `/bonuses?status=Prime+validée` |
| Kanban visibilité étendue | ✅ Fait | Toutes les colonnes visibles (tous statuts du département), mais cartes non cliquables hors du statut de l'utilisateur |
| Filtres masqués pour N+1/Directeur | ✅ Fait | Les filtres statut/département sont automatiquement appliqués, pas besoin de les afficher |
| Notifications rejet au N+1 | ✅ Fait | Le manager est notifié quand une prime est rejetée |
| Notification rejet au N+1 | ✅ Fait | `endpoints.py:783-796` |

### UX

| Fonctionnalité | Statut | Détails |
|----------------|--------|---------|
| Badge couleur par rôle dans le menu utilisateur | ✅ Fait | DG (ambre), DRH (émeraude), Directeur (violet), N+1 (orange) |
| Indicateur de rejet sur les cartes Kanban | ✅ Fait | Ring rouge sur les primes rejetées |
| Lecture seule sur les colonnes non-attribuées | ✅ Fait | Opacité réduite + label « Lecture seule » |

---

## Récapitulatif global

| Catégorie | Fait | Reste |
|-----------|------|-------|
| Critères / Notation | 2/2 | — |
| Droits Directeur | 1/1 | — |
| Historique / Notifications | 2/2 | — |
| Export par type | 1/1 | — |
| Section « Autres » | 4/4 | — |
| Sécurité | 5/6 | Headers sécurité |
| Fonctionnalités | 4/4 | — |
| UX | 3/3 | — |
| **Total** | **22/23** | **1** |

---

## Fichiers clés du projet

```
backend/
  app/
    api/
      auth_routes.py        — Login, signup, forgot/reset/change password
      endpoints.py          — CRUD primes, validation, export, audit
      upload.py             — Upload sécurisé avec validation
      notifications.py      — CRUD notifications
      users.py              — Gestion utilisateurs
      employees.py          — Gestion employés
      departments.py        — Gestion départements
      prime_max.py          — Gestion plafonds
    models.py               — Modèles Tortoise ORM
    schemas.py              — Schémas Pydantic
    auth.py                 — JWT, bcrypt, get_current_user
    rate_limit.py           — Rate-limiting login
    main.py                 — FastAPI app
    email_service.py        — Envoi emails

frontend/
  src/
    pages/
      Dashboard.jsx         — Dashboard (adapté par rôle)
      BonusForm.jsx         — Formulaire création/édition prime
      BonusDetail.jsx       — Détail prime + historique + audit
      BonusesList.jsx       — Liste primes avec filtres
      BonusKanban.jsx       — Kanban visibilité étendue
      ValidatedBonuses.jsx  — Primes validées (page dédiée)
      Login.jsx             — Connexion (rate-limiting 429)
      ForgotPassword.jsx    — Mot de passe oublié
      ResetPassword.jsx     — Réinitialisation mot de passe
    components/
      Layout.jsx            — Layout + menu utilisateur + change password
      Modal.jsx             — Composant modal réutilisable
      ChangePasswordModal.jsx — Modal changement mot de passe
      NotificationDropdown.jsx — Dropdown notifications
      Icons.jsx             — Icônes SVG
    contexts/
      AuthContext.jsx        — Contexte auth (login, logout, user)
    services/
      api.js                — Service API (axios)
```
