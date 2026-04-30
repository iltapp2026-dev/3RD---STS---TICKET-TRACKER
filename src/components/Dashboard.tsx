import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp, 
  getDocs,
  where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { Ticket, TicketStatus, Priority, Vendor } from '@/types';
import { 
  Plus, 
  Filter, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  History,
  MoreVertical,
  LogOut,
  Building2,
  Mail,
  Download,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isGmailAuth, setIsGmailAuth] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // New Ticket Form State
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'low' as Priority,
    vendorId: '',
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsGmailAuth(data.authenticated);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData: Ticket[] = [];
      snapshot.forEach((doc) => {
        ticketsData.push({ id: doc.id, ...doc.data() } as Ticket);
      });
      setTickets(ticketsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    // Fetch vendors for selection
    const fetchVendors = async () => {
      try {
        const vendorSnapshot = await getDocs(collection(db, 'vendors'));
        const vendorsData: Vendor[] = [];
        vendorSnapshot.forEach((doc) => {
          vendorsData.push({ id: doc.id, ...doc.data() } as Vendor);
        });
        setVendors(vendorsData);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      }
    };

    fetchVendors();
    fetchAuthStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        toast.success('Gmail connected successfully');
        fetchAuthStatus();
        handleSync();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, [fetchAuthStatus]);

  const handleGmailConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, 'gmail_auth', 'width=600,height=700');
      } else {
        toast.error('OAuth not configured. Check .env');
      }
    } catch (e) {
      toast.error('Failed to get auth URL');
    }
  };

  const handleSync = async () => {
    if (!isGmailAuth) {
      handleGmailConnect();
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      
      if (data.tickets) {
        // Here we'd actually merge/update Firestore tickets based on regex results
        // For this demo, let's just toast how many we found
        toast.info(`Synced ${data.tickets.length} potential tickets from Gmail`);
        
        // Automation: Create found tickets that don't exist
        for (const t of data.tickets) {
          const exists = tickets.some(existing => existing.title.includes(t.ticketNumber));
          if (!exists) {
            await addDoc(collection(db, 'tickets'), {
              title: `[Gmail #${t.ticketNumber}] ${t.subject}`,
              description: `Generated from Gmail sync. Status detected: ${t.status}. Scheduled: ${t.scheduledDate || 'N/A'}`,
              status: t.status === 'completed' ? 'resolved' : t.status === 'scheduled' ? 'in-progress' : 'open',
              priority: 'medium',
              vendorId: vendors[0]?.id || 'unknown',
              vendorName: vendors[0]?.name || 'Unknown',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
              createdBy: 'system-sync'
            });
          }
        }
      }
    } catch (e) {
      toast.error('Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickets: filteredTickets.map(t => ({
            ticketNumber: t.title,
            subject: t.description,
            status: t.status,
            scheduledDate: format(t.createdAt.toDate(), 'yyyy-MM-dd')
          })),
          month: format(new Date(), 'MM'),
          year: format(new Date(), 'yyyy')
        })
      });
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${format(new Date(), 'yyyy-MM')}.xlsx`;
      a.click();
    } catch (e) {
      toast.error('Failed to generate report');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.vendorId) {
      toast.error('Please select a vendor');
      return;
    }

    try {
      const vendorName = vendors.find(v => v.id === newTicket.vendorId)?.name || 'Unknown';
      await addDoc(collection(db, 'tickets'), {
        ...newTicket,
        vendorName,
        status: 'open',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: 'shared-user',
      });
      
      toast.success('Ticket created successfully');
      setNewTicket({
        title: '',
        description: '',
        priority: 'low',
        vendorId: '',
      });
      setIsDialogOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tickets');
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: TicketStatus) => {
    try {
      await updateDoc(doc(db, 'tickets', id), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${id}`);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ticket.vendorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'open': return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Open</Badge>;
      case 'in-progress': return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">In Progress</Badge>;
      case 'resolved': return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">Resolved</Badge>;
      case 'closed': return <Badge variant="outline" className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20">Closed</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'urgent': return <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20">Urgent</Badge>;
      case 'high': return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20">High</Badge>;
      case 'medium': return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Medium</Badge>;
      case 'low': return <Badge variant="outline" className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20">Low</Badge>;
      default: return <Badge>{priority}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>
          <p className="text-zinc-400">Manage and track vendor service requests.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="outline" 
            className={`border-zinc-800 hover:bg-zinc-900 ${isGmailAuth ? 'text-green-400' : 'text-zinc-400'}`}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
            {isGmailAuth ? 'Sync Gmail' : 'Connect Gmail'}
          </Button>

          <Button variant="outline" className="border-zinc-800 hover:bg-zinc-900" onClick={handleDownloadReport}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Report
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger 
              render={
                <Button className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200">
                  <Plus className="w-4 h-4 mr-2" />
                  New Ticket
                </Button>
              }
            />
            <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <form onSubmit={handleCreateTicket}>
                <DialogHeader>
                  <DialogTitle>Create New Ticket</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Fill in the details for the vendor service request.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title" className="text-zinc-300">Title</Label>
                    <Input 
                      id="title" 
                      placeholder="Printer error, network issue, etc." 
                      className="bg-zinc-800 border-zinc-700" 
                      value={newTicket.title}
                      onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vendor" className="text-zinc-300">Vendor</Label>
                    <Select 
                      onValueChange={v => setNewTicket({...newTicket, vendorId: v})}
                      value={newTicket.vendorId}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue placeholder="Select a vendor" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        {vendors.length === 0 ? (
                          <SelectItem value="none" disabled>No vendors found</SelectItem>
                        ) : (
                          vendors.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="priority" className="text-zinc-300">Priority</Label>
                      <Select 
                        onValueChange={v => setNewTicket({...newTicket, priority: v as Priority})}
                        value={newTicket.priority}
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="text-zinc-300">Description</Label>
                    <textarea 
                      id="description" 
                      className="flex min-h-[80px] w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm ring-offset-zinc-950 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-800 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
                      placeholder="Provide more context..."
                      value={newTicket.description}
                      onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200">Submit Ticket</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="border-zinc-800 hover:bg-zinc-900" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total Tickets</CardTitle>
              <History className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tickets.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Open</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tickets.filter(t => t.status === 'open').length}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">In Progress</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tickets.filter(t => t.status === 'in-progress').length}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Resolved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tickets.filter(t => t.status === 'resolved').length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Data section */}
        <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
          <CardHeader className="border-b border-zinc-800 pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>Ticket Queue</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                  <Input 
                    placeholder="Search tickets..." 
                    className="pl-9 w-[200px] bg-zinc-800 border-zinc-700" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select onValueChange={setStatusFilter} value={statusFilter}>
                  <SelectTrigger className="w-[140px] bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader className="bg-zinc-900/50">
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400 font-medium">Ticket</TableHead>
                    <TableHead className="text-zinc-400 font-medium whitespace-nowrap">Vendor</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Priority</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-right">Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors group">
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-zinc-100">{ticket.title}</p>
                            <p className="text-xs text-zinc-500 line-clamp-1 truncate max-w-[300px]">
                              {ticket.description || 'No description provided.'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-sm">{ticket.vendorName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select 
                            defaultValue={ticket.status} 
                            onValueChange={(val) => handleStatusUpdate(ticket.id, val as TicketStatus)}
                          >
                            <SelectTrigger className="w-[120px] h-8 bg-transparent border-zinc-800 focus:ring-0">
                              <SelectValue>{getStatusBadge(ticket.status)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                        <TableCell className="text-right text-xs text-zinc-500 font-mono">
                          {format(ticket.createdAt.toDate(), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </AnimatePresence>
                  {filteredTickets.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                        No tickets found matching your criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
