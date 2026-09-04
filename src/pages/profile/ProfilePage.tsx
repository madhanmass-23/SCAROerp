import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../features/auth/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { 
  User, 
  Mail, 
  Phone, 
  Camera, 
  Loader2, 
  Lock, 
  Building2, 
  Briefcase, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Linkedin,
  Github,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, profile, role, refreshProfile } = useAuth();
  
  // Editable form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize form state when profile loads or updates
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setLinkedin(profile.linkedin || '');
      setGithub(profile.github || '');
    }
  }, [profile]);

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleAvatarClick = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsUploading(true);
      setError(null);
      setSuccess(null);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image size must be less than 5MB.');
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select a valid image file (PNG, JPG, WebP).');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // 1. Upload to Supabase Storage in 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update profile avatar_url
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 4. Refresh auth state without reloading page
      await refreshProfile();
      setSuccess('Profile photo updated successfully!');

    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      setError(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset file input so re-selecting same file triggers change
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const trimmedName = fullName.trim();
      if (!trimmedName) {
        throw new Error('Full Name is required and cannot be empty.');
      }

      // Normalize phone and social links
      const trimmedPhone = phone.trim() || null;
      const trimmedLinkedin = linkedin.trim() || null;
      const trimmedGithub = github.trim() || null;

      // Only self-service fields are updated; role, department, designation, etc. are untouched
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          phone: trimmedPhone,
          linkedin: trimmedLinkedin,
          github: trimmedGithub,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Refresh global context state immediately
      await refreshProfile();
      setSuccess('Profile details saved successfully!');

    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatExternalUrl = (url: string, prefix: string) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `${prefix}${trimmed.replace(/^@/, '')}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-content tracking-tight">User Profile</h1>
            <p className="text-xs text-content-muted">
              Manage your personal information and view your verified company role
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={role} size="sm" />
          <StatusBadge status={profile.is_active ? 'Active' : 'Inactive'} size="sm" />
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-status-danger/10 text-status-danger text-sm rounded-lg border border-status-danger/25 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Update Failed</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-status-success/10 text-status-success text-sm rounded-lg border border-status-success/25 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Success</p>
            <p className="text-xs mt-0.5">{success}</p>
          </div>
        </div>
      )}

      {/* Overview Hero Card */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar with upload interaction */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <div 
                className="relative h-28 w-28 rounded-full overflow-hidden bg-surface-muted border-4 border-surface shadow-md group cursor-pointer"
                onClick={handleAvatarClick}
                title="Click to change profile picture"
              >
                {profile.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.full_name} 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-3xl font-bold">
                    {profile.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5 text-white mb-1" />
                      <span className="text-white text-[11px] font-semibold">Change</span>
                    </>
                  )}
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={uploadAvatar}
                disabled={isUploading || isSaving}
              />

              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAvatarClick} 
                disabled={isUploading || isSaving}
                isLoading={isUploading}
                className="text-xs"
              >
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                Change Photo
              </Button>
            </div>

            {/* Basic Overview & Badges */}
            <div className="flex-1 text-center sm:text-left space-y-2.5 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-content truncate">
                    {profile.full_name || 'Team Member'}
                  </h2>
                  <p className="text-sm font-medium text-content-muted mt-0.5">
                    {profile.designation || 'Team Member'}
                  </p>
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <StatusBadge status={role} size="sm" />
                  <span className="text-xs text-content-muted bg-surface-muted px-2 py-0.5 rounded border border-border">
                    {profile.employment_status}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-content-muted">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>{profile.department_name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-content-muted" />
                  <span>{user.email}</span>
                </span>
                {profile.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-content-muted" />
                    <span>{profile.phone}</span>
                  </span>
                )}
                {profile.joining_date && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-content-muted" />
                    <span>Joined {new Date(profile.joining_date).toLocaleDateString()}</span>
                  </span>
                )}
              </div>

              {/* Social links preview */}
              {(profile.linkedin || profile.github) && (
                <div className="pt-2 flex items-center justify-center sm:justify-start gap-3">
                  {profile.linkedin && (
                    <a
                      href={formatExternalUrl(profile.linkedin, 'https://linkedin.com/in/')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      <span>LinkedIn Profile</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.github && (
                    <a
                      href={formatExternalUrl(profile.github, 'https://github.com/')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-content hover:text-primary font-medium"
                    >
                      <Github className="h-3.5 w-3.5" />
                      <span>GitHub Profile</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Self-Service Details Form */}
      <form onSubmit={handleSaveProfile}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Personal & Professional Details</CardTitle>
                <p className="text-xs text-content-muted mt-1">
                  Update your contact details and social profiles visible to the team
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Full Name *"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  disabled={isSaving}
                />
                <span className="text-[11px] text-content-muted mt-1 block">
                  Your official name displayed across projects and reports
                </span>
              </div>

              <div>
                <Input
                  label="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555-0199 or +91 9876543210"
                  disabled={isSaving}
                />
                <span className="text-[11px] text-content-muted mt-1 block">
                  Optional contact number for urgent team communications
                </span>
              </div>

              <div>
                <Input
                  label="LinkedIn Profile"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="e.g. linkedin.com/in/username or username"
                  disabled={isSaving}
                />
                <span className="text-[11px] text-content-muted mt-1 block">
                  Connect your professional LinkedIn profile
                </span>
              </div>

              <div>
                <Input
                  label="GitHub Profile"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  placeholder="e.g. github.com/username or username"
                  disabled={isSaving}
                />
                <span className="text-[11px] text-content-muted mt-1 block">
                  Connect your developer portfolio or GitHub username
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-content-muted">
                Changes take effect immediately across all company directories
              </span>
              <Button
                type="submit"
                isLoading={isSaving}
                disabled={isSaving || isUploading}
                className="w-full sm:w-auto px-6"
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Organization Assignment (Strictly Locked / Read-Only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-content-muted" />
            <CardTitle>Organization Assignment</CardTitle>
          </div>
          <p className="text-xs text-content-muted mt-1 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
            These core attributes are securely managed by administrators and cannot be altered directly.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                Account Email
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content truncate">
                <Mail className="h-4 w-4 text-content-muted shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">Primary login identifier</span>
            </div>

            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                System Role
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content">
                <StatusBadge status={role} size="sm" />
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">Permission boundary level</span>
            </div>

            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                Department
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content truncate">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{profile.department_name}</span>
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">Assigned organizational unit</span>
            </div>

            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                Designation
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content truncate">
                <Briefcase className="h-4 w-4 text-content-muted shrink-0" />
                <span className="truncate">{profile.designation}</span>
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">Official corporate job title</span>
            </div>

            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                Employment Status
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content">
                <span className="px-2 py-0.5 bg-surface rounded text-xs border border-border font-medium">
                  {profile.employment_status}
                </span>
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">Staff classification</span>
            </div>

            <div className="p-3 bg-surface-muted/60 rounded-lg border border-border">
              <label className="block text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
                Account Status
              </label>
              <div className="flex items-center gap-2 text-sm font-medium text-content">
                <StatusBadge status={profile.is_active ? 'Active' : 'Inactive'} size="sm" />
              </div>
              <span className="text-[10px] text-content-muted/80 mt-1 block">System access state</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
