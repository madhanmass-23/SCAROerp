import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.admin.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log("--- Testing Messages RLS ---");
  // 1. Sign in as employee@scaro.com
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'employee@scaro.com',
    password: 'Password123!' // From provision script standard
  });

  if (authErr) {
    console.error("Auth failed:", authErr.message);
    return;
  }
  
  console.log("Logged in as employee:", authData.user.id);
  const employeeId = authData.user.id;

  // 2. Try to fetch messages
  const { data: fetchMsgs, error: fetchErr } = await supabase.from('messages').select('*').limit(5);
  console.log("Fetch messages:", fetchErr ? fetchErr.message : (fetchMsgs.length + " messages found."));

  // 3. Try to insert a message as employee, where sender_id is someone else
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { data: insFake, error: insFakeErr } = await supabase.from('messages').insert({
    sender_id: fakeId,
    recipient_id: employeeId,
    content: "Spoofed message"
  });
  console.log("Insert spoofed sender:", insFakeErr ? insFakeErr.message : "SUCCESS (UH OH)");

  // 4. Try to insert a message where employee is sender
  const { data: insValid, error: insValidErr } = await supabase.from('messages').insert({
    sender_id: employeeId,
    recipient_id: fakeId,
    content: "Valid message"
  });
  console.log("Insert valid sender:", insValidErr ? insValidErr.message : "SUCCESS");
}

inspect();
