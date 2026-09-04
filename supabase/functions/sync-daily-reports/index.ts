import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { google } from "npm:googleapis";

const SYNC_WEBHOOK_SECRET = Deno.env.get("SYNC_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID");
const WORKSHEET_NAME = "Daily Reports";

serve(async (req) => {
  try {
    // 1. Authenticate the Webhook Trigger
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${SYNC_WEBHOOK_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing report_id" }), { status: 400 });
    }

    // 2. Initialize Supabase Service Role Client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Mark as Processing (Idempotency Lock & State Machine)
    const { data: syncRecord, error: syncUpdateErr } = await supabase
      .from('daily_report_sync')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .eq('report_id', report_id)
      .in('status', ['pending', 'failed'])
      .select()
      .single();

    if (syncUpdateErr || !syncRecord) {
      return new Response(JSON.stringify({ message: "Skipped or already processing" }), { status: 200 });
    }

    // 4. Fetch Authoritative Report Data
    const { data: report, error: reportErr } = await supabase
      .from('daily_reports')
      .select(`
        *,
        profiles (
          full_name,
          department_id,
          departments ( name ),
          user_roles ( roles ( name ) )
        ),
        daily_report_tasks (
          completion_percentage,
          time_spent_minutes,
          custom_task_title,
          tasks ( title )
        ),
        daily_report_attachments (
          file_name
        )
      `)
      .eq('id', report_id)
      .single();

    if (reportErr || !report) {
      throw new Error(`Report not found: ${reportErr?.message}`);
    }

    if (report.status !== 'submitted') {
      throw new Error(`Report is not submitted, status is: ${report.status}`);
    }

    // 5. Structure Google Sheet Data
    const submittedAtDate = new Date(report.submitted_at);
    const submittedAtIST = submittedAtDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const lastSyncedAtIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    const formattedTasks = report.daily_report_tasks?.map((t: any) => {
      const title = t.tasks?.title || t.custom_task_title;
      return `${title} (${t.time_spent_minutes}m, ${t.completion_percentage}%)`;
    }).join(" | ") || "None";

    const attachmentCount = report.daily_report_attachments?.length || 0;
    const attachmentNames = report.daily_report_attachments?.map((a: any) => a.file_name).join(", ");
    const formattedEvidence = attachmentCount > 0 
      ? `${attachmentCount} files attached: ${attachmentNames}` 
      : "None";

    const roleName = report.profiles?.user_roles?.[0]?.roles?.name || "Unknown";
    const departmentName = report.profiles?.departments?.name || "Unknown";

    const rowData = [
      report.id, // Column A (Immutable ID)
      report.report_date, // Column B
      report.profiles?.full_name, // Column C
      roleName, // Column D
      departmentName, // Column E
      formattedTasks, // Column F
      report.tomorrow_plan || "", // Column G
      report.blockers || "", // Column H
      report.company_requirements || "", // Column I
      report.notes || "", // Column J
      formattedEvidence, // Column K
      "Submitted", // Column L
      submittedAtIST, // Column M
      lastSyncedAtIST // Column N
    ];

    // 6. Connect to Google Sheets API
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      throw new Error("Google credentials are not configured in environment variables.");
    }

    const auth = new google.auth.JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    
    const sheets = google.sheets({ version: "v4", auth });
    let finalRowIndex = syncRecord.external_row_reference;

    if (finalRowIndex) {
      // Update existing known row
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${WORKSHEET_NAME}!A${finalRowIndex}:N${finalRowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowData] },
      });
    } else {
      // Look up if it exists already (idempotency check)
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `${WORKSHEET_NAME}!A:A`,
      });
      
      let foundIndex = -1;
      if (existing.data.values) {
        foundIndex = existing.data.values.findIndex((row: string[]) => row[0] === report_id);
      }
      
      if (foundIndex !== -1) {
        // Found it, update it
        finalRowIndex = foundIndex + 1; // Sheets is 1-indexed
        await sheets.spreadsheets.values.update({
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `${WORKSHEET_NAME}!A${finalRowIndex}:N${finalRowIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [rowData] },
        });
      } else {
        // Append
        const appendRes = await sheets.spreadsheets.values.append({
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `${WORKSHEET_NAME}!A:N`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [rowData] },
        });
        
        // Extract row index from updatedRange (e.g. "Daily Reports!A15:N15")
        const match = appendRes.data.updates?.updatedRange?.match(/![A-Z]+(\d+):/);
        if (match && match[1]) {
          finalRowIndex = parseInt(match[1], 10);
        }
      }
    }

    // 7. Mark as Synced
    await supabase
      .from('daily_report_sync')
      .update({
        status: 'synced',
        external_row_reference: finalRowIndex,
        synced_at: new Date().toISOString(),
        attempt_count: syncRecord.attempt_count + 1
      })
      .eq('report_id', report_id);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Sync Error:", error.message);
    
    // Attempt to parse report_id from request body if available to mark as failed
    try {
      const clonedReq = req.clone();
      const { report_id } = await clonedReq.json();
      
      if (report_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        // Fetch current attempt count
        const { data: syncRecord } = await supabase.from('daily_report_sync').select('attempt_count').eq('report_id', report_id).single();
        const nextAttempt = (syncRecord?.attempt_count || 0) + 1;
        const nextStatus = nextAttempt >= 5 ? 'permanently_failed' : 'failed';

        await supabase
          .from('daily_report_sync')
          .update({
            status: nextStatus,
            error_message: error.message,
            attempt_count: nextAttempt
          })
          .eq('report_id', report_id);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
