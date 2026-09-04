import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { 
  Briefcase, 
  Calendar, 
  Users, 
  Activity, 
  CheckSquare, 
  FileText, 
  Plus, 
  Search, 
  UserPlus,
  Trash2,
  Edit2
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import type { Project, ProjectMember, CreateProjectPayload, UpdateProjectPayload } from '../../types/project';
import { 
  fetchProjects, 
  fetchProjectMembers, 
  fetchProjectActivity, 
  createProject, 
  updateProject, 
  addProjectMember, 
  removeProjectMember, 
  fetchCandidateProfiles 
} from '../../services/projectService';

export const ProjectsPage: React.FC = () => {
  const { user, role } = useAuth();
  const isManager = role === 'Super Admin' || role === 'Admin';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Project Details Modal state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [recentReportActivity, setRecentReportActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Candidate profiles for member assignment
  const [candidateProfiles, setCandidateProfiles] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [addingMember, setAddingMember] = useState(false);

  // Create Project Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateProjectPayload>({
    name: '',
    description: '',
    status: 'Active',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    owner_id: user?.id || ''
  });

  // Edit Project Modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editForm, setEditForm] = useState<UpdateProjectPayload>({
    name: '',
    description: '',
    status: 'Active',
    start_date: '',
    end_date: '',
    owner_id: ''
  });

  useEffect(() => {
    loadProjects();
    loadCandidateProfiles();
  }, [statusFilter]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjects(statusFilter);
      setProjects(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error('Failed to load projects'));
    } finally {
      setLoading(false);
    }
  };

  const loadCandidateProfiles = async () => {
    try {
      const data = await fetchCandidateProfiles();
      setCandidateProfiles(data);
    } catch (err) {
      console.warn('Could not load candidate profiles:', err);
    }
  };

  const openProject = async (project: Project) => {
    setSelectedProject(project);
    loadProjectDetails(project.id);
  };

  const loadProjectDetails = async (projectId: string) => {
    try {
      setMembersLoading(true);
      setActivityLoading(true);

      const [membersData, activityData] = await Promise.all([
        fetchProjectMembers(projectId),
        fetchProjectActivity(projectId)
      ]);

      setMembers(membersData);
      setProjectTasks(activityData.tasks);
      setRecentReportActivity(activityData.recentReportActivity);
    } catch (err) {
      console.error('Failed to load project details:', err);
    } finally {
      setMembersLoading(false);
      setActivityLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    try {
      setSubmittingCreate(true);
      await createProject(createForm);
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        description: '',
        status: 'Active',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        owner_id: user?.id || ''
      });
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleOpenEdit = (project: Project) => {
    setEditForm({
      name: project.name,
      description: project.description || '',
      status: project.status,
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      owner_id: project.owner_id || ''
    });
    setIsEditOpen(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !editForm.name?.trim()) return;

    try {
      setSubmittingEdit(true);
      const updated = await updateProject(selectedProject.id, editForm);
      setSelectedProject(updated);
      setIsEditOpen(false);
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to update project');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedProject || !selectedCandidateId) return;

    try {
      setAddingMember(true);
      await addProjectMember(selectedProject.id, selectedCandidateId);
      setSelectedCandidateId('');
      const updatedMembers = await fetchProjectMembers(selectedProject.id);
      setMembers(updatedMembers);
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to add member to project');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedProject) return;
    if (!confirm('Are you sure you want to remove this member from the project?')) return;

    try {
      await removeProjectMember(selectedProject.id, userId);
      const updatedMembers = await fetchProjectMembers(selectedProject.id);
      setMembers(updatedMembers);
      loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  // Filter projects by search query
  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.owner?.full_name && p.owner.full_name.toLowerCase().includes(q))
    );
  });

  if (loading && projects.length === 0) return <LoadingState text="Loading projects..." />;
  if (error) return <ErrorState title="Failed to load projects" message={error.message} onRetry={loadProjects} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" /> Projects
          </h1>
          <p className="text-sm text-content-muted mt-1">
            Track operational project status, task completion, and team involvement.
          </p>
        </div>

        {isManager && (
          <Button 
            variant="primary" 
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Project
          </Button>
        )}
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5 p-1 bg-surface-muted border border-border rounded-lg text-xs font-medium">
          {['All', 'Active', 'On Hold', 'Completed', 'Archived'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === status
                  ? 'bg-surface text-content font-semibold shadow-sm border border-border'
                  : 'text-content-muted hover:text-content'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-surface border border-border rounded-lg">
            <Briefcase className="h-12 w-12 text-border mx-auto mb-4" />
            <p className="text-content font-medium">No projects found</p>
            <p className="text-content-muted text-sm mt-1">
              {searchQuery ? 'Try adjusting your search criteria.' : 'You are not enrolled in any projects matching this filter.'}
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const normalizedStatus = (project.status || 'Active').toLowerCase();
            const progress = project.progress || 0;
            const totalTasks = project.total_tasks_count || 0;
            const completedTasks = project.completed_tasks_count || 0;
            const overdueTasks = project.overdue_tasks_count || 0;

            return (
              <Card 
                key={project.id} 
                className="hover:shadow-md transition-shadow cursor-pointer flex flex-col group border border-border hover:border-primary/50" 
                onClick={() => openProject(project)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="truncate text-base font-bold text-content group-hover:text-primary transition-colors" title={project.name}>
                      {project.name}
                    </CardTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      normalizedStatus === 'active' 
                        ? 'bg-status-success/15 text-status-success' 
                        : normalizedStatus === 'completed' 
                        ? 'bg-primary/15 text-primary' 
                        : normalizedStatus === 'on hold'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-surface-muted text-content-muted border border-border'
                    }`}>
                      {project.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col pt-0">
                  <p className="text-content-muted text-xs sm:text-sm line-clamp-2 mb-4 flex-1">
                    {project.description || 'No description provided.'}
                  </p>

                  {/* Derived Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-content-muted">Task Completion</span>
                      <span className="font-semibold text-content">{progress}%</span>
                    </div>
                    <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          progress === 100 
                            ? 'bg-status-success' 
                            : 'bg-primary'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Operational Metric Badges */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 px-3 bg-surface-muted/60 rounded-md border border-border text-center text-xs mb-4">
                    <div>
                      <span className="text-content-muted block text-[10px] uppercase tracking-wider">Total</span>
                      <span className="font-bold text-content">{totalTasks}</span>
                    </div>
                    <div>
                      <span className="text-content-muted block text-[10px] uppercase tracking-wider">Done</span>
                      <span className="font-bold text-status-success">{completedTasks}</span>
                    </div>
                    <div>
                      <span className="text-content-muted block text-[10px] uppercase tracking-wider">Overdue</span>
                      <span className={`font-bold ${overdueTasks > 0 ? 'text-status-danger' : 'text-content-muted'}`}>
                        {overdueTasks}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border mt-auto flex flex-col gap-1.5 text-xs text-content-muted">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-content-muted" /> 
                        Owner: {project.owner?.full_name || 'Unassigned'}
                      </span>
                      <span className="text-[11px] bg-surface border border-border rounded px-1.5 py-0.5">
                        {project.member_count || 0} members
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'None'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" /> {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'Ongoing'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Project Details & Activity Overview Modal (REQUIRED BY MANAGEMENT TESTS) */}
      <Modal
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title="Project Details & Activity Overview"
      >
        {selectedProject && (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1 text-xs sm:text-sm">
            <div>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h2 className="text-lg font-bold text-content">{selectedProject.name}</h2>
                  <p className="text-content-muted mt-1 whitespace-pre-wrap">{selectedProject.description || 'No description.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-surface border border-border rounded px-2 py-0.5 text-xs font-semibold uppercase">
                    {selectedProject.status}
                  </span>
                  {isManager && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleOpenEdit(selectedProject)}
                      className="flex items-center gap-1 text-xs py-1 px-2"
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-muted p-3.5 rounded-lg border border-border mt-3">
                <div>
                  <span className="text-content-muted">Owner</span>
                  <p className="font-semibold text-content">{selectedProject.owner?.full_name || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-content-muted">Status</span>
                  <p className="font-semibold text-content capitalize">{selectedProject.status}</p>
                </div>
                <div>
                  <span className="text-content-muted">Start Date</span>
                  <p className="font-semibold text-content">{selectedProject.start_date ? new Date(selectedProject.start_date).toLocaleDateString() : 'None'}</p>
                </div>
                <div>
                  <span className="text-content-muted">End Date</span>
                  <p className="font-semibold text-content">{selectedProject.end_date ? new Date(selectedProject.end_date).toLocaleDateString() : 'Ongoing'}</p>
                </div>
              </div>
            </div>

            {/* Active Project Tasks */}
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="font-semibold text-content flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" /> Active Tasks ({projectTasks.length})
              </h3>
              {activityLoading ? (
                <p className="text-content-muted italic">Loading tasks...</p>
              ) : projectTasks.length === 0 ? (
                <p className="text-content-muted italic">No tasks created for this project yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {projectTasks.map((task) => (
                    <div key={task.id} className="p-2.5 bg-surface border border-border rounded flex items-center justify-between">
                      <div>
                        <p className="font-medium text-content">{task.title}</p>
                        <p className="text-xs text-content-muted">
                          Assignee: {task.assignee?.full_name || 'Unassigned'} • Priority: {task.priority}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-primary">{task.progress || 0}%</span>
                        <p className="text-xs text-content-muted capitalize">{task.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Daily Report Logs (PRESERVED FOR REGRESSION COMPATIBILITY) */}
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="font-semibold text-content flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Recent Daily Report Logs
              </h3>
              {activityLoading ? (
                <p className="text-content-muted italic">Loading logs...</p>
              ) : recentReportActivity.length === 0 ? (
                <p className="text-content-muted italic">No daily reports have logged work against this project yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentReportActivity.map((ra) => (
                    <div key={ra.id} className="p-2.5 bg-surface border border-border rounded flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium text-content">{ra.tasks?.title}</p>
                        <p className="text-content-muted">
                          By: {ra.daily_reports?.profiles?.full_name || 'Team Member'} on {ra.daily_reports?.report_date}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-primary">{ra.time_spent_minutes} mins</span>
                        <p className="text-content-muted">{ra.completion_percentage}% done</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Team Members */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-content flex items-center gap-2">
                  <Users className="h-4 w-4 text-content-muted" /> Project Team Members ({members.length})
                </h3>
              </div>

              {/* Add Member Bar for Managers */}
              {isManager && (
                <div className="flex gap-2 items-center bg-surface-muted p-2 rounded-md border border-border">
                  <select
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="flex-1 bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select an employee to add...</option>
                    {candidateProfiles
                      .filter((p) => !members.some((m) => m.user_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.email})
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddMember}
                    disabled={!selectedCandidateId || addingMember}
                    className="flex items-center gap-1 text-xs py-1.5 px-3 whitespace-nowrap"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              )}
              
              {membersLoading ? (
                <p className="text-content-muted">Loading team members...</p>
              ) : members.length === 0 ? (
                <p className="text-content-muted italic">No team members assigned.</p>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {members.map((member) => (
                    <li key={member.user_id} className="p-2.5 bg-surface flex justify-between items-center">
                      <div>
                        <p className="font-medium text-content">{member.user?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-content-muted">{member.user?.email} • {member.user?.employment_status || 'Staff'}</p>
                      </div>
                      {isManager && member.user_id !== selectedProject.owner_id && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="text-status-danger hover:bg-status-danger/10 p-1.5 rounded transition-colors"
                          title="Remove from project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Project"
      >
        <form onSubmit={handleCreateProject} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-content mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Website Redesign Q3"
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-content mb-1">Description</label>
            <textarea
              rows={3}
              value={createForm.description || ''}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="State objectives and deliverables..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-content mb-1">Status</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-content mb-1">Project Owner</label>
              <select
                value={createForm.owner_id || ''}
                onChange={(e) => setCreateForm({ ...createForm, owner_id: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {candidateProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-content mb-1">Start Date</label>
              <input
                type="date"
                value={createForm.start_date || ''}
                onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block font-medium text-content mb-1">End Date (Optional)</label>
              <input
                type="date"
                value={createForm.end_date || ''}
                onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submittingCreate}>
              {submittingCreate ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Project"
      >
        <form onSubmit={handleUpdateProject} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-content mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={editForm.name || ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-content mb-1">Description</label>
            <textarea
              rows={3}
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-content mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-content mb-1">Project Owner</label>
              <select
                value={editForm.owner_id || ''}
                onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {candidateProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-content mb-1">Start Date</label>
              <input
                type="date"
                value={editForm.start_date || ''}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block font-medium text-content mb-1">End Date</label>
              <input
                type="date"
                value={editForm.end_date || ''}
                onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submittingEdit}>
              {submittingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
