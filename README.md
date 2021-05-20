# Script de Migration de Drupal vers Strapi

Ceci est un projet pour récupérer les données d'un site drupal existant vers Strapi. 

## Pré-requis 

Pour pouvoir exécuter les scripts pour récupérer les données depuis Drupal, 
il vous faut :

- Avoir Drupal version 8 au minimum, installé sur le serveur
- Avoir accès au tableau de bord de Drupal 
- Activer les extensions [HAL](https://www.drupal.org/docs/8/core/modules/hal/overview) et [REST](https://www.drupal.org/docs/8/core/modules/rest) installées sur le serveur Drupal 
- Avoir un serveur Strapi lancé
- Node Installé

## Comment effectuer la migration ? 

### Côté Drupal

- Ouvrez votre navigateur et connectez-vous sur votre panneau d'admin drupal notamment à l'adresse `https://yourdrupalhost.com/admin/content` (remplacer `yourdrupalhost.com` par votre l'adresse de votre site drupal)
- Sur la même page du navigateur, ouvrez l'inspecteur (`Ctrl + Maj + C`)
  - Allez sur le panneau source
  - Ajouter un nouveau **Snippet**
  - et copiez/coller le contenu du fichier `scrapper.js` 
  - Cliquez sur `Ctrl + Entrer` pour exécuter le script, le navigateur vous demandera de télécharger un fichier -> acceptez
  - Recommencer la dernière opération jusqu'à ce que drupal vous indique page introuvable

Il vous faut mettre tous les fichiers téléchargés dans le même dossier, ceci sera important plus-tard.


### Côté Strapi


- Connectez-vous à l'admin de Strapi et créer un utilisateur sur Strapi ayant un les permissions sur le contenu dont vous voulez modifier.

- Connectez-vous à strapi via API pour en  récupérer le token JWT: 

```bash
curl --request POST \
  --url https://yourstrapihost.com \
  --header "Content-Type: application/json" \
  --data "{ 
	    \"identifier\": \"user@yourstrapihost.com\",
        \"password\": \"password\"
    }"

```

- Le résultat se présentera comme suit :

```json
{
   "jwt":"VOTRE_JWT_RECUPERE_DE_STRAPI",
   "user":{
      "id":1,
      "username":"user",
      "email":"user@yourstrapihost.com",
      "provider":"local",
      "confirmed":true,
      "blocked":false,
      "role":{
         "id":1,
         "name":"API Client",
         "description":"Role given to the api client",
         "type":"authenticated"
      },
      "created_at":"2021-05-11T10:02:46.000Z",
      "updated_at":"2021-05-11T10:02:46.000Z"
   }
}
```

- Changer le fichier `.env` en `.env.local` et modifier les paramètres avec les informations correspondant à votre projet :

```dotenv
STRAPI_HOST={VOTRE_SERVEUR_STRAPI}
DRUPAL_HOST={VOTRE_SERVEUR_DRUPAL}
JWT_TOKEN={VOTRE_JWT_RECUPERE_DE_STRAPI}
```

- Installer les packages nécessaires sur Node : 

```bash
npm install --save
```

- Exécutez le fichier `parser.js` : 

```bash
node rm -r output/ && mkdir output && node --trace-warnings parser.js downloaded output
```

- Exécutez le fichier `exporter.js` : 

```bash
node  --trace-warnings exporter.js  output
```

Remplacer le dossier `output` par le nom du dossier où vous voulez stocker les données de drupal.
Et remplacer le dossier `downloaded` par le nom du dossier où vous avez téléchargé les fichiers de drupal. 
