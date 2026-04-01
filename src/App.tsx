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
  X
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
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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

    return () => {
      unsubTransactions();
      unsubLogs();
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

  const addMockTransaction = async () => {
    const mockData = {
      organization_id: 'org_main',
      tipo: Math.random() > 0.5 ? 'ingreso' : 'egreso',
      monto: Math.floor(Math.random() * 10000) + 100,
      moneda: 'MXN',
      concepto: Math.random() > 0.5 ? 'Servicios de Consultoría' : 'Compra de Insumos Generales',
      fecha: new Date().toISOString(),
      status: 'pendiente',
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">contAI</h1>
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col sticky top-0 h-screen z-20"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          {isSidebarOpen && <span className="font-bold text-xl text-gray-900 dark:text-white">contAI</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Panel General' },
            { id: 'transactions', icon: Receipt, label: 'Transacciones' },
            { id: 'audit', icon: History, label: 'Bitácora' },
            { id: 'settings', icon: Settings, label: 'Configuración' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                activeTab === item.id 
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
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
            {isSidebarOpen && <span className="font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {activeTab === 'overview' && 'Panel General'}
              {activeTab === 'transactions' && 'Gestión de Transacciones'}
              {activeTab === 'audit' && 'Bitácora de Auditoría'}
              {activeTab === 'settings' && 'Configuración del Sistema'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
              title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user.displayName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Administrador</p>
            </div>
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700"
              alt="Avatar"
              referrerPolicy="no-referrer"
            />
          </div>
        </header>

        <div className="p-8 overflow-auto">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Ingresos Mensuales', value: formatCurrency(1250000), trend: '+12%', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                    { label: 'Egresos Mensuales', value: formatCurrency(850000), trend: '+5%', icon: Receipt, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'Pendientes Conciliación', value: '24', trend: '-8%', icon: Clock, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                    { label: 'Alertas de Auditoría', value: '3', trend: 'Crítico', icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                  ].map((stat, i) => (
                    <Card key={i} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className={cn('p-3 rounded-xl', stat.bg)}>
                          <stat.icon className={cn('w-6 h-6', stat.color)} />
                        </div>
                        <span className={cn('text-xs font-bold px-2 py-1 rounded-full', 
                          stat.trend.includes('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                          stat.trend === 'Crítico' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                        )}>
                          {stat.trend}
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Agents Status */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Estado de Agentes Autónomos
                      </h3>
                      <Badge variant="success">Sistema Operativo</Badge>
                    </div>
                    <div className="space-y-4">
                      {[
                        { name: 'Agente Conciliador', status: 'Activo', task: 'Conciliando movimientos Banorte', efficiency: '98.5%' },
                        { name: 'Agente Clasificador', status: 'Activo', task: 'Procesando tickets de sucursal León', efficiency: '94.2%' },
                        { name: 'Agente Auditor', status: 'Monitoreando', task: 'Escaneando anomalías en CFDI 4.0', efficiency: '100%' },
                      ].map((agent, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                          <div className="flex items-center gap-4">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{agent.task}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{agent.efficiency}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Eficiencia</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4">Acciones Rápidas</h3>
                    <div className="space-y-3">
                      <Button onClick={addMockTransaction} className="w-full justify-start" disabled={isProcessing}>
                        <Plus className="w-4 h-4" />
                        Nueva Transacción
                      </Button>
                      <Button variant="secondary" className="w-full justify-start">
                        <Receipt className="w-4 h-4" />
                        Cargar XML (SAT)
                      </Button>
                      <Button variant="secondary" className="w-full justify-start">
                        <History className="w-4 h-4" />
                        Ver Reporte Mensual
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
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Historial de Transacciones</h3>
                  <Button onClick={addMockTransaction} disabled={isProcessing}>
                    <Plus className="w-4 h-4" />
                    Simular Transacción
                  </Button>
                </div>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fecha</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Concepto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Monto</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado IA</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cuenta</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(tx.fecha)}</td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{tx.concepto}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{tx.tipo === 'ingreso' ? 'Entrada' : 'Salida'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn('text-sm font-bold', tx.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                {tx.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(tx.monto)}
                              </span>
                            </td>
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
                              <Button variant="ghost" className="p-2">
                                <ChevronRight className="w-4 h-4" />
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
            <Card className="p-8 flex flex-col items-center gap-4 shadow-2xl border-indigo-100 dark:border-indigo-900/30">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
                <div className="w-16 h-16 border-4 border-indigo-600 dark:border-indigo-400 rounded-full border-t-transparent animate-spin absolute top-0"></div>
                <BrainCircuit className="w-8 h-8 text-indigo-600 dark:text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <h4 className="font-bold text-gray-900 dark:text-white">Agente IA Procesando</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">Analizando cumplimiento y conciliación...</p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
