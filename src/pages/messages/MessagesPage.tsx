import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, cn } from '../../components/ui/Button';
import { MessageSquare, Send, Search, ArrowLeft, Check, CheckCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../features/auth/AuthContext';
import {
  type ContactProfile,
  type MessageItem,
  fetchAuthorizedContacts,
  sendDirectMessage,
  canMessageUser
} from '../../services/messageService';

export const MessagesPage: React.FC = () => {
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<ContactProfile[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ContactProfile | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load authorized contacts according to user role
  const loadContacts = useCallback(async () => {
    if (!user) return;
    try {
      setContactsLoading(true);
      const list = await fetchAuthorizedContacts(user.id, role);
      setContacts(list);
    } catch (err) {
      console.error('Failed to load authorized contacts:', err);
    } finally {
      setContactsLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (!user) return;
    loadContacts();
  }, [user, loadContacts]);

  // Handle URL deep-linking (?userId=...)
  const urlUserId = searchParams.get('userId');
  useEffect(() => {
    if (!urlUserId || contacts.length === 0) return;
    const target = contacts.find(c => c.id === urlUserId);
    if (target && (!selectedUser || selectedUser.id !== target.id)) {
      setSelectedUser(target);
    }
  }, [urlUserId, contacts, selectedUser]);

  // Fetch messages when selectedUser changes
  const fetchMessages = useCallback(async (partnerId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, sender_id, recipient_id, is_read,
          sender:profiles!messages_sender_id_fkey(full_name, avatar_url)
        `)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(150);

      if (error) throw error;
      setMessages((data as any) || []);

      // Mark unread messages from this partner as read
      const unreadIds = (data || [])
        .filter((m: any) => !m.is_read && m.recipient_id === user.id)
        .map((m: any) => m.id);

      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
        // Update local contact unread count
        setContacts(prev => prev.map(c => c.id === partnerId ? { ...c, unread_count: 0 } : c));
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [user]);

  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedUser.id);
  }, [selectedUser, fetchMessages]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('public:messages:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as MessageItem;
          const isRelatedToMe = newMsg.sender_id === user.id || newMsg.recipient_id === user.id;
          if (!isRelatedToMe) return;

          // If message belongs to the currently active conversation
          if (
            selectedUser &&
            ((newMsg.sender_id === user.id && newMsg.recipient_id === selectedUser.id) ||
             (newMsg.sender_id === selectedUser.id && newMsg.recipient_id === user.id))
          ) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });

            // If received, mark as read immediately
            if (newMsg.recipient_id === user.id) {
              supabase.from('messages').update({ is_read: true }).eq('id', newMsg.id);
            }
          }

          // Update contacts snippet, ordering, and ensure new conversation appears
          const partnerId = newMsg.sender_id === user.id ? newMsg.recipient_id : newMsg.sender_id;
          setContacts(prev => {
            const index = prev.findIndex(c => c.id === partnerId);
            if (index === -1) {
              // Reload contacts if an inbound conversation was initiated
              loadContacts();
              return prev;
            }

            const updatedContact = {
              ...prev[index],
              last_message: {
                id: newMsg.id,
                content: newMsg.content,
                created_at: newMsg.created_at,
                is_read: newMsg.is_read,
                sender_id: newMsg.sender_id,
              },
              unread_count: (newMsg.recipient_id === user.id && (!selectedUser || selectedUser.id !== partnerId))
                ? (prev[index].unread_count || 0) + 1
                : prev[index].unread_count,
            };

            const next = [...prev];
            next.splice(index, 1);
            return [updatedContact, ...next];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedUser, loadContacts]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Dynamic search filtering by name, email, department, or role
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.designation && c.designation.toLowerCase().includes(q)) ||
      (c.role && c.role.toLowerCase().includes(q)) ||
      (c.department && c.department.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  const handleSelectUser = (c: ContactProfile) => {
    setSelectedUser(c);
    setSearchParams({ userId: c.id });
  };

  const handleBackToContacts = () => {
    setSelectedUser(null);
    setSearchParams({});
  };

  // Determine if messaging/replying is permitted for the selected conversation
  const canReplyToSelected = useMemo(() => {
    if (!selectedUser) return false;
    return canMessageUser(role, selectedUser.role);
  }, [role, selectedUser]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser || sending) return;

    if (!canReplyToSelected) {
      alert('Replies are restricted for this conversation.');
      return;
    }

    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const data = await sendDirectMessage(
        user.id,
        selectedUser.id,
        content,
        role,
        selectedUser.role
      );

      if (data) {
        setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]));
        
        // Update contact last message
        setContacts(prev => {
          const idx = prev.findIndex(c => c.id === selectedUser.id);
          if (idx === -1) return prev;
          const updated = {
            ...prev[idx],
            last_message: {
              id: data.id,
              content: data.content,
              created_at: data.created_at,
              is_read: false,
              sender_id: user.id,
            },
          };
          const next = [...prev];
          next.splice(idx, 1);
          return [updated, ...next];
        });
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setNewMessage(content);
      alert(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getRoleBadgeColor = (userRole?: string) => {
    switch (userRole) {
      case 'Super Admin':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200';
      case 'Admin':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200';
      case 'Employee':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200';
      case 'Intern':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200';
      default:
        return 'bg-surface-muted text-content-muted border-border';
    }
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] md:h-[calc(100vh-8rem)] flex flex-col space-y-3 min-h-0">
      {/* Title */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-content">Direct Messages</h1>
        </div>
        <span className="text-xs text-content-muted hidden sm:inline">
          Authorized Company Directory • 1-to-1 Secure
        </span>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex bg-surface border border-border rounded-xl overflow-hidden min-h-0 shadow-xs">
        
        {/* Left Panel: Contacts List & Dynamic Search */}
        <div 
          id="messages-contacts-panel"
          data-testid="contacts-list"
          className={cn(
            "w-full md:w-80 lg:w-96 border-r border-border bg-surface flex flex-col shrink-0 min-h-0",
            selectedUser ? "hidden md:flex" : "flex"
          )}
        >
          {/* Dynamic Search Box */}
          <div className="p-3 border-b border-border bg-surface shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="messages-search-input"
                data-testid="messages-search-input"
                type="text"
                placeholder="Search colleagues by name, email, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-border rounded-lg text-xs sm:text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Contacts Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {contactsLoading ? (
              <div className="p-6 text-center text-xs text-content-muted">
                Loading authorized contacts...
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-content-muted">
                {searchQuery ? `No colleagues match "${searchQuery}"` : 'No contacts found.'}
              </div>
            ) : (
              filteredContacts.map(c => {
                const isSelected = selectedUser?.id === c.id;
                const slug = c.email.split('@')[0];
                return (
                  <button
                    key={c.id}
                    id={`contact-${slug}`}
                    data-testid={`contact-item-${c.id}`}
                    onClick={() => handleSelectUser(c)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-3 transition-colors text-left border-l-2",
                      isSelected
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-transparent hover:bg-surface-muted text-content"
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={c.full_name}
                          className="h-10 w-10 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-bold text-sm">
                          {c.full_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {c.unread_count && c.unread_count > 0 ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                          {c.unread_count > 9 ? '9+' : c.unread_count}
                        </span>
                      ) : null}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-xs sm:text-sm text-content truncate">
                          {c.full_name}
                        </span>
                        {c.last_message && (
                          <span className="text-[10px] text-content-muted shrink-0">
                            {new Date(c.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={cn("px-1.5 py-0.2 rounded text-[9px] font-semibold border", getRoleBadgeColor(c.role))}>
                            {c.role}
                          </span>
                          <span className="text-content-muted truncate text-[11px]">
                            {c.last_message?.content || c.designation || c.email}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Area */}
        <div 
          id="messages-chat-panel"
          data-testid="chat-panel"
          className={cn(
            "flex-1 flex flex-col bg-surface relative min-h-0",
            !selectedUser ? "hidden md:flex" : "flex"
          )}
        >
          {selectedUser ? (
            <>
              {/* Chat Header (Contacts → Chat → Back) */}
              <div 
                data-testid="chat-header"
                className="h-15 border-b border-border flex items-center px-3 sm:px-5 gap-3 bg-surface shrink-0"
              >
                {/* Mobile Back Button (Contacts → Chat → Back) */}
                <button
                  type="button"
                  id="back-to-contacts-btn"
                  data-testid="back-to-contacts-btn"
                  onClick={handleBackToContacts}
                  className="md:hidden p-1.5 -ml-1 rounded-lg text-content-muted hover:text-content hover:bg-surface-muted transition-colors shrink-0 flex items-center gap-1 text-xs font-medium"
                  aria-label="Back to contacts"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Contacts</span>
                </button>

                {/* Avatar */}
                <div className="shrink-0">
                  {selectedUser.avatar_url ? (
                    <img
                      src={selectedUser.avatar_url}
                      alt={selectedUser.full_name}
                      className="h-9 w-9 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-bold text-xs">
                      {selectedUser.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Contact Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-content text-sm sm:text-base truncate">
                      {selectedUser.full_name}
                    </h2>
                    <span className={cn("px-1.5 py-0.2 rounded text-[9px] font-semibold border", getRoleBadgeColor(selectedUser.role))}>
                      {selectedUser.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-content-muted truncate">
                    {selectedUser.email} {selectedUser.department && `• ${selectedUser.department}`}
                  </p>
                </div>
              </div>

              {/* Messages Container */}
              <div 
                data-testid="chat-messages-container"
                className="flex-1 p-3 sm:p-5 overflow-y-auto space-y-4 min-h-0 bg-surface-muted/20"
              >
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-content-muted">
                    Loading conversation history...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-content-muted space-y-2">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <p className="font-medium text-sm text-content">Direct Message with {selectedUser.full_name}</p>
                    <p className="text-xs text-content-muted text-center max-w-xs">
                      {canReplyToSelected
                        ? 'Send a secure direct message to start this 1-to-1 conversation.'
                        : 'Replies are restricted for this conversation.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isMe = msg.sender_id === user?.id;
                    const showHeader = index === 0 ||
                      messages[index - 1].sender_id !== msg.sender_id ||
                      (new Date(msg.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 5 * 60000);

                    return (
                      <div 
                        key={msg.id} 
                        className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                      >
                        {showHeader && (
                          <div className="flex items-baseline gap-2 mb-1 px-1">
                            {!isMe && (
                              <span className="font-medium text-xs text-content">
                                {selectedUser.full_name}
                              </span>
                            )}
                            <span className="text-[10px] text-content-muted">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMe && <span className="font-medium text-xs text-content">You</span>}
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-xs sm:text-sm shadow-2xs",
                            isMe
                              ? "bg-primary text-white rounded-tr-xs"
                              : "bg-surface border border-border text-content rounded-tl-xs"
                          )}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                          <div className={cn("text-[9px] mt-1 flex items-center justify-end gap-1", isMe ? "text-white/80" : "text-content-muted")}>
                            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isMe && (
                              msg.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer or Restricted Banner */}
              {canReplyToSelected ? (
                <div className="p-2.5 sm:p-3 border-t border-border bg-surface shrink-0">
                  <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                    <textarea
                      id="message-input"
                      data-testid="message-input"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${selectedUser.full_name}...`}
                      className="flex-1 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-xs sm:text-sm text-content focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[42px] max-h-28"
                      rows={1}
                    />
                    <Button
                      id="send-message-btn"
                      data-testid="send-message-btn"
                      type="submit"
                      variant="primary"
                      disabled={!newMessage.trim() || sending}
                      className="rounded-xl h-[42px] w-[42px] p-0 flex items-center justify-center shrink-0"
                      aria-label="Send Message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              ) : (
                <div 
                  id="replies-restricted-banner"
                  data-testid="replies-restricted-banner"
                  className="p-3.5 bg-surface-muted border-t border-border flex items-center justify-center gap-2 text-xs text-content-muted"
                >
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="font-medium">Replies are restricted for this conversation.</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-content-muted bg-surface-muted/20 p-6 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                <MessageSquare className="h-8 w-8" />
              </div>
              <p className="font-semibold text-content text-base">Select a conversation or colleague</p>
              <p className="text-xs text-content-muted mt-1 max-w-sm">
                Choose an authorized company contact from the directory on the left or search by name or email to start a direct 1-to-1 conversation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
