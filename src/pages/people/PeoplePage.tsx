import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  Briefcase, 
  Linkedin, 
  Github, 
  ExternalLink,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface Person {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  designation?: string;
  employment_status: string;
  is_active: boolean;
  role_name?: string;
  department_name?: string;
  linkedin?: string;
  github?: string;
  joining_date?: string;
}

export const PeoplePage: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Employee' | 'Intern'>('All');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch profiles, departments, and user_roles separately to avoid schema cache ambiguities
      const [
        { data: profs, error: pErr },
        { data: deps },
        { data: userRoles }
      ] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('departments').select('id, name'),
        supabase.from('user_roles').select('user_id, roles(name)')
      ]);

      if (pErr) throw pErr;

      const deptMap = new Map<string, string>();
      deps?.forEach((d: any) => deptMap.set(d.id, d.name));

      const roleMap = new Map<string, string>();
      userRoles?.forEach((ur: any) => {
        const rName = Array.isArray(ur.roles) ? ur.roles[0]?.name : ur.roles?.name;
        if (rName) roleMap.set(ur.user_id, rName);
      });

      const mapped: Person[] = (profs || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name || p.email,
        avatar_url: p.avatar_url,
        phone: p.phone,
        designation: p.designation || 'Team Member',
        employment_status: p.employment_status || 'Employee',
        is_active: p.is_active ?? true,
        role_name: roleMap.get(p.id) || 'Employee',
        department_name: (p.department_id && deptMap.get(p.department_id)) || 'General',
        linkedin: p.linkedin,
        github: p.github,
        joining_date: p.joining_date
      }));

      setPeople(mapped);
    } catch (err: any) {
      console.error('Error fetching people:', err);
      setError(err.message || 'Failed to load people directory');
    } finally {
      setLoading(false);
    }
  };

  const filtered = people.filter(p => {
    const matchesSearch = 
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.designation && p.designation.toLowerCase().includes(search.toLowerCase())) ||
      (p.department_name && p.department_name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || p.employment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatExternalUrl = (url: string, prefix: string) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `${prefix}${trimmed.replace(/^@/, '')}`;
  };

  if (loading) return <LoadingState text="Loading people..." />;
  if (error) return <ErrorState message={error} onRetry={fetchPeople} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="View team members, interns, roles, and departments"
        icon={<Users className="h-6 w-6" />}
        badge={<span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-muted text-content-muted font-medium border border-border">{people.length} Members</span>}
      />

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
          <Input
            placeholder="Search by name, email, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-surface-muted rounded-lg border border-border self-start sm:self-auto">
          {(['All', 'Employee', 'Intern'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === tab
                  ? 'bg-surface text-content shadow-xs font-semibold'
                  : 'text-content-muted hover:text-content'
              }`}
            >
              {tab === 'All' ? 'All Members' : `${tab}s`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No people found"
          description={search ? "No members match your search criteria." : "There are currently no members to display."}
          icon={<Users className="h-10 w-10 text-content-muted" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(person => (
            <Card 
              key={person.id} 
              className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              onClick={() => setSelectedPerson(person)}
            >
              <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-3.5">
                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0 overflow-hidden border border-border">
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt={person.full_name} className="h-full w-full object-cover" />
                      ) : (
                        person.full_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-content truncate group-hover:text-primary transition-colors" title={person.full_name}>
                          {person.full_name}
                        </h3>
                        <StatusBadge status={person.is_active ? 'Active' : 'Inactive'} size="sm" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <StatusBadge status={person.role_name} size="sm" />
                        <span className="text-[11px] text-content-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                          {person.employment_status}
                        </span>
                      </div>
                      <p className="text-xs text-content-muted flex items-center gap-1.5 mt-1.5 truncate">
                        <Briefcase className="h-3 w-3 shrink-0" />
                        {person.designation} • {person.department_name}
                      </p>
                    </div>
                  </div>

                  {/* Desktop Contact Details */}
                  <div className="hidden sm:block mt-4 pt-3 border-t border-border space-y-1.5 text-xs text-content-muted">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-content-muted" />
                      <span className="truncate">{person.email}</span>
                    </div>
                    {person.phone && (
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-content-muted" />
                        <span>{person.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile View details prompt / Desktop Footer */}
                <div className="mt-3 pt-2 sm:pt-3 border-t border-border/60 flex items-center justify-between text-xs text-primary font-medium">
                  <span className="text-content-muted text-[11px]">Click to view details</span>
                  <span className="group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Details &rarr;
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Person Details Modal */}
      <Modal
        isOpen={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        title="Person Details"
        footer={
          <Button variant="outline" size="sm" onClick={() => setSelectedPerson(null)}>
            Close
          </Button>
        }
      >
        {selectedPerson && (
          <div className="space-y-6">
            {/* Header with Avatar & Name */}
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl shrink-0 overflow-hidden border-2 border-primary/20">
                {selectedPerson.avatar_url ? (
                  <img src={selectedPerson.avatar_url} alt={selectedPerson.full_name} className="h-full w-full object-cover" />
                ) : (
                  selectedPerson.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-content truncate">
                  {selectedPerson.full_name}
                </h2>
                <p className="text-sm text-content-muted">
                  {selectedPerson.designation}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <StatusBadge status={selectedPerson.role_name} size="sm" />
                  <StatusBadge status={selectedPerson.is_active ? 'Active' : 'Inactive'} size="sm" />
                  <span className="text-xs text-content-muted bg-surface-muted px-2 py-0.5 rounded border border-border">
                    {selectedPerson.employment_status}
                  </span>
                </div>
              </div>
            </div>

            {/* Organization Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Organization
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted border border-border">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-content-muted">Department</p>
                    <p className="font-medium text-content truncate">{selectedPerson.department_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted border border-border">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-content-muted">Designation</p>
                    <p className="font-medium text-content truncate">{selectedPerson.designation}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted border border-border">
                  {selectedPerson.is_active ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-status-danger shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] text-content-muted">Account Status</p>
                    <p className="font-medium text-content">{selectedPerson.is_active ? 'Active Member' : 'Inactive'}</p>
                  </div>
                </div>

                {selectedPerson.joining_date && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted border border-border">
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-content-muted">Joined</p>
                      <p className="font-medium text-content">
                        {new Date(selectedPerson.joining_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Contact & Communication
              </h4>
              <div className="space-y-2 text-sm">
                <a 
                  href={`mailto:${selectedPerson.email}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail className="h-4 w-4 text-content-muted shrink-0" />
                    <span className="text-content truncate">{selectedPerson.email}</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-content-muted" />
                </a>

                {selectedPerson.phone ? (
                  <a 
                    href={`tel:${selectedPerson.phone}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Phone className="h-4 w-4 text-content-muted shrink-0" />
                      <span className="text-content truncate">{selectedPerson.phone}</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-content-muted" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted/50 border border-border text-content-muted text-xs">
                    <Phone className="h-4 w-4 text-content-muted shrink-0 opacity-50" />
                    <span>No phone number listed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Professional Profiles */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Professional Profiles
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {selectedPerson.linkedin ? (
                  <a
                    href={formatExternalUrl(selectedPerson.linkedin, 'https://linkedin.com/in/')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted border border-border hover:border-blue-400 hover:bg-blue-50/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Linkedin className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="text-content text-xs font-medium truncate">LinkedIn</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-content-muted" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted/50 border border-border text-content-muted text-xs">
                    <Linkedin className="h-4 w-4 text-content-muted shrink-0 opacity-50" />
                    <span>LinkedIn not linked</span>
                  </div>
                )}

                {selectedPerson.github ? (
                  <a
                    href={formatExternalUrl(selectedPerson.github, 'https://github.com/')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-lg bg-surface-muted border border-border hover:border-gray-400 hover:bg-gray-50/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Github className="h-4 w-4 text-content shrink-0" />
                      <span className="text-content text-xs font-medium truncate">GitHub</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-content-muted" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-muted/50 border border-border text-content-muted text-xs">
                    <Github className="h-4 w-4 text-content-muted shrink-0 opacity-50" />
                    <span>GitHub not linked</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
