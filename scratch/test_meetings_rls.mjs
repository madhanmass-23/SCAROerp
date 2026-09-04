import { createClient } from '@supabase/supabase-js';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const supabaseUrl = 'https://ltpmselbbgooenwpronx.supabase.co';
const anonKey = 'sb_publishable_bMXcfwxYTZPFZVADGxkLGw_XNxSTdk-';

const client = createClient(supabaseUrl, anonKey);

async function test() {
  const { data: authData, error: loginErr } = await client.auth.signInWithPassword({
    email: 'madhan@scaro.com',
    password: 'Scaro@Madhan2026!'
  });
  if (loginErr) {
    console.error('Login error:', loginErr);
    return;
  }
  console.log('Logged in as:', authData.user.id);

  console.log('--- Testing Query 1: meetings ---');
  const res1 = await client
    .from('meetings')
    .select('id, title, organizer_id')
    .eq('organizer_id', authData.user.id);
  console.log('Query 1 result:', res1.error ? res1.error.message : res1.data);

  console.log('--- Testing Query 2: meeting_participants ---');
  const res2 = await client
    .from('meeting_participants')
    .select('meeting_id, participant_id')
    .eq('participant_id', authData.user.id);
  console.log('Query 2 result:', res2.error ? res2.error.message : res2.data);
}

test();
