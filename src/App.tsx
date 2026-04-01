import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  where,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Receipt, 
  History, 
  Settings, 
  LogOut, 
  Plus, 
  ShieldCheck, 
  BrainCircuit,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Menu,
  X,
  Download,
  Repeat,
  Eye,
  Info,
  Edit2,
  Pause,
  Play,
  Trash2,
  FileText,
  PieChart,
  Search,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { cn, formatCurrency, formatDate } from './lib/utils';
import { executeAgent, AGENT_TYPES, AgentDecision } from './services/geminiService';
import { logAuditEntry } from './services/auditService';

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-750',
    ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30',
  };
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant as keyof typeof variants],
        className
      )} 
      {...props} 
    />
  );
};

const Card = ({ children, className }: any) => (
  <div className={cn('bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-800', className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: any) => {
  const variants = {
    default: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', variants[variant as keyof typeof variants])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState<any>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<any>(null);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [recurringTransactions, setRecurringTransactions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      if (user) {
        // Ensure user profile exists
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            role: 'admin', // Default for first user
            nombre: user.displayName || 'Usuario',
            activo: true,
            creado_en: serverTimestamp(),
          });
        }
        logAuditEntry('LOGIN', 'auth', { email: user.email });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const qTransactions = query(collection(db, 'transactions'), orderBy('fecha', 'desc'));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qLogs = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setAuditLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qRecurring = query(collection(db, 'recurring_transactions'), orderBy('creado_en', 'desc'));
    const unsubRecurring = onSnapshot(qRecurring, (snapshot) => {
      setRecurringTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubTransactions();
      unsubLogs();
      unsubRecurring();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    await logAuditEntry('LOGOUT', 'auth', { email: user?.email });
    await signOut(auth);
  };

  const triggerAgent = async (type: string, data: any) => {
    setIsProcessing(true);
    try {
      const decision = await executeAgent(type, data);
      await logAuditEntry(`AGENT_${type.toUpperCase()}`, 'ai_service', { decision, input: data });
      return decision;
    } catch (error) {
      console.error('Agent error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Fecha', 'Proveedor', 'Concepto', 'Tipo', 'Monto', 'Moneda', 'Estado', 'Cuenta', 'Confianza', 'Etiquetas'];
    const rows = transactions.map(tx => [
      formatDate(tx.fecha),
      tx.proveedor || 'S/P',
      tx.concepto,
      tx.tipo,
      tx.monto,
      tx.moneda,
      tx.status,
      tx.account_name || 'Sin clasificar',
      tx.confidence_score ? `${(tx.confidence_score * 100).toFixed(1)}%` : 'N/A',
      tx.tags ? tx.tags.join('; ') : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transacciones_ContAI_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesType = filterType === 'all' || tx.tipo === filterType;
    const matchesStatus = filterStatus === 'all' || tx.status === filterStatus;
    const matchesProvider = !filterProvider || 
      (tx.proveedor && tx.proveedor.toLowerCase().includes(filterProvider.toLowerCase())) ||
      (tx.concepto && tx.concepto.toLowerCase().includes(filterProvider.toLowerCase()));
    
    const matchesTag = !filterTag || (tx.tags && tx.tags.some((tag: string) => tag.toLowerCase().includes(filterTag.toLowerCase())));
    
    const txDate = new Date(tx.fecha);
    const matchesStartDate = !filterStartDate || txDate >= new Date(filterStartDate);
    const matchesEndDate = !filterEndDate || txDate <= new Date(filterEndDate + 'T23:59:59');

    return matchesType && matchesStatus && matchesStartDate && matchesEndDate && matchesProvider && matchesTag;
  });

  const addMockTransaction = async () => {
    const proveedores = ['Amazon Business', 'Microsoft Azure', 'CFE', 'Papelería El Centro', 'Consultores Asociados', 'Telmex', 'Sams Club'];
    const possibleTags = ['Urgente', 'Revisado', 'Deducible', 'Proyecto A', 'Proyecto B', 'Oficina', 'Software'];
    const randomTags = Array.from({ length: Math.floor(Math.random() * 3) }, () => possibleTags[Math.floor(Math.random() * possibleTags.length)]);
    
    const mockData = {
      organization_id: 'org_main',
      tipo: Math.random() > 0.5 ? 'ingreso' : 'egreso',
      monto: Math.floor(Math.random() * 10000) + 100,
      moneda: 'MXN',
      concepto: Math.random() > 0.5 ? 'Servicios de Consultoría' : 'Compra de Insumos Generales',
      proveedor: proveedores[Math.floor(Math.random() * proveedores.length)],
      fecha: new Date().toISOString(),
      status: 'pendiente',
      tags: [...new Set(randomTags)]
    };

    const docRef = await addDoc(collection(db, 'transactions'), {
      ...mockData,
      creado_en: serverTimestamp(),
    });

    // Automatically trigger classifier agent
    const decision = await triggerAgent(AGENT_TYPES.CLASIFICADOR, mockData);
    if (decision) {
      await setDoc(doc(db, 'transactions', docRef.id), {
        ...mockData,
        status: decision.requires_human_approval ? 'revisión' : 'conciliado',
        agente_ia_decision: decision.decision,
        confidence_score: decision.confidence_score,
        account_name: decision.account_name,
        creado_en: serverTimestamp(),
      });
    }
  };

  const addRecurringTransaction = () => {
    setSelectedRecurring(null);
    setIsRecurringModalOpen(true);
  };

  const editRecurringTransaction = (rec: any) => {
    setSelectedRecurring(rec);
    setIsRecurringModalOpen(true);
  };

  const toggleRecurringStatus = async (rec: any) => {
    await setDoc(doc(db, 'recurring_transactions', rec.id), {
      ...rec,
      activa: !rec.activa,
    });
    logAuditEntry(rec.activa ? 'PAUSE_RECURRING' : 'RESUME_RECURRING', 'recurring_transactions', { id: rec.id });
  };

  const deleteRecurringTransaction = async (id: string) => {
    // In a real app we might use deleteDoc, but here we'll just deactivate or log
    // For this demo let's just deactivate
    await setDoc(doc(db, 'recurring_transactions', id), {
      activa: false,
      deleted: true,
    }, { merge: true });
    logAuditEntry('DELETE_RECURRING', 'recurring_transactions', { id });
  };

  const saveRecurringTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      organization_id: 'org_main',
      concepto: formData.get('concepto') as string,
      monto: Number(formData.get('monto')),
      tipo: formData.get('tipo') as string,
      frecuencia: formData.get('frecuencia') as string,
      proxima_ejecucion: formData.get('proxima_ejecucion') as string,
      condicion_fin: formData.get('condicion_fin') as string,
      activa: true,
      usuario_id: user?.uid,
      creado_en: serverTimestamp(),
    };

    if (selectedRecurring) {
      await setDoc(doc(db, 'recurring_transactions', selectedRecurring.id), data);
      logAuditEntry('UPDATE_RECURRING', 'recurring_transactions', { id: selectedRecurring.id });
    } else {
      await addDoc(collection(db, 'recurring_transactions'), data);
      logAuditEntry('CREATE_RECURRING', 'recurring_transactions', data);
    }

    setIsRecurringModalOpen(false);
    setSelectedRecurring(null);
  };

  const processRecurring = async () => {
    setIsProcessing(true);
    const now = new Date();
    let processedCount = 0;

    try {
      for (const rec of recurringTransactions) {
        if (!rec.activa) continue;
        
        const nextExec = new Date(rec.proxima_ejecucion);
        if (nextExec <= now) {
          // Create transaction
          const txData = {
            organization_id: rec.organization_id,
            tipo: rec.tipo,
            monto: rec.monto,
            moneda: rec.moneda,
            concepto: `${rec.concepto} (Ejecución ${new Date().toLocaleDateString()})`,
            fecha: now.toISOString(),
            status: 'conciliado', // Recurring are usually pre-approved
            creado_en: serverTimestamp(),
          };

          await addDoc(collection(db, 'transactions'), txData);
          
          // Update next execution
          let newNextExec = new Date(nextExec);
          if (rec.frecuencia === 'diaria') newNextExec.setDate(newNextExec.getDate() + 1);
          else if (rec.frecuencia === 'semanal') newNextExec.setDate(newNextExec.getDate() + 7);
          else if (rec.frecuencia === 'mensual') newNextExec.setMonth(newNextExec.getMonth() + 1);
          else if (rec.frecuencia === 'anual') newNextExec.setFullYear(newNextExec.getFullYear() + 1);

          await setDoc(doc(db, 'recurring_transactions', rec.id), {
            ...rec,
            proxima_ejecucion: newNextExec.toISOString(),
            ocurrencias_completadas: (rec.ocurrencias_completadas || 0) + 1,
          });

          processedCount++;
        }
      }
      
      if (processedCount > 0) {
        logAuditEntry('PROCESS_RECURRING', 'system', { count: processedCount });
      }
    } catch (error) {
      console.error('Error processing recurring:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMonthlyReport = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.fecha);
      return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
    });

    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      netBalance: 0,
      categories: {} as Record<string, { income: number; expense: number }>,
      monthName: now.toLocaleString('es-MX', { month: 'long', year: 'numeric' })
    };

    monthlyTransactions.forEach(tx => {
      const amount = Number(tx.monto);
      const category = tx.account_name || 'Sin clasificar';

      if (!summary.categories[category]) {
        summary.categories[category] = { income: 0, expense: 0 };
      }

      if (tx.tipo === 'ingreso') {
        summary.totalIncome += amount;
        summary.categories[category].income += amount;
      } else {
        summary.totalExpenses += amount;
        summary.categories[category].expense += amount;
      }
    });

    summary.netBalance = summary.totalIncome - summary.totalExpenses;
    setMonthlyReport(summary);
    setIsReportModalOpen(true);
    logAuditEntry('GENERATE_REPORT', 'system', { month: summary.monthName });
  };

  const approveTransaction = async (tx: any) => {
    try {
      await setDoc(doc(db, 'transactions', tx.id), {
        ...tx,
        status: 'conciliado',
        aprobado_por: user?.email,
        aprobado_en: serverTimestamp(),
      });
      
      logAuditEntry('APPROVE_TRANSACTION', 'transactions', { id: tx.id, concepto: tx.concepto });
      setSelectedTransaction(null);
    } catch (error) {
      console.error('Error approving transaction:', error);
    }
  };

  const updateTransactionTags = async (txId: string, newTags: string[]) => {
    try {
      const tx = transactions.find(t => t.id === txId);
      if (!tx) return;
      
      await setDoc(doc(db, 'transactions', txId), {
        ...tx,
        tags: newTags,
        actualizado_en: serverTimestamp()
      });
      
      logAuditEntry('UPDATE_TAGS', 'transactions', { id: txId, tags: newTags });
    } catch (error) {
      console.error('Error updating tags:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ContAI</h1>
            <p className="text-gray-500 dark:text-gray-400">Sistema Contable Autónomo Universal</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-3">
            Iniciar Sesión con Google
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Al iniciar sesión, aceptas nuestros términos y condiciones de seguridad ISO 27034.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex text-gray-900 dark:text-gray-100 overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 80,
          x: typeof window !== 'undefined' && window.innerWidth < 1024 
            ? (isMobileMenuOpen ? 0 : -280) 
            : 0
        }}
        className={cn(
          "bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col fixed lg:sticky top-0 h-screen z-50 lg:z-20 transition-all duration-300",
          !isSidebarOpen && "lg:w-20"
        )}
      >
        <div className="p-6 flex items-center justify-between lg:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
              <span className="font-bold text-xl text-gray-900 dark:text-white">ContAI</span>
            )}
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Panel General' },
            { id: 'transactions', icon: Receipt, label: 'Transacciones' },
            { id: 'recurring', icon: Repeat, label: 'Recurrentes' },
            { id: 'audit', icon: History, label: 'Bitácora' },
            { id: 'settings', icon: Settings, label: 'Configuración' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                activeTab === item.id 
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
                <span className="font-medium">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors',
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
              <span className="font-medium">Cerrar Sesión</span>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 w-full">
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-2 lg:gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:block p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-none">
              {activeTab === 'overview' && 'Panel General'}
              {activeTab === 'transactions' && 'Transacciones'}
              {activeTab === 'recurring' && 'Transacciones Recurrentes'}
              {activeTab === 'audit' && 'Bitácora'}
              {activeTab === 'settings' && 'Configuración'}
            </h2>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[100px]">{user.displayName}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Admin</p>
            </div>
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-full border border-gray-200 dark:border-gray-700"
              alt="Avatar"
              referrerPolicy="no-referrer"
            />
          </div>
        </header>

        <div className="p-4 lg:p-8 overflow-x-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                  {[
                    { label: 'Ingresos Mensuales', value: formatCurrency(1250000), trend: '+12%', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                    { label: 'Egresos Mensuales', value: formatCurrency(850000), trend: '+5%', icon: Receipt, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'Pendientes', value: '24', trend: '-8%', icon: Clock, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                    { label: 'Alertas', value: '3', trend: 'Crítico', icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                  ].map((stat, i) => (
                    <Card key={i} className="p-4 lg:p-6">
                      <div className="flex items-start justify-between">
                        <div className={cn('p-2 lg:p-3 rounded-xl', stat.bg)}>
                          <stat.icon className={cn('w-5 h-5 lg:w-6 lg:h-6', stat.color)} />
                        </div>
                        <span className={cn('text-[10px] lg:text-xs font-bold px-2 py-1 rounded-full', 
                          stat.trend.includes('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                          stat.trend === 'Crítico' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                        )}>
                          {stat.trend}
                        </span>
                      </div>
                      <div className="mt-3 lg:mt-4">
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                        <h3 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Agents Status */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                  <Card className="lg:col-span-2 p-4 lg:p-6">
                    <div className="flex items-center justify-between mb-4 lg:mb-6">
                      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm lg:text-base">
                        <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Estado de Agentes
                      </h3>
                      <Badge variant="success">Online</Badge>
                    </div>
                    <div className="space-y-3 lg:space-y-4">
                      {[
                        { name: 'Conciliador', status: 'Activo', task: 'Conciliando movimientos', efficiency: '98.5%' },
                        { name: 'Clasificador', status: 'Activo', task: 'Procesando gastos', efficiency: '94.2%' },
                        { name: 'Auditor', status: 'Monitoreando', task: 'Escaneando anomalías', efficiency: '100%' },
                      ].map((agent, i) => (
                        <div key={i} className="flex items-center justify-between p-3 lg:p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                          <div className="flex items-center gap-3 lg:gap-4">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                            <div>
                              <p className="text-sm lg:font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                              <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px] sm:max-w-none">{agent.task}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs lg:text-sm font-bold text-gray-900 dark:text-white">{agent.efficiency}</p>
                            <p className="text-[8px] lg:text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Eficiencia</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4 lg:p-6">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm lg:text-base">Acciones Rápidas</h3>
                    <div className="space-y-2 lg:space-y-3">
                      <Button onClick={addMockTransaction} className="w-full justify-start text-sm" disabled={isProcessing}>
                        <Plus className="w-4 h-4" />
                        Nueva Transacción
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <Receipt className="w-4 h-4" />
                        Cargar XML
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <History className="w-4 h-4" />
                        Reporte
                      </Button>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {activeTab === 'transactions' && (
              <motion.div 
                key="transactions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">Transacciones</h3>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button variant="secondary" onClick={generateMonthlyReport} className="flex-1 sm:flex-none">
                      <FileText className="w-4 h-4" />
                      Reporte Mensual
                    </Button>
                    <Button variant="secondary" onClick={exportToCSV} disabled={transactions.length === 0} className="flex-1 sm:flex-none">
                      <Download className="w-4 h-4" />
                      Exportar CSV
                    </Button>
                    <Button onClick={addMockTransaction} disabled={isProcessing} className="flex-1 sm:flex-none">
                      <Plus className="w-4 h-4" />
                      Simular
                    </Button>
                  </div>
                </div>

                {/* Filters */}
                <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Proveedor / Concepto</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input 
                        type="text"
                        placeholder="Buscar..."
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Etiquetas</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input 
                        type="text"
                        placeholder="Filtrar por tag..."
                        value={filterTag}
                        onChange={(e) => setFilterTag(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                    <select 
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="all">Todos los tipos</option>
                      <option value="ingreso">Ingresos</option>
                      <option value="egreso">Egresos</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado</label>
                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="conciliado">Conciliado</option>
                      <option value="revisión">En Revisión</option>
                      <option value="pendiente">Pendiente</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Desde</label>
                    <input 
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hasta</label>
                    <input 
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </Card>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fecha</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Proveedor / Concepto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Monto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Moneda</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado IA</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cuenta</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {filteredTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(tx.fecha)}</td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{tx.proveedor || 'S/P'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{tx.concepto}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tx.tags?.map((tag: string) => (
                                  <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md border border-gray-200 dark:border-gray-700">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{tx.tipo === 'ingreso' ? 'Entrada' : 'Salida'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn('text-sm font-bold', tx.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                {tx.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(tx.monto)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{tx.moneda || 'MXN'}</td>
                            <td className="px-6 py-4">
                              <Badge variant={
                                tx.status === 'conciliado' ? 'success' : 
                                tx.status === 'revisión' ? 'warning' : 'default'
                              }>
                                {tx.status === 'conciliado' ? 'Conciliado' : 
                                 tx.status === 'revisión' ? 'En Revisión' : 'Pendiente'}
                              </Badge>
                              {tx.confidence_score && (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Confianza: {(tx.confidence_score * 100).toFixed(1)}%</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{tx.account_name || 'Sin clasificar'}</td>
                            <td className="px-6 py-4">
                              <Button 
                                variant="ghost" 
                                className="text-xs flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                onClick={() => setSelectedTransaction(tx)}
                              >
                                <Eye className="w-4 h-4" />
                                Ver Detalles
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'recurring' && (
              <motion.div 
                key="recurring"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">Programación de Recurrentes</h3>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button variant="secondary" onClick={processRecurring} disabled={isProcessing} className="flex-1 sm:flex-none">
                      <BrainCircuit className="w-4 h-4" />
                      Procesar Pendientes
                    </Button>
                    <Button onClick={addRecurringTransaction} disabled={isProcessing} className="flex-1 sm:flex-none">
                      <Plus className="w-4 h-4" />
                      Nueva Programación
                    </Button>
                  </div>
                </div>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Concepto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Frecuencia</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Monto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Próxima Ejecución</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {recurringTransactions.filter(r => !r.deleted).map((rec) => (
                          <tr key={rec.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{rec.concepto}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{rec.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant="info" className="capitalize">{rec.frecuencia}</Badge>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn('text-sm font-bold', rec.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                {formatCurrency(rec.monto)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                              {formatDate(rec.proxima_ejecucion)}
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={rec.activa ? 'success' : 'default'}>
                                {rec.activa ? 'Activa' : 'Pausada'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  className="p-2 text-gray-400 hover:text-indigo-600"
                                  onClick={() => toggleRecurringStatus(rec)}
                                  title={rec.activa ? 'Pausar' : 'Reanudar'}
                                >
                                  {rec.activa ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  className="p-2 text-gray-400 hover:text-indigo-600"
                                  onClick={() => editRecurringTransaction(rec)}
                                  title="Editar"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  className="p-2 text-gray-400 hover:text-red-600"
                                  onClick={() => deleteRecurringTransaction(rec.id)}
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'audit' && (
              <motion.div 
                key="audit"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Bitácora de Auditoría Inmutable</h3>
                  <Badge variant="info">ISO 27034 Compliant</Badge>
                </div>

                <div className="space-y-4">
                  {auditLogs.map((log) => (
                    <Card key={log.id} className="p-4 flex items-start gap-4 border-l-4 border-l-indigo-500 dark:border-l-indigo-400">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                        <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-gray-900 dark:text-white">{log.accion}</h4>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.timestamp?.toDate() || new Date())}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Recurso: <span className="font-mono text-xs">{log.recurso}</span></p>
                        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                          <pre className="text-[10px] text-gray-400 dark:text-gray-500 overflow-x-auto">
                            {JSON.stringify(log.detalles, null, 2)}
                          </pre>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">HASH: {log.firma_hash}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-2xl mx-auto"
              >
                <Card className="p-8 space-y-8">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Configuración del Sistema</h3>
                  
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la Empresa</label>
                      <input type="text" className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" defaultValue="Mi Empresa Global SA de CV" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">RFC</label>
                      <input type="text" className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" defaultValue="ABC010101XYZ" />
                    </div>

                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-4">Seguridad y IA</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">Conciliación Automática</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Permitir que la IA concilie montos menores a $50,000</p>
                          </div>
                          <input type="checkbox" defaultChecked className="w-5 h-5 text-indigo-600 rounded dark:bg-gray-800 dark:border-gray-700" />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">Auditoría en Tiempo Real</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Escanear cada transacción en busca de anomalías</p>
                          </div>
                          <input type="checkbox" defaultChecked className="w-5 h-5 text-indigo-600 rounded dark:bg-gray-800 dark:border-gray-700" />
                        </div>
                      </div>
                    </div>

                    <Button className="w-full">Guardar Cambios</Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Processing Overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/60 dark:bg-gray-950/60 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <Card className="p-4 lg:p-8 flex flex-col items-center gap-4 shadow-2xl border-indigo-100 dark:border-indigo-900/30 max-w-[90vw]">
              <div className="relative">
                <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
                <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-indigo-600 dark:border-indigo-400 rounded-full border-t-transparent animate-spin absolute top-0"></div>
                <BrainCircuit className="w-6 h-6 lg:w-8 lg:h-8 text-indigo-600 dark:text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm lg:text-base">Agente IA Procesando</h4>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">Analizando cumplimiento...</p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Monthly Report Modal */}
      <AnimatePresence>
        {isReportModalOpen && monthlyReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                    <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reporte Mensual</h3>
                    <p className="text-xs text-gray-500 capitalize">{monthlyReport.monthName}</p>
                  </div>
                </div>
                <button onClick={() => setIsReportModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Ingresos</p>
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(monthlyReport.totalIncome)}</p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800/50">
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Egresos</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">{formatCurrency(monthlyReport.totalExpenses)}</p>
                  </div>
                  <div className={cn('p-4 rounded-xl border', 
                    monthlyReport.netBalance >= 0 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/50' 
                      : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50'
                  )}>
                    <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-1',
                      monthlyReport.netBalance >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'
                    )}>Balance Neto</p>
                    <p className={cn('text-lg font-bold',
                      monthlyReport.netBalance >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-700 dark:text-amber-300'
                    )}>{formatCurrency(monthlyReport.netBalance)}</p>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    Desglose por Categoría
                  </h4>
                  <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Ingresos</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Egresos</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Neto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {Object.entries(monthlyReport.categories).map(([name, values]: any) => (
                          <tr key={name} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{name}</td>
                            <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 text-right">{formatCurrency(values.income)}</td>
                            <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">{formatCurrency(values.expense)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white text-right">{formatCurrency(values.income - values.expense)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setIsReportModalOpen(false)}>
                  Cerrar
                </Button>
                <Button className="flex-1" onClick={() => window.print()}>
                  <Download className="w-4 h-4" />
                  Descargar PDF
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recurring Transaction Modal */}
      <AnimatePresence>
        {isRecurringModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRecurringModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {selectedRecurring ? 'Editar Programación' : 'Nueva Programación Recurrente'}
                </h3>
                <button onClick={() => setIsRecurringModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={saveRecurringTransaction} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Concepto</label>
                  <input 
                    name="concepto" 
                    required 
                    defaultValue={selectedRecurring?.concepto}
                    placeholder="Ej. Renta de Oficina"
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Monto</label>
                    <input 
                      name="monto" 
                      type="number" 
                      step="0.01" 
                      required 
                      defaultValue={selectedRecurring?.monto}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                    <select 
                      name="tipo" 
                      defaultValue={selectedRecurring?.tipo || 'egreso'}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Frecuencia</label>
                    <select 
                      name="frecuencia" 
                      defaultValue={selectedRecurring?.frecuencia || 'mensual'}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="diaria">Diaria</option>
                      <option value="semanal">Semanal</option>
                      <option value="mensual">Mensual</option>
                      <option value="anual">Anual</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Próxima Ejecución</label>
                    <input 
                      name="proxima_ejecucion" 
                      type="date" 
                      required 
                      defaultValue={selectedRecurring?.proxima_ejecucion?.split('T')[0] || new Date().toISOString().split('T')[0]}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Condición de Fin</label>
                  <select 
                    name="condicion_fin" 
                    defaultValue={selectedRecurring?.condicion_fin || 'nunca'}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="nunca">Nunca (Indefinido)</option>
                    <option value="ocurrencias">Por número de ocurrencias</option>
                    <option value="fecha">Hasta fecha específica</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => setIsRecurringModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1">
                    {selectedRecurring ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                    <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Detalles de Transacción</h3>
                </div>
                <button 
                  onClick={() => setSelectedTransaction(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* General Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(selectedTransaction.fecha)}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monto</p>
                    <p className={cn('text-lg font-bold', selectedTransaction.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {selectedTransaction.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(selectedTransaction.monto)}
                    </p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedTransaction.proveedor || 'Sin especificar'}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Concepto</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedTransaction.concepto}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipo</p>
                    <Badge variant="default" className="capitalize">{selectedTransaction.tipo}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Moneda</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedTransaction.moneda || 'MXN'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuenta Contable</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedTransaction.account_name || 'Sin clasificar'}</p>
                  </div>
                </div>

                {/* Tags Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Etiquetas</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {selectedTransaction.tags?.map((tag: string) => (
                      <Badge key={tag} variant="default" className="flex items-center gap-1 pr-1">
                        {tag}
                        <button 
                          onClick={() => {
                            const updatedTags = selectedTransaction.tags.filter((t: string) => t !== tag);
                            updateTransactionTags(selectedTransaction.id, updatedTags);
                            setSelectedTransaction({...selectedTransaction, tags: updatedTags});
                          }}
                          className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    {(!selectedTransaction.tags || selectedTransaction.tags.length === 0) && (
                      <p className="text-xs text-gray-400 italic">Sin etiquetas</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Nueva etiqueta..."
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTag.trim()) {
                          const updatedTags = [...(selectedTransaction.tags || []), newTag.trim()];
                          updateTransactionTags(selectedTransaction.id, updatedTags);
                          setSelectedTransaction({...selectedTransaction, tags: updatedTags});
                          setNewTag('');
                        }
                      }}
                      className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <Button 
                      variant="secondary" 
                      className="py-1.5 px-3 text-xs"
                      onClick={() => {
                        if (newTag.trim()) {
                          const updatedTags = [...(selectedTransaction.tags || []), newTag.trim()];
                          updateTransactionTags(selectedTransaction.id, updatedTags);
                          setSelectedTransaction({...selectedTransaction, tags: updatedTags});
                          setNewTag('');
                        }
                      }}
                    >
                      Añadir
                    </Button>
                  </div>
                </div>

                {/* AI Agent Info */}
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100/50 dark:border-indigo-900/20 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <BrainCircuit className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Análisis de Agente IA</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Decisión:</p>
                      <Badge variant={
                        selectedTransaction.status === 'conciliado' ? 'success' : 
                        selectedTransaction.status === 'revisión' ? 'warning' : 'default'
                      }>
                        {selectedTransaction.status === 'conciliado' ? 'Conciliado Automáticamente' : 
                         selectedTransaction.status === 'revisión' ? 'Requiere Revisión' : 'Pendiente de Procesar'}
                      </Badge>
                    </div>

                    {selectedTransaction.confidence_score && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <p className="text-gray-500">Puntaje de Confianza:</p>
                          <p className="font-bold text-indigo-600 dark:text-indigo-400">{(selectedTransaction.confidence_score * 100).toFixed(1)}%</p>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedTransaction.confidence_score * 100}%` }}
                            className="h-full bg-indigo-600 dark:bg-indigo-400"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                      <Info className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Justificación de la IA</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                          {selectedTransaction.agente_ia_decision || 'El agente ha clasificado esta transacción basándose en patrones históricos de gastos similares y la categoría de la cuenta detectada.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">¿Requiere Aprobación Humana?</p>
                      <div className="flex items-center gap-2">
                        {selectedTransaction.status === 'revisión' ? (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-amber-600">SÍ</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-600">NO</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Approval & Conciliation Info */}
                {(selectedTransaction.status === 'conciliado' || selectedTransaction.status === 'revisión') && (
                  <div className={cn(
                    "p-4 rounded-xl border space-y-4",
                    selectedTransaction.status === 'conciliado' 
                      ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100/50 dark:border-emerald-900/20" 
                      : "bg-amber-50/50 dark:bg-amber-900/10 border-amber-100/50 dark:border-amber-900/20"
                  )}>
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <ShieldCheck className={cn("w-4 h-4", selectedTransaction.status === 'conciliado' ? "text-emerald-600" : "text-amber-600")} />
                      <span className="text-xs font-bold uppercase tracking-wider">Registro de Validación</span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado de Conciliación</p>
                        <Badge variant={selectedTransaction.status === 'conciliado' ? 'success' : 'warning'}>
                          {selectedTransaction.status === 'conciliado' ? 'Conciliado' : 'Pendiente de Aprobación'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Usuario Validador</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {selectedTransaction.aprobado_por || (selectedTransaction.status === 'conciliado' ? 'Sistema (IA)' : 'Pendiente')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha de Aprobación</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {selectedTransaction.aprobado_en 
                            ? formatDate(selectedTransaction.aprobado_en?.toDate?.() || selectedTransaction.aprobado_en) 
                            : (selectedTransaction.status === 'conciliado' ? 'Automática' : 'Pendiente')}
                        </p>
                      </div>

                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha de Conciliación</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {selectedTransaction.status === 'conciliado' 
                            ? formatDate(selectedTransaction.aprobado_en?.toDate?.() || selectedTransaction.aprobado_en || selectedTransaction.creado_en?.toDate?.() || selectedTransaction.creado_en)
                            : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setSelectedTransaction(null)}>
                  Cerrar
                </Button>
                {selectedTransaction.status === 'revisión' && (
                  <Button className="flex-1" onClick={() => setIsConfirmModalOpen(true)}>
                    Aprobar Transacción
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirmar Aprobación</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ¿Estás seguro de que deseas aprobar esta transacción? Esta acción marcará el movimiento como conciliado.
                  </p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                <Button 
                  variant="secondary" 
                  className="flex-1" 
                  onClick={() => setIsConfirmModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" 
                  onClick={() => {
                    approveTransaction(selectedTransaction);
                    setIsConfirmModalOpen(false);
                  }}
                >
                  Confirmar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
