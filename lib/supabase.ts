import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { DEFAULT_SERVER, type ServerConfig } from './serverConfig';

export let supabase: SupabaseClient<Database>;
export let currentServer: ServerConfig = DEFAULT_SERVER;

export function configureSupabase(server: ServerConfig): SupabaseClient<Database> {
  currentServer = server;
  supabase = createClient<Database>(server.url, server.anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabase;
}

configureSupabase(DEFAULT_SERVER);
