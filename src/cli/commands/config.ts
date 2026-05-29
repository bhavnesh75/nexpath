import { openStore, closeStore, DEFAULT_DB_PATH, getConfig, setConfig, deleteConfig } from '../../store/index.js';
import {
  ConfigValidationError,
  setAdvisoryFrequency,
  setRole,
} from '../shared/config-setters.js';

export async function configGetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  const value = getConfig(store.db, key);
  closeStore(store);

  if (value === undefined || value === '') {
    console.log(`${key} = (not set)`);
  } else {
    console.log(`${key} = ${value}`);
  }
}

export async function configSetAction(key: string, value: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  try {
    if (key === 'role' || key.startsWith('role:')) {
      setRole(store, key, value);
    } else if (key === 'advisory_frequency' || key.startsWith('advisory_frequency:')) {
      setAdvisoryFrequency(store, key, value);
    } else {
      setConfig(store, key, value);
    }
  } catch (err) {
    closeStore(store);
    if (err instanceof ConfigValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  closeStore(store);
  console.log(`${key} = ${value}`);
}

export async function configUnsetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  deleteConfig(store, key);
  closeStore(store);
  console.log(`${key} unset`);
}
