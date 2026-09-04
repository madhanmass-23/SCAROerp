import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { Settings, Save, RotateCcw, Clock, Building2, Calendar } from 'lucide-react';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface CompanySettings {
  id: string;
  company_name: string;
  timezone: string;
  working_days: string[];
  work_start_time: string;
  work_end_time: string;
  daily_report_reminder_time: string;
  late_threshold_minutes: number;
}

export const CompanySettingsPage: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: sErr } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();

      if (sErr) throw sErr;
      setSettings(data);
    } catch (err: any) {
      console.error('Error fetching company settings:', err);
      setError(err.message || 'Failed to load company settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDayToggle = (day: string) => {
    if (!settings) return;
    const current = settings.working_days || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    setSettings({ ...settings, working_days: next });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      const { error: updErr } = await supabase
        .from('company_settings')
        .update({
          company_name: settings.company_name,
          timezone: settings.timezone,
          working_days: settings.working_days,
          work_start_time: settings.work_start_time,
          work_end_time: settings.work_end_time,
          daily_report_reminder_time: settings.daily_report_reminder_time,
          late_threshold_minutes: Number(settings.late_threshold_minutes),
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (updErr) throw updErr;
      showSuccess('Company settings successfully updated');
    } catch (err: any) {
      console.error('Error updating settings:', err);
      showError(err.message || 'Failed to update company settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState text="Loading company settings..." />;
  if (error) return <ErrorState message={error} onRetry={fetchSettings} />;
  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Company Settings & Operational Configuration"
        description="Configure work schedules, working days, timezones, and report reminder timings"
        icon={<Settings className="h-6 w-6" />}
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Organization Information */}
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-content uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
              <Building2 className="h-4 w-4 text-primary" /> Organization Profile
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="company_name" className="block text-xs font-medium text-content mb-1">Company Name</label>
                <Input
                  id="company_name"
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">Standard Timezone</label>
                <Select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (+00:00)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Working Hours & Shifts */}
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-content uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
              <Clock className="h-4 w-4 text-primary" /> Shift & Report Timings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-content mb-1">Work Start Time</label>
                <Input
                  type="time"
                  step="1"
                  value={settings.work_start_time}
                  onChange={(e) => setSettings({ ...settings, work_start_time: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">Work End Time</label>
                <Input
                  type="time"
                  step="1"
                  value={settings.work_end_time}
                  onChange={(e) => setSettings({ ...settings, work_end_time: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">Daily Report Reminder</label>
                <Input
                  type="time"
                  step="1"
                  value={settings.daily_report_reminder_time}
                  onChange={(e) => setSettings({ ...settings, daily_report_reminder_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-content mb-1">Late Threshold (Minutes)</label>
              <div className="max-w-xs">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={settings.late_threshold_minutes}
                  onChange={(e) => setSettings({ ...settings, late_threshold_minutes: Number(e.target.value) })}
                  required
                />
              </div>
              <p className="text-[11px] text-content-muted mt-1">
                Check-ins after Work Start Time plus this threshold are marked as Late.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Working Days */}
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-content uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
              <Calendar className="h-4 w-4 text-primary" /> Working Days
            </h2>

            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = settings.working_days?.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-surface text-content border-border hover:bg-surface-muted'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={fetchSettings}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button
            type="submit"
            isLoading={saving}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" /> Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
