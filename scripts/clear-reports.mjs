import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('Using URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearReports() {
  const { data, error } = await supabase
    .from('daily_reports')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log('Cleared daily_reports:', data, error);
}

clearReports();
