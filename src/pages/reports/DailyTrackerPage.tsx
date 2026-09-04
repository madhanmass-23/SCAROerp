import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { FileText, Save, Send, Plus, Trash2, CheckCircle2, UploadCloud, X, File } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import { useNavigate } from 'react-router-dom';

type Task = {
  id: string;
  title: string;
  status: string;
};

type DailyReportTask = {
  id?: string; // missing if new
  task_id: string | null; // null if custom
  custom_task_title?: string;
  time_spent_minutes: number;
  completion_percentage: number;
  task_status: string;
};

export const DailyTrackerPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Data State
  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('draft');
  const [notes, setNotes] = useState('');
  const [blockers, setBlockers] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [companyRequirements, setCompanyRequirements] = useState('');
  
  // Related State
  const [reportTasks, setReportTasks] = useState<DailyReportTask[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  
  // Evidence Upload
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedEvidence, setUploadedEvidence] = useState<{ id: string, file_name: string, storage_path: string, file_size: number }[]>([]);

  useEffect(() => {
    fetchTodayReport();
  }, [user]);

  const fetchTodayReport = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Fetch available tasks for the user
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('assignee_id', user.id)
        .neq('status', 'Completed'); // Only show active tasks usually, or let them pick recently completed
      
      if (tasksData) setAvailableTasks(tasksData);

      // 2. Fetch today's report
      const { data: reportData, error: reportErr } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('report_date', today)
        .maybeSingle();

      if (reportErr) throw reportErr;

      if (reportData) {
        setReportId(reportData.id);
        setStatus(reportData.status);
        setNotes(reportData.notes || '');
        setBlockers(reportData.blockers || '');
        setTomorrowPlan(reportData.tomorrow_plan || '');
        setCompanyRequirements(reportData.company_requirements || '');
        
        // Fetch tasks linked to this report
        const { data: reportTasksData } = await supabase
          .from('daily_report_tasks')
          .select('*')
          .eq('report_id', reportData.id);
          
        if (reportTasksData) {
          setReportTasks(reportTasksData);
        }

        // Fetch evidence
        const { data: attachments } = await supabase
          .from('daily_report_attachments')
          .select('*')
          .eq('report_id', reportData.id);
        
        if (attachments) {
          setUploadedEvidence(attachments);
        }
      } else {
        // Look up yesterday's plan to auto-fill
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const { data: yData } = await supabase
          .from('daily_reports')
          .select('tomorrow_plan')
          .eq('user_id', user.id)
          .eq('report_date', yesterdayStr)
          .maybeSingle();
          
        if (yData?.tomorrow_plan) {
          setNotes(`Planned for today:\n${yData.tomorrow_plan}\n\nWork done:\n`);
        }
      }

    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReportTask = () => {
    setReportTasks([...reportTasks, {
      task_id: null,
      custom_task_title: '',
      time_spent_minutes: 60,
      completion_percentage: 10,
      task_status: 'In Progress'
    }]);
  };

  const updateReportTask = (index: number, updates: Partial<DailyReportTask>) => {
    const newTasks = [...reportTasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    setReportTasks(newTasks);
  };

  const removeReportTask = (index: number) => {
    const newTasks = [...reportTasks];
    newTasks.splice(index, 1);
    setReportTasks(newTasks);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const removeUploadedEvidence = async (id: string, storagePath: string) => {
    if (status === 'submitted') return;
    try {
      // Delete from DB metadata
      await supabase.from('daily_report_attachments').delete().eq('id', id);
      // Delete from Storage
      await supabase.storage.from('daily-evidence').remove([storagePath]);
      
      setUploadedEvidence(current => current.filter(e => e.id !== id));
    } catch (err) {
      console.error('Failed to remove evidence', err);
    }
  };

  const saveReport = async (submitAction: 'draft' | 'submitted') => {
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      
      const today = new Date().toISOString().split('T')[0];
      let currentReportId = reportId;

      // 1. Upsert daily_reports
      const reportPayload = {
        user_id: user.id,
        report_date: today,
        status: submitAction,
        notes,
        blockers,
        tomorrow_plan: tomorrowPlan,
        company_requirements: companyRequirements,
        submitted_at: submitAction === 'submitted' ? new Date().toISOString() : null
      };

      if (currentReportId) {
        const { error: updateErr } = await supabase
          .from('daily_reports')
          .update(reportPayload)
          .eq('id', currentReportId);
        if (updateErr) throw updateErr;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('daily_reports')
          .insert(reportPayload)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        currentReportId = inserted.id;
        setReportId(currentReportId);
      }

      // 2. Sync daily_report_tasks
      // Delete old tasks for simplicity, then insert all (safe since there are no foreign keys pointing to daily_report_tasks)
      if (currentReportId) {
        await supabase.from('daily_report_tasks').delete().eq('report_id', currentReportId);
        
        if (reportTasks.length > 0) {
          const tasksPayload = reportTasks.map(t => ({
            report_id: currentReportId,
            task_id: t.task_id || null,
            custom_task_title: t.task_id ? null : t.custom_task_title,
            time_spent_minutes: t.time_spent_minutes,
            completion_percentage: t.completion_percentage,
            task_status: t.task_status
          }));
          const { error: taskErr } = await supabase.from('daily_report_tasks').insert(tasksPayload);
          if (taskErr) throw taskErr;
          
          // Also optionally update the actual Task's status if they changed it
          for (const t of reportTasks) {
             if (t.task_id && t.task_status) {
               await supabase.from('tasks').update({ status: t.task_status }).eq('id', t.task_id);
             }
          }
        }
      }

      // 3. Upload new Evidence files
      if (currentReportId && files.length > 0) {
        const uploadedRecords = [];
        for (const file of files) {
          const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const fileName = `${Date.now()}-${cleanName}`;
          const filePath = `${user.id}/${today}/${fileName}`;
          
          const { error: uploadErr } = await supabase.storage
            .from('daily-evidence')
            .upload(filePath, file);
            
          if (uploadErr) throw uploadErr;
          
          // Save metadata
          const { data: attachData, error: attachErr } = await supabase
            .from('daily_report_attachments')
            .insert({
              report_id: currentReportId,
              uploaded_by: user.id,
              file_name: file.name,
              storage_path: filePath,
              file_size: file.size,
              file_type: file.type
            })
            .select()
            .single();
            
          if (attachErr) throw attachErr;
          if (attachData) uploadedRecords.push(attachData);
        }
        setFiles([]); // Clear local files queue
        setUploadedEvidence([...uploadedEvidence, ...uploadedRecords]);
      }

      setStatus(submitAction);
      
      if (submitAction === 'submitted') {
        showSuccess('Daily report submitted successfully!');
        const targetDashboard = role === 'Intern' ? '/app/intern/dashboard' : '/app/dashboard';
        navigate(targetDashboard);
      } else {
        showSuccess('Draft saved successfully');
      }

    } catch (err: any) {
      setError(err);
      showError(err.message || 'Failed to save daily report');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState text="Loading today's tracker..." />;
  if (error) return <ErrorState title="Failed to load tracker" message={error.message} onRetry={fetchTodayReport} />;

  const isLocked = status === 'submitted';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-content flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Daily Work Tracker
        </h1>
        {isLocked && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-status-success/10 text-status-success rounded-full text-sm font-medium border border-status-success/20">
            <CheckCircle2 className="h-4 w-4" /> Submitted
          </div>
        )}
      </div>

      {isLocked && (
        <div className="bg-surface-muted border border-border p-4 rounded-lg text-sm text-content-muted">
          Your daily report has been submitted and is now locked for review. If you need to make changes, please contact your manager.
        </div>
      )}

      {/* Tasks Worked On */}
      <Card>
        <CardHeader>
          <CardTitle>Tasks & Time Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportTasks.length === 0 ? (
            <p className="text-sm text-content-muted italic">No tasks added for today.</p>
          ) : (
            <div className="space-y-4">
              {reportTasks.map((rt, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-surface-muted border border-border rounded-lg relative">
                  {!isLocked && (
                    <button 
                      onClick={() => removeReportTask(index)}
                      className="absolute top-2 right-2 text-content-muted hover:text-status-danger p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  
                  <div className="col-span-12 md:col-span-4">
                    <label className="block text-xs font-medium text-content-muted mb-1">Task</label>
                    <select
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                      value={rt.task_id || 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          updateReportTask(index, { task_id: null, custom_task_title: '' });
                        } else {
                          updateReportTask(index, { task_id: val, custom_task_title: '' });
                        }
                      }}
                      disabled={isLocked}
                    >
                      <option value="custom">-- Custom / Unassigned Task --</option>
                      {availableTasks.map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                    {!rt.task_id && (
                      <input 
                        type="text"
                        placeholder="Describe custom task"
                        className="w-full mt-2 bg-surface border border-border rounded-md px-3 py-2 text-sm disabled:opacity-60"
                        value={rt.custom_task_title || ''}
                        onChange={(e) => updateReportTask(index, { custom_task_title: e.target.value })}
                        disabled={isLocked}
                      />
                    )}
                  </div>
                  
                  <div className="col-span-4 md:col-span-2">
                    <label className="block text-xs font-medium text-content-muted mb-1">Time (mins)</label>
                    <input 
                      type="number"
                      min="0"
                      step="15"
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm disabled:opacity-60"
                      value={rt.time_spent_minutes}
                      onChange={(e) => updateReportTask(index, { time_spent_minutes: parseInt(e.target.value) || 0 })}
                      disabled={isLocked}
                    />
                  </div>
                  
                  <div className="col-span-4 md:col-span-3">
                    <label className="block text-xs font-medium text-content-muted mb-1">Progress (%)</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        className="flex-1 disabled:opacity-60"
                        value={rt.completion_percentage}
                        onChange={(e) => updateReportTask(index, { completion_percentage: parseInt(e.target.value) || 0 })}
                        disabled={isLocked}
                      />
                      <span className="text-sm font-medium w-10 text-right">{rt.completion_percentage}%</span>
                    </div>
                  </div>
                  
                  <div className="col-span-4 md:col-span-3">
                    <label className="block text-xs font-medium text-content-muted mb-1">Status</label>
                    <select
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm disabled:opacity-60"
                      value={rt.task_status}
                      onChange={(e) => updateReportTask(index, { task_status: e.target.value })}
                      disabled={isLocked}
                    >
                      <option value="Todo">Todo</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Review">Review</option>
                      <option value="Needs Revision">Needs Revision</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!isLocked && (
            <Button variant="outline" size="sm" onClick={handleAddReportTask} className="w-full mt-2">
              <Plus className="h-4 w-4 mr-2" /> Add Task Record
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Narrative Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">General Notes & Completed Work</label>
            <p className="text-xs text-content-muted mb-2">Summarize any other work completed today.</p>
            <textarea
              className="w-full h-32 bg-surface border border-border rounded-md px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 resize-none"
              placeholder="What else did you accomplish?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLocked}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">Blockers & Challenges</label>
              <textarea
                className="w-full h-24 bg-surface border border-border rounded-md px-4 py-3 text-sm focus:border-primary disabled:opacity-60 resize-none"
                placeholder="Anything slowing you down?"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                disabled={isLocked}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-content mb-1">Plan for Tomorrow</label>
              <textarea
                className="w-full h-24 bg-surface border border-border rounded-md px-4 py-3 text-sm focus:border-primary disabled:opacity-60 resize-none"
                placeholder="What will you work on tomorrow?"
                value={tomorrowPlan}
                onChange={(e) => setTomorrowPlan(e.target.value)}
                disabled={isLocked}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-content mb-1">Company Requirements & Remarks</label>
            <input
              type="text"
              className="w-full bg-surface border border-border rounded-md px-4 py-2 text-sm focus:border-primary disabled:opacity-60"
              placeholder="E.g., Requested new software license, leave notice, etc."
              value={companyRequirements}
              onChange={(e) => setCompanyRequirements(e.target.value)}
              disabled={isLocked}
            />
          </div>
        </CardContent>
      </Card>

      {/* Evidence Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence & Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLocked && (
            <div className="mb-4">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-surface-muted hover:bg-surface transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 mb-2 text-content-muted" />
                  <p className="mb-2 text-sm text-content-muted"><span className="font-semibold text-primary">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-content-muted">PNG, JPG, PDF up to 10MB</p>
                </div>
                <input type="file" className="hidden" multiple onChange={handleFileChange} />
              </label>
            </div>
          )}

          <div className="space-y-2">
            {/* Previously uploaded evidence */}
            {uploadedEvidence.map(ev => (
              <div key={ev.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-md">
                <div className="flex items-center gap-3 overflow-hidden">
                  <File className="h-5 w-5 text-primary shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium text-content truncate">{ev.file_name}</p>
                    <p className="text-xs text-content-muted">{(ev.file_size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                {!isLocked && (
                  <button onClick={() => removeUploadedEvidence(ev.id, ev.storage_path)} className="text-content-muted hover:text-status-danger p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            
            {/* New files pending upload */}
            {files.map((file, i) => (
              <div key={`new-${i}`} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-md">
                <div className="flex items-center gap-3 overflow-hidden">
                  <File className="h-5 w-5 text-primary shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-medium text-content truncate">{file.name}</p>
                    <p className="text-xs text-content-muted">Pending upload ({(file.size / 1024).toFixed(1)} KB)</p>
                  </div>
                </div>
                <button onClick={() => removeFile(i)} className="text-content-muted hover:text-status-danger p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            
            {uploadedEvidence.length === 0 && files.length === 0 && (
               <p className="text-sm text-content-muted italic">No evidence attached.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {!isLocked && (
        <div className="flex items-center justify-end gap-4 pt-4">
          <Button 
            variant="outline" 
            onClick={() => saveReport('draft')}
            disabled={submitting}
            isLoading={submitting && status !== 'submitted'}
          >
            <Save className="h-4 w-4 mr-2" /> Save Draft
          </Button>
          <Button 
            variant="primary"
            onClick={() => {
              if (window.confirm("Are you sure you want to submit? You won't be able to edit this report later.")) {
                saveReport('submitted');
              }
            }}
            disabled={submitting}
            isLoading={submitting}
          >
            <Send className="h-4 w-4 mr-2" /> Submit Report
          </Button>
        </div>
      )}
    </div>
  );
};
