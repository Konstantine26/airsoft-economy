import AsyncStorage from '@react-native-async-storage/async-storage';

export type ServerConfig = {
  id: string;
  label: string;
  url: string;
  anonKey: string;
  custom?: boolean;
};

export const PREDEFINED_SERVERS: ServerConfig[] = [
  {
    id: 'district-local',
    label: 'api.district-airsoft.ru',
    url: 'https://api.district-airsoft.ru',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg1OTM2MzE2LCJleHAiOjIxMDEyOTYzMTZ9.xVr2IvnEJDl9ATZR_L4WUBB11sjyNnxTopTTlVnJcrI',
  },
  {
    id: 'supabase-cloud',
    label: 'Supabase Cloud',
    url: 'https://kmijlaxjxipmauhuofph.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttaWpsYXhqeGlwbWF1aHVvZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDE5NzgsImV4cCI6MjEwMDQ3Nzk3OH0.Lc7Y7lrB1zYM0Rohj1kqGUVEiVzDV5dH5JR_LTMjC3s',
  },
];

export const DEFAULT_SERVER = PREDEFINED_SERVERS[0];

const CUSTOM_SERVERS_KEY = 'server_config:custom_servers';
const SELECTED_SERVER_KEY = 'server_config:selected_server_id';

export async function getCustomServers(): Promise<ServerConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_SERVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getAllServers(): Promise<ServerConfig[]> {
  return [...PREDEFINED_SERVERS, ...(await getCustomServers())];
}

export async function addCustomServer(input: {
  label: string;
  url: string;
  anonKey: string;
}): Promise<ServerConfig[]> {
  const servers = await getCustomServers();
  const config: ServerConfig = {
    id: `custom-${Date.now()}`,
    label: input.label.trim() || input.url.trim(),
    url: input.url.trim().replace(/\/+$/, ''),
    anonKey: input.anonKey.trim(),
    custom: true,
  };
  const next = [...servers, config];
  try {
    await AsyncStorage.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(next));
  } catch {
    // ignore — worst case the custom server isn't remembered next launch
  }
  return next;
}

export async function removeCustomServer(id: string): Promise<ServerConfig[]> {
  const servers = await getCustomServers();
  const next = servers.filter((s) => s.id !== id);
  try {
    await AsyncStorage.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export async function getSelectedServerId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SELECTED_SERVER_KEY);
  } catch {
    return null;
  }
}

export async function setSelectedServerId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_SERVER_KEY, id);
  } catch {
    // ignore — worst case the choice isn't remembered next launch
  }
}

export async function resolveSelectedServer(): Promise<ServerConfig> {
  const [id, all] = await Promise.all([getSelectedServerId(), getAllServers()]);
  return all.find((s) => s.id === id) ?? DEFAULT_SERVER;
}
