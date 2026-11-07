import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** VITE_FIREBASE_* が未設定（ローカル開発で API が AUTH_MODE=disabled）のときは null */
export const auth: Auth | null = (() => {
  if (!config.apiKey || !config.authDomain || !config.projectId) return null;
  const instance = getAuth(initializeApp(config));
  void setPersistence(instance, browserLocalPersistence);
  return instance;
})();
