import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { 
  CheckSquare, 
  MessageSquare, 
  Send, 
  Calendar, 
  Clock, 
  AlertCircle,
  Plus,
  Paperclip,
  Download,
  Trash2,
  Search,
  Briefcase,
  Check,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import type { Task, TaskStatus, TaskPriority, TaskComment, TaskAttachment, CreateTaskPayload, AssignableUser } from '../../types/task';
import type { Project } from '../../types/project';
import { 
  fetchTasks, 
  createTask, 
  updateTask, 
  fetchTaskComments, 
  addTaskComment, 
  fetchTaskAttachments, 
  uploadTaskAttachment, 
  getAttachmentSignedUrl, 
  deleteTaskAttachment,
  fetchAssignableUsers
} from '../../services/taskService';
import { fetchProjects } from '../../services/projectService';

export const TasksPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showSuccess, showError } = useToast();
  const isManager = role === 'Super Admin' || role === 'Admin';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter state
  const [activeTab, setActiveTab] = useState<'my_tasks' | 'assigned_by_me' | 'assigned_by_manager' | 'all_tasks'>('my_tasks');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | 'All'>('All');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | 'All'>('All');
  const [dateFilter, setDateFilter] = useState<'All' | 'Due Today' | 'Overdue' | 'Upcoming'>('All');
  const [isOverdueOnly, setIsOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Task Detail Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [taskUpdating, setTaskUpdating] = useState(false);

  // Create Task Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTaskPayload>({
    project_id: '',
    title: '',
    description: '',
    assignee_id: user?.id || '',
    priority: 'Medium',
    status: 'Todo',
    progress: 0,
    estimated_hours: 0,
    due_date: ''
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [user, activeTab, selectedProjectId, selectedStatus, selectedPriority, dateFilter, isOverdueOnly, searchQuery]);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
      if (data.length > 0 && !createForm.project_id) {
        setCreateForm((prev) => ({ ...prev, project_id: data[0].id }));
      }
    } catch (err) {
      console.warn('Could not load projects for task assignment:', err);
    }
  };

  const loadTasks = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTasks({
        tab: activeTab,
        projectId: selectedProjectId,
        status: selectedStatus,
        priority: selectedPriority,
        dateFilter: dateFilter,
        isOverdue: isOverdueOnly,
        searchQuery: searchQuery
      });
      setTasks(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error('Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  };

  const openTask = async (task: Task) => {
    setSelectedTask(task);
    loadTaskDetails(task.id);
  };

  const loadTaskDetails = async (taskId: string) => {
    try {
      const [commentsData, attachmentsData] = await Promise.all([
        fetchTaskComments(taskId),
        fetchTaskAttachments(taskId)
      ]);
      setComments(commentsData);
      setAttachments(attachmentsData);
    } catch (err) {
      console.error('Failed to load task details:', err);
    }
  };

  const loadAssignableUsers = async () => {
    try {
      const users = await fetchAssignableUsers();
      setAssignableUsers(users);
    } catch (err) {
      console.warn('Could not load assignable users:', err);
    }
  };

  const openCreateModal = () => {
    const defaultProjId = projects[0]?.id || '';
    setCreateForm({
      project_id: defaultProjId,
      title: '',
      description: '',
      assignee_id: user?.id || '',
      priority: 'Medium',
      status: 'Todo',
      progress: 0,
      estimated_hours: 0,
      due_date: ''
    });
    setAssigneeSearch('');
    setIsAssigneeDropdownOpen(false);
    loadAssignableUsers();
    setIsCreateOpen(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveProjectId = createForm.project_id || (projects.length > 0 ? projects[0].id : '');
    if (!createForm.title.trim()) {
      showError('Please enter a task title.');
      return;
    }
    if (!effectiveProjectId) {
      showError('Please select a project.');
      return;
    }

    try {
      setSubmittingCreate(true);
      const targetAssigneeId = isManager ? (createForm.assignee_id || user?.id || '') : (user?.id || '');
      await createTask({ ...createForm, project_id: effectiveProjectId, assignee_id: targetAssigneeId });
      showSuccess('Task created successfully');
      setIsCreateOpen(false);
      setCreateForm({
        project_id: projects[0]?.id || '',
        title: '',
        description: '',
        assignee_id: user?.id || '',
        priority: 'Medium',
        status: 'Todo',
        progress: 0,
        estimated_hours: 0,
        due_date: ''
      });
      await loadTasks();
    } catch (err: any) {
      showError(err.message || 'Failed to create task');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleUpdateStatus = async (status: TaskStatus) => {
    if (!selectedTask) return;
    try {
      setTaskUpdating(true);
      let progress = selectedTask.progress;
      if (status === 'Completed' && progress < 100) {
        progress = 100;
      } else if (status === 'Todo' && progress === 100) {
        progress = 0;
      }
      const updated = await updateTask(selectedTask.id, { status, progress });
      setSelectedTask(updated);
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setTaskUpdating(false);
    }
  };

  const handleUpdateProgress = async (progress: number) => {
    if (!selectedTask) return;
    try {
      setTaskUpdating(true);
      let status = selectedTask.status;
      if (progress === 100) {
        status = 'Completed';
      } else if (progress > 0 && selectedTask.status === 'Todo') {
        status = 'In Progress';
      } else if (progress < 100 && selectedTask.status === 'Completed') {
        status = 'In Progress';
      }
      const updated = await updateTask(selectedTask.id, { progress, status });
      setSelectedTask(updated);
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      alert('Failed to update progress: ' + err.message);
    } finally {
      setTaskUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newComment.trim()) return;

    try {
      setSubmittingComment(true);
      const comment = await addTaskComment(selectedTask.id, newComment);
      setComments([...comments, comment]);
      setNewComment('');
    } catch (err: any) {
      alert('Failed to post comment: ' + err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTask || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    try {
      setUploadingAttachment(true);
      const attachment = await uploadTaskAttachment(selectedTask.id, file);
      setAttachments([attachment, ...attachments]);
      e.target.value = '';
    } catch (err: any) {
      alert('Failed to upload attachment: ' + err.message);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDownloadAttachment = async (storagePath: string, fileName: string) => {
    try {
      const signedUrl = await getAttachmentSignedUrl(storagePath);
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert('Failed to download attachment: ' + err.message);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string, storagePath: string) => {
    if (!confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await deleteTaskAttachment(attachmentId, storagePath);
      setAttachments(attachments.filter(a => a.id !== attachmentId));
    } catch (err: any) {
      alert('Failed to delete attachment: ' + err.message);
    }
  };

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case 'Todo':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200';
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200';
      case 'Review':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200';
      case 'Needs Revision':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'Completed':
        return 'bg-status-success/15 text-status-success border-status-success/30';
      case 'On Hold':
        return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-gray-300';
      case 'Cancelled':
        return 'bg-status-danger/15 text-status-danger border-status-danger/30';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityBadgeClass = (priority: TaskPriority) => {
    switch (priority) {
      case 'Low':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Medium':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'High':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'Urgent':
        return 'bg-status-danger/15 text-status-danger border-status-danger/30';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-primary" /> Task Management
          </h1>
          <p className="text-sm text-content-muted mt-1">
            Organize personal tasks, track assignments, and collaborate across operational projects.
          </p>
        </div>

        <Button 
          id="create-task-button"
          data-testid="create-task-button"
          variant="primary" 
          onClick={openCreateModal}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Task
        </Button>
      </div>

      {/* Role-Aware View Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-3 sm:space-x-6 overflow-x-auto no-scrollbar">
          <button
            id="tasks-tab-my-tasks"
            data-testid="tasks-tab-my-tasks"
            onClick={() => setActiveTab('my_tasks')}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors cursor-pointer ${
              activeTab === 'my_tasks'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-content-muted hover:text-content hover:border-border'
            }`}
          >
            My Tasks
          </button>
          {isManager ? (
            <button
              id="tasks-tab-assigned-by-me"
              data-testid="tasks-tab-assigned-by-me"
              onClick={() => setActiveTab('assigned_by_me')}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'assigned_by_me'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Assigned by Me
            </button>
          ) : (
            <button
              id="tasks-tab-assigned-tasks"
              data-testid="tasks-tab-assigned-tasks"
              onClick={() => setActiveTab('assigned_by_manager')}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'assigned_by_manager'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Assigned Tasks
            </button>
          )}
          {isManager && (
            <button
              id="tasks-tab-all-tasks"
              data-testid="tasks-tab-all-tasks"
              onClick={() => setActiveTab('all_tasks')}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'all_tasks'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              All Tasks
            </button>
          )}
        </nav>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-surface-muted p-3.5 rounded-lg border border-border text-xs sm:text-sm">
        {/* Project Selector */}
        <div>
          <label className="block text-[11px] font-medium text-content-muted mb-1">Project</label>
          <select
            id="tasks-filter-project"
            data-testid="tasks-filter-project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Status Selector */}
        <div>
          <label className="block text-[11px] font-medium text-content-muted mb-1">Status</label>
          <select
            id="tasks-filter-status"
            data-testid="tasks-filter-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Statuses</option>
            <option value="Todo">Todo</option>
            <option value="In Progress">In Progress</option>
            <option value="Review">Review</option>
            <option value="Needs Revision">Needs Revision</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {/* Priority Selector */}
        <div>
          <label className="block text-[11px] font-medium text-content-muted mb-1">Priority</label>
          <select
            id="tasks-filter-priority"
            data-testid="tasks-filter-priority"
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as any)}
            className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>

        {/* Due Date Schedule Selector */}
        <div>
          <label className="block text-[11px] font-medium text-content-muted mb-1">Due Schedule</label>
          <select
            id="tasks-filter-due-date"
            data-testid="tasks-filter-due-date"
            value={dateFilter}
            onChange={(e) => {
              const val = e.target.value as any;
              setDateFilter(val);
              if (val === 'Overdue') setIsOverdueOnly(true);
              else setIsOverdueOnly(false);
            }}
            className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="All">All Due Dates</option>
            <option value="Due Today">Due Today</option>
            <option value="Overdue">Overdue Only</option>
            <option value="Upcoming">Upcoming / Future</option>
          </select>
        </div>

        {/* Search Bar */}
        <div>
          <label className="block text-[11px] font-medium text-content-muted mb-1">Search</label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              id="tasks-search-input"
              data-testid="tasks-search-input"
              type="text"
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-content placeholder:text-content-muted"
            />
          </div>
        </div>
      </div>

      {/* Task List */}
      {loading && tasks.length === 0 ? (
        <LoadingState text="Loading tasks..." />
      ) : error ? (
        <ErrorState title="Failed to load tasks" message={error.message} onRetry={loadTasks} />
      ) : tasks.length === 0 ? (
        <div className="py-12 text-center bg-surface border border-border rounded-lg">
          <CheckSquare className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-content font-medium">No tasks found</p>
          <p className="text-content-muted text-sm mt-1">There are no tasks matching your current filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {tasks.map((task) => (
            <Card 
              key={task.id} 
              id={`task-card-${task.id}`}
              data-testid={`task-card-${task.id}`}
              className="hover:shadow-md transition-shadow cursor-pointer border border-border hover:border-primary/50 group" 
              onClick={() => openTask(task)}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {task.project?.name || 'Project'}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadgeClass(task.priority)}`}>
                        {task.priority}
                      </span>
                      {task.is_due_today && (
                        <span 
                          data-testid={`task-due-today-badge-${task.id}`}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3 text-amber-600" /> Due Today
                        </span>
                      )}
                      {task.is_overdue && (
                        <span 
                          data-testid={`task-overdue-badge-${task.id}`}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-status-danger/15 text-status-danger border border-status-danger/30 flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3" /> Overdue
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-content group-hover:text-primary transition-colors truncate">
                      {task.title}
                    </h3>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                      <span>Created By: <strong className="text-content">{task.reporter?.full_name || 'Self'}</strong></span>
                      <span>Assigned To: <strong className="text-content">{task.assignee?.full_name || 'Unassigned'}</strong></span>
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${task.is_due_today ? 'text-amber-700 dark:text-amber-300 font-semibold' : task.is_overdue ? 'text-status-danger font-semibold' : ''}`}>
                          <Calendar className="h-3 w-3" /> Due: {task.is_due_today ? 'Today' : new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {task.estimated_hours > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Est: {task.estimated_hours} hrs
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status & Progress Column */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadgeClass(task.status)}`}>
                      {task.status}
                    </span>

                    <div className="w-24 sm:w-28 text-right">
                      <div className="flex justify-between items-center text-[10px] text-content-muted mb-0.5">
                        <span>Progress</span>
                        <span className="font-bold text-content">{task.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border">
                        <div 
                          className={`h-1.5 rounded-full ${task.progress === 100 ? 'bg-status-success' : 'bg-primary'}`} 
                          style={{ width: `${task.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Task Details Modal */}
      <Modal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title="Task Details"
      >
        {selectedTask && (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1 text-xs sm:text-sm">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 inline-block mb-1">
                    {selectedTask.project?.name || 'Project'}
                  </span>
                  <h2 className="text-xl font-bold text-content">{selectedTask.title}</h2>
                </div>

                {/* Status Dropdown using ACTUAL PostgreSQL Enum values */}
                <div className="shrink-0">
                  <label className="block text-[11px] font-medium text-content-muted mb-0.5">Status</label>
                  <select 
                    className="bg-surface border border-border rounded px-2.5 py-1 text-xs font-semibold text-content focus:ring-primary focus:border-primary disabled:opacity-50"
                    value={selectedTask.status}
                    onChange={(e) => handleUpdateStatus(e.target.value as TaskStatus)}
                    disabled={taskUpdating}
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

              <p className="text-content-muted text-xs sm:text-sm mb-4 whitespace-pre-wrap">
                {selectedTask.description || 'No description provided.'}
              </p>

              {/* Progress Slider */}
              <div className="bg-surface-muted p-3.5 rounded-lg border border-border mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-medium text-content">Progress</span>
                  <span className="font-bold text-primary">{selectedTask.progress || 0}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={selectedTask.progress || 0}
                  onChange={(e) => handleUpdateProgress(parseInt(e.target.value, 10))}
                  disabled={taskUpdating}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Task Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-surface-muted p-3.5 rounded-lg border border-border">
                <div>
                  <span className="text-content-muted block">Created By:</span>
                  <p className="font-semibold text-content">{selectedTask.reporter?.full_name || 'Self'}</p>
                </div>
                <div>
                  <span className="text-content-muted block">Assigned To:</span>
                  <p className="font-semibold text-content">{selectedTask.assignee?.full_name || 'Unassigned'}</p>
                </div>
                <div>
                  <span className="text-content-muted block">Priority:</span>
                  <p className="font-semibold text-content capitalize">{selectedTask.priority}</p>
                </div>
                <div>
                  <span className="text-content-muted block">Due Date:</span>
                  <p className={`font-semibold ${selectedTask.is_overdue ? 'text-status-danger' : 'text-content'}`}>
                    {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : 'None'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-surface-muted p-3.5 rounded-lg border border-border mt-3">
                <div>
                  <span className="text-content-muted block">Estimated Hours:</span>
                  <p className="font-semibold text-content">{selectedTask.estimated_hours ? `${selectedTask.estimated_hours} hrs` : '0 hrs'}</p>
                </div>
                <div>
                  <span className="text-content-muted block">Created Date:</span>
                  <p className="font-semibold text-content">{selectedTask.created_at ? new Date(selectedTask.created_at).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <span className="text-content-muted block">Last Updated:</span>
                  <p className="font-semibold text-content">{selectedTask.updated_at ? new Date(selectedTask.updated_at).toLocaleDateString() : '—'}</p>
                </div>
              </div>
            </div>

            {/* Task Attachments Section */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-content flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" /> Attachments ({attachments.length})
                </h3>

                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add Attachment
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploadingAttachment}
                  />
                </label>
              </div>

              {uploadingAttachment && (
                <p className="text-xs text-primary animate-pulse">Uploading file to secure storage...</p>
              )}

              {attachments.length === 0 ? (
                <p className="text-xs text-content-muted italic">No attachments uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-md overflow-hidden text-xs">
                  {attachments.map((att) => (
                    <li key={att.id} className="p-2.5 bg-surface flex justify-between items-center">
                      <div className="min-w-0 pr-2">
                        <p className="font-medium text-content truncate">{att.file_name}</p>
                        <p className="text-[11px] text-content-muted">
                          {(att.file_size / 1024).toFixed(1)} KB • Uploaded by {att.uploader?.full_name || 'Member'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadAttachment(att.storage_path, att.file_name)}
                          className="text-primary hover:bg-primary/10 p-1 rounded transition-colors"
                          title="Download attachment"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {(att.uploaded_by === user?.id || isManager) && (
                          <button
                            onClick={() => handleDeleteAttachment(att.id, att.storage_path)}
                            className="text-status-danger hover:bg-status-danger/10 p-1 rounded transition-colors"
                            title="Delete attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Task Discussion Section */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="font-semibold text-content flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-content-muted" /> Discussion ({comments.length})
              </h3>
              
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-content-muted italic">No discussion yet. Post a comment or progress note.</p>
                ) : (
                  comments.map((c) => (
                    <div 
                      key={c.id} 
                      className={`flex flex-col ${c.author_id === user?.id ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-lg p-3 text-xs ${
                        c.author_id === user?.id 
                          ? 'bg-primary/10 text-content border border-primary/20' 
                          : 'bg-surface-muted text-content border border-border'
                      }`}>
                        <div className="flex justify-between items-baseline gap-3 mb-1">
                          <span className="font-semibold text-primary">{c.author?.full_name || 'Team Member'}</span>
                          <span className="text-[10px] text-content-muted">
                            {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                <input
                  type="text"
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={submittingComment}
                />
                <Button type="submit" variant="primary" disabled={submittingComment || !newComment.trim()} className="px-3 py-1 text-xs">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Task Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Task"
        className="max-w-xl"
      >
        {(() => {
          const filteredEmployees = assignableUsers.filter(u => 
            u.role === 'Employee' && (
              u.full_name.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
              u.email.toLowerCase().includes(assigneeSearch.toLowerCase())
            )
          );
          const filteredInterns = assignableUsers.filter(u => 
            u.role === 'Intern' && (
              u.full_name.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
              u.email.toLowerCase().includes(assigneeSearch.toLowerCase())
            )
          );
          const selectedAssignee = assignableUsers.find(u => u.id === createForm.assignee_id);
          const isSelfAssigned = !createForm.assignee_id || createForm.assignee_id === user?.id;

          return (
            <form onSubmit={handleCreateTask} className="space-y-4 text-xs sm:text-sm">
              {/* 1. Task Title */}
              <div>
                <label className="block font-medium text-content mb-1">Task Title *</label>
                <input
                  id="task-title-input"
                  data-testid="task-title-input"
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Implement API endpoint for auth"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* 2. Description */}
              <div>
                <label className="block font-medium text-content mb-1">Description</label>
                <textarea
                  id="task-description-input"
                  data-testid="task-description-input"
                  rows={2}
                  value={createForm.description || ''}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Provide technical details, requirements, or links..."
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* 3. Project */}
              <div>
                <label className="block font-medium text-content mb-1">Project *</label>
                {projects.length === 0 ? (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-700 dark:text-amber-300">
                    No active projects found. You must create an active project under Projects first.
                  </div>
                ) : (
                  <select
                    id="create-task-project-select"
                    data-testid="create-task-project-select"
                    value={createForm.project_id || (projects.length > 0 ? projects[0].id : '')}
                    onChange={(e) => {
                      setCreateForm({ ...createForm, project_id: e.target.value });
                    }}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 4. Priority & 5. Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-content mb-1">Priority</label>
                  <select
                    id="task-priority-select"
                    data-testid="task-priority-select"
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as TaskPriority })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-content mb-1">Status</label>
                  <select
                    id="task-status-select"
                    data-testid="task-status-select"
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Completed">Completed</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </div>
              </div>

              {/* 6. Progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-content">Progress</label>
                  <span className="text-xs font-semibold text-primary">{createForm.progress || 0}%</span>
                </div>
                <input
                  id="task-progress-input"
                  data-testid="task-progress-input"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={createForm.progress || 0}
                  onChange={(e) => setCreateForm({ ...createForm, progress: parseInt(e.target.value) || 0 })}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Due Date & Estimated Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-content mb-1">Due Date</label>
                  <input
                    type="date"
                    value={createForm.due_date || ''}
                    onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-medium text-content mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={createForm.estimated_hours || 0}
                    onChange={(e) => setCreateForm({ ...createForm, estimated_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* 7. Assign To (Searchable Selector) */}
              <div className="pt-2 border-t border-border">
                <label className="block font-medium text-content mb-1">Assign To *</label>
                
                {isManager ? (
                  <div className="relative">
                    {/* Trigger Selector */}
                    <div 
                      id="assign-to-selector-trigger"
                      data-testid="assign-to-selector-trigger"
                      onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
                      className="w-full flex items-center justify-between p-2.5 bg-surface border border-border rounded-md cursor-pointer hover:border-primary/50 transition-colors shadow-2xs"
                    >
                      {isSelfAssigned ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {user?.email?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-content truncate">Myself ({user?.email})</p>
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-content-muted">
                              {role}
                            </span>
                          </div>
                        </div>
                      ) : selectedAssignee ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          {selectedAssignee.avatar_url ? (
                            <img src={selectedAssignee.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              selectedAssignee.role === 'Employee' 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                            }`}>
                              {selectedAssignee.full_name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-content truncate">{selectedAssignee.full_name}</p>
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                selectedAssignee.role === 'Employee' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300' 
                                : 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300'
                              }`}>
                                {selectedAssignee.role}
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted truncate">{selectedAssignee.email}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-content-muted">Select an employee or intern...</span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-content-muted transition-transform shrink-0 ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Searchable Dropdown Panel */}
                    {isAssigneeDropdownOpen && (
                      <div className="mt-1.5 p-2 bg-surface border border-border rounded-lg shadow-lg space-y-2 z-30">
                        {/* Search Input */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-content-muted" />
                          <input
                            id="assignee-search-input"
                            data-testid="assignee-search-input"
                            type="text"
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Search employees or interns by name or email..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-muted border border-border rounded-md text-content focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                          />
                        </div>

                        {/* Quick Option: Assign to Myself */}
                        <div
                          data-testid="assignee-option-myself"
                          onClick={() => {
                            setCreateForm({ ...createForm, assignee_id: user?.id || '' });
                            setIsAssigneeDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs transition-colors ${
                            isSelfAssigned ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-surface-muted text-content'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                              {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <span>Myself ({user?.email})</span>
                          </div>
                          {isSelfAssigned && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>

                        {/* User Lists by Role */}
                        <div className="max-h-52 overflow-y-auto space-y-3 pt-1 border-t border-border/60">
                          {/* Employees Section */}
                          {filteredEmployees.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wider px-2 mb-1">
                                Employees ({filteredEmployees.length})
                              </p>
                              <div className="space-y-0.5">
                                {filteredEmployees.map((emp) => {
                                  const isSelected = createForm.assignee_id === emp.id;
                                  const slug = emp.email.split('@')[0];
                                  return (
                                    <div
                                      key={emp.id}
                                      id={`assignee-option-${slug}`}
                                      data-testid={`assignee-option-${slug}`}
                                      onClick={() => {
                                        setCreateForm({ ...createForm, assignee_id: emp.id });
                                        setIsAssigneeDropdownOpen(false);
                                      }}
                                      className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-surface-muted text-content'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                                          {emp.full_name.charAt(0)}
                                        </div>
                                        <div className="min-w-0 text-left">
                                          <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-medium truncate">{emp.full_name}</p>
                                            <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                                              Employee
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-content-muted truncate">{emp.email}</p>
                                        </div>
                                      </div>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Interns Section */}
                          {filteredInterns.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wider px-2 mb-1">
                                Interns ({filteredInterns.length})
                              </p>
                              <div className="space-y-0.5">
                                {filteredInterns.map((intern) => {
                                  const isSelected = createForm.assignee_id === intern.id;
                                  const slug = intern.email.split('@')[0];
                                  return (
                                    <div
                                      key={intern.id}
                                      id={`assignee-option-${slug}`}
                                      data-testid={`assignee-option-${slug}`}
                                      onClick={() => {
                                        setCreateForm({ ...createForm, assignee_id: intern.id });
                                        setIsAssigneeDropdownOpen(false);
                                      }}
                                      className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-surface-muted text-content'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                                          {intern.full_name.charAt(0)}
                                        </div>
                                        <div className="min-w-0 text-left">
                                          <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-medium truncate">{intern.full_name}</p>
                                            <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300">
                                              Intern
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-content-muted truncate">{intern.email}</p>
                                        </div>
                                      </div>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {filteredEmployees.length === 0 && filteredInterns.length === 0 && (
                            <div className="p-3 text-center text-xs text-content-muted">
                              No active employees or interns found matching "{assigneeSearch}".
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    disabled
                    value="Self-assigned (Personal Task)"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-md text-content-muted"
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  id="submit-create-task-button"
                  data-testid="submit-create-task-button"
                  type="submit" 
                  variant="primary" 
                  disabled={submittingCreate}
                >
                  {submittingCreate ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
};
