# Club Photo Tain-Tournon

Site officiel du Club Photo Tain-Tournon. Généré avec [Angular CLI](https://github.com/angular/angular-cli) version 21.2.14.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Deploying to Firebase Hosting

> **License notice** — This project is proprietary software (see [LICENSE](LICENSE)).
> Reusing or deploying it requires prior written permission from the author.
> To request permission: pralong.yves@gmail.com

The instructions below are provided for reference, for anyone who has obtained permission to deploy their own instance.

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and npm
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A [Firebase account](https://console.firebase.google.com/)

### 1. Create a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Enable the following services:
   - **Authentication** → Email/Password sign-in method
   - **Firestore Database** → start in production mode
   - **Storage** → start in production mode
   - **Hosting** → register a web app and note the SDK config values

### 2. Configure environment files

Copy the example file and fill in your Firebase project values:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.prod.ts
```

Edit both files with the values from the Firebase console (**Project settings → Your apps → SDK setup and configuration**):

```typescript
export const environment = {
  production: false, // true in environment.prod.ts
  firebase: {
    apiKey: '...',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
    messagingSenderId: '...',
    appId: '...',
    measurementId: '...',
  },
};
```

### 3. Update Firebase project references

Edit `.firebaserc` with your own project ID:

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID"
  }
}
```

Edit `firebase.json` and set `hosting.site` to your Firebase Hosting site name:

```json
"hosting": {
  "site": "YOUR_HOSTING_SITE_NAME",
  ...
}
```

### 4. Deploy rules and build

```bash
firebase login
firebase deploy --only firestore,storage   # Firestore rules/indexes + Storage rules
npm install
npm run build
firebase deploy --only hosting
```

Your site will be live at `https://YOUR_HOSTING_SITE_NAME.web.app`.

### 5. Create the first admin user

Sign up through the app's login page, then manually set `role: "admin"` on your user document in the Firestore console (`users/{uid}`). Subsequent members can be invited from the admin panel.

---

## CI/CD Pipeline (GitHub Actions)

The project includes two GitHub Actions workflows that build and deploy automatically on every push.

| Branch | Workflow | Target |
|---|---|---|
| `develop` | `deploy-dev.yml` | DEV Firebase project |
| `master` | `deploy-prod.yml` | PROD Firebase project |

### How it works

1. On push, the workflow installs dependencies, runs `node set-env.js` to generate the Angular environment files from GitHub Secrets (so no secrets are committed to the repo), builds the app, then deploys to Firebase Hosting using a service account.

### Setting up the secrets

In your GitHub repository go to **Settings → Secrets and variables → Actions** and add the following secrets:

| Secret | Description |
|---|---|
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | e.g. `your-project.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | Sender ID from Firebase console |
| `FIREBASE_APP_ID` | App ID from Firebase console |
| `FIREBASE_MEASUREMENT_ID` | Analytics measurement ID (optional) |
| `FIREBASE_SERVICE_ACCOUNT_CLUBPHOTOPJ` | Service account JSON (see below) |

For the PROD workflow, duplicate the secrets above with a `_PROD` suffix and add `FIREBASE_SERVICE_ACCOUNT_PROD`.

### Generating a service account

1. Firebase Console → **Project settings → Service accounts**
2. Click **Generate new private key** → download the JSON file
3. Paste the entire JSON content as the `FIREBASE_SERVICE_ACCOUNT_*` secret value

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
