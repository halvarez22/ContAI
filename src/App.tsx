import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  where,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
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
  Tag,
  Activity,
  Upload,
  Sparkles,
  MessageSquare,
  Package,
  Percent,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { cn, formatCurrency, formatDate } from './lib/utils';
import { executeAgent, AGENT_TYPES, AgentDecision } from './services/geminiService';
import { logAuditEntry } from './services/auditService';
import {
  filterTransactionsByMonth,
  filterTransactionsYtdThroughMonth,
  computeRiskRankings,
  buildMonthlyContextPack,
  parseBankCsv,
  suggestBankMatches,
  type ParsedBankRow,
  type BankMatchSuggestion,
} from './lib/monthlyAnalysis';
import { buildFiscalSnapshot, parseIvaTasa } from './lib/fiscal';
import { computeMonthlyIva } from './lib/ivaMonth';
import { computeIsrProvisionalSummary } from './lib/isrProvisional';
import { isPeriodClosed, isTransactionDateInClosedPeriod, periodKey } from './lib/periodClose';
import {
  parseCfdiXml,
  mapTipoComprobanteToTxTipo,
  inferIvaTasaFromAmounts,
} from './lib/cfdiXml';
import { generateExecutiveBriefing, askMonthQuestion } from './services/insightsService';

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

const DEFAULT_ACCOUNT_CATALOG = [
  'Insumos y Mercancías',
  'Gastos Operativos',
  'Viáticos y Viajes',
  'Nómina y Honorarios',
  'Marketing y Publicidad',
  'Servicios Profesionales',
  'Impuestos',
  'Otros',
];

export default function App() {
  const HIGH_AMOUNT_REVIEW_THRESHOLD = 50000;
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState<any>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<any>(null);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
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
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [accountCatalog, setAccountCatalog] = useState<string[]>(DEFAULT_ACCOUNT_CATALOG);
  const [settingsCatalogDraft, setSettingsCatalogDraft] = useState(() => DEFAULT_ACCOUNT_CATALOG.join('\n'));
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaRfc, setEmpresaRfc] = useState('');
  const [draftEmpresaNombre, setDraftEmpresaNombre] = useState('');
  const [draftEmpresaRfc, setDraftEmpresaRfc] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const prevActiveTabRef = useRef<string | null>(null);
  const settingsCatalogDirtyRef = useRef(false);
  const nowInit = new Date();
  const [periodYear, setPeriodYear] = useState(nowInit.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(nowInit.getMonth());
  const [riskSeverityFilter, setRiskSeverityFilter] = useState<string>('all');
  const [isExecutiveModalOpen, setIsExecutiveModalOpen] = useState(false);
  const [executiveDraftText, setExecutiveDraftText] = useState('');
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [bankCsvPreview, setBankCsvPreview] = useState<{ rows: ParsedBankRow[]; errors: string[] } | null>(null);
  const [bankMatchHints, setBankMatchHints] = useState<BankMatchSuggestion[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<any[]>([]);
  const [periodosCerrados, setPeriodosCerrados] = useState<string[]>([]);
  const [isCfdiImportOpen, setIsCfdiImportOpen] = useState(false);
  const [cfdiPreview, setCfdiPreview] = useState<import('./lib/cfdiXml').CfdiExtracted | null>(null);
  const [cfdiImportError, setCfdiImportError] = useState<string | null>(null);
  const [cfdiImporting, setCfdiImporting] = useState(false);
  const [cfdiXsdMode, setCfdiXsdMode] = useState<string | null>(null);
  const [cfdiXsdValidating, setCfdiXsdValidating] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [excelImportMessage, setExcelImportMessage] = useState<string | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
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

    const unsubUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data();
        const list = data?.cuentas_contables;
        if (Array.isArray(list) && list.length > 0) {
          const cleaned = list.map((s: unknown) => String(s).trim()).filter(Boolean);
          setAccountCatalog(cleaned.length > 0 ? cleaned : DEFAULT_ACCOUNT_CATALOG);
        } else {
          setAccountCatalog(DEFAULT_ACCOUNT_CATALOG);
        }
        setEmpresaNombre(String(data?.empresa_nombre ?? '').trim());
        setEmpresaRfc(String(data?.empresa_rfc ?? '').trim());
        const pc = data?.periodos_cerrados;
        setPeriodosCerrados(Array.isArray(pc) ? pc.map((x: unknown) => String(x)) : []);
      },
      (err) => console.error('No se pudo leer perfil de usuario:', err)
    );

    return () => unsubUser();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'settings' && prevActiveTabRef.current !== 'settings') {
      settingsCatalogDirtyRef.current = false;
      setSettingsCatalogDraft(accountCatalog.join('\n'));
      setDraftEmpresaNombre(empresaNombre);
      setDraftEmpresaRfc(empresaRfc);
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, accountCatalog, empresaNombre, empresaRfc]);

  useEffect(() => {
    if (activeTab !== 'settings' || settingsCatalogDirtyRef.current) return;
    setSettingsCatalogDraft(accountCatalog.join('\n'));
  }, [accountCatalog, activeTab]);

  const saveSettingsProfile = async () => {
    if (!user) return;
    const lines = settingsCatalogDraft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      alert('Agrega al menos una cuenta (una por línea).');
      return;
    }
    const nombre = draftEmpresaNombre.trim();
    const rfc = draftEmpresaRfc.trim().toUpperCase();
    setIsSavingSettings(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          cuentas_contables: lines,
          empresa_nombre: nombre,
          empresa_rfc: rfc,
          actualizado_en: serverTimestamp(),
        },
        { merge: true }
      );
      await logAuditEntry('UPDATE_SETTINGS', 'users', { cuentas: lines.length, empresa: Boolean(nombre), rfc: Boolean(rfc) });
      settingsCatalogDirtyRef.current = false;
    } catch (e) {
      console.error('No se pudo guardar la configuración:', e);
      alert('No se pudo guardar la configuración. Verifica permisos.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const qTransactions = query(collection(db, 'transactions'), where('usuario_id', '==', user.uid));
    const unsubTransactions = onSnapshot(
      qTransactions,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        data.sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
        setTransactions(data);
      },
      (error) => {
        console.error('No se pudieron leer transacciones (permisos):', error);
        setTransactions([]);
      }
    );

    const qLogs = query(collection(db, 'audit_logs'), where('usuario_id', '==', user.uid));
    const unsubLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        data.sort((a, b) => {
          const aTs = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const bTs = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return bTs - aTs;
        });
        setAuditLogs(data);
      },
      (error) => {
        console.error('No se pudo leer bitácora (permisos):', error);
        setAuditLogs([]);
      }
    );

    const qRecurring = query(collection(db, 'recurring_transactions'), where('usuario_id', '==', user.uid));
    const unsubRecurring = onSnapshot(
      qRecurring,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        data.sort((a, b) => {
          const aTs = a.creado_en?.toDate ? a.creado_en.toDate().getTime() : 0;
          const bTs = b.creado_en?.toDate ? b.creado_en.toDate().getTime() : 0;
          return bTs - aTs;
        });
        setRecurringTransactions(data);
      },
      (error) => {
        console.error('No se pudieron leer recurrentes (permisos):', error);
        setRecurringTransactions([]);
      }
    );

    const qProducts = query(collection(db, 'products'), where('usuario_id', '==', user.uid));
    const unsubProducts = onSnapshot(
      qProducts,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        data.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
        setProducts(data);
      },
      () => setProducts([])
    );

    const qInv = query(collection(db, 'inventory_movements'), where('usuario_id', '==', user.uid));
    const unsubInv = onSnapshot(
      qInv,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        data.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setInventoryMovements(data);
      },
      () => setInventoryMovements([])
    );

    return () => {
      unsubTransactions();
      unsubLogs();
      unsubRecurring();
      unsubProducts();
      unsubInv();
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

  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const codigo = String(fd.get('codigo') || '').trim();
    const descripcion = String(fd.get('descripcion') || '').trim();
    if (!codigo || !descripcion) {
      alert('Código y descripción son obligatorios.');
      return;
    }
    try {
      await addDoc(collection(db, 'products'), {
        organization_id: 'org_main',
        usuario_id: user.uid,
        codigo,
        descripcion,
        unidad: String(fd.get('unidad') || '').trim() || 'PZA',
        creado_en: serverTimestamp(),
      });
      await logAuditEntry('CREATE_PRODUCT', 'products', { codigo });
      e.currentTarget.reset();
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el producto.');
    }
  };

  const saveInventoryMovement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const product_id = String(fd.get('product_id') || '');
    const tipoMov = String(fd.get('tipo_mov') || 'entrada');
    const cantidad = Number(fd.get('cantidad'));
    const fecha = String(fd.get('fecha_mov') || '');
    if (!product_id || Number.isNaN(cantidad) || cantidad === 0) {
      alert('Selecciona producto y una cantidad distinta de cero.');
      return;
    }
    const fechaIsoInv = new Date(fecha).toISOString();
    if (isTransactionDateInClosedPeriod(fechaIsoInv, periodosCerrados)) {
      alert('El periodo de esa fecha está cerrado. No se registran movimientos de inventario.');
      return;
    }
    try {
      await addDoc(collection(db, 'inventory_movements'), {
        organization_id: 'org_main',
        usuario_id: user.uid,
        product_id: product_id,
        tipo: tipoMov,
        cantidad,
        costo_unitario: Number(fd.get('costo_unitario')) || 0,
        fecha: new Date(fecha).toISOString(),
        nota: String(fd.get('nota_mov') || '').trim(),
        creado_en: serverTimestamp(),
      });
      await logAuditEntry('CREATE_INV_MOV', 'inventory_movements', { product_id: product_id.slice(0, 40), tipo: tipoMov });
      e.currentTarget.reset();
    } catch (err) {
      console.error(err);
      alert('No se pudo registrar el movimiento.');
    }
  };

  const fiscalPayloadFromForm = (formData: FormData, tipo: 'ingreso' | 'egreso', monto: number) => {
    const iva_tasa = parseIvaTasa(String(formData.get('iva_tasa')));
    const egreso_acredita_iva = tipo === 'egreso' ? formData.get('egreso_acredita_iva') === 'true' : false;
    const deducible = tipo === 'egreso' ? formData.get('deducible') === 'true' : true;
    const snap = buildFiscalSnapshot(tipo, monto, iva_tasa, egreso_acredita_iva);
    const rfc_c = String(formData.get('rfc_contraparte') || '').trim();
    const uso = String(formData.get('uso_cfdi') || '').trim();
    const fp = String(formData.get('forma_pago_sat') || '').trim();
    const mp = String(formData.get('metodo_pago_sat') || '').trim();
    const cp = String(formData.get('cp_expedicion') || '').trim();
    return {
      iva_tasa,
      egreso_acredita_iva,
      deducible,
      fiscal_subtotal: snap.subtotal,
      fiscal_iva: snap.iva,
      ...(rfc_c ? { rfc_contraparte: rfc_c } : {}),
      ...(uso ? { uso_cfdi: uso } : {}),
      ...(fp ? { forma_pago_sat: fp } : {}),
      ...(mp ? { metodo_pago_sat: mp } : {}),
      ...(cp ? { cp_expedicion: cp } : {}),
    };
  };

  const togglePeriodoCerrado = async () => {
    if (!user) return;
    const key = periodKey(periodYear, periodMonth);
    const cerrado = periodosCerrados.includes(key);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          periodos_cerrados: cerrado ? arrayRemove(key) : arrayUnion(key),
          actualizado_en: serverTimestamp(),
        },
        { merge: true }
      );
      await logAuditEntry(cerrado ? 'OPEN_PERIOD' : 'CLOSE_PERIOD', 'users', { periodo: key });
    } catch (e) {
      console.error(e);
      alert('No se pudo actualizar el cierre del periodo.');
    }
  };

  const handleCfdiFile = (file: File | null) => {
    if (!file) return;
    setCfdiImportError(null);
    setCfdiPreview(null);
    setCfdiXsdMode(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      setCfdiXsdValidating(true);
      try {
        const { validateCfdiXmlAgainstXsd } = await import('./lib/cfdiXsdValidate');
        const xsd = await validateCfdiXmlAgainstXsd(text);
        setCfdiXsdMode(xsd.mode);
        if (!xsd.valid) {
          setCfdiImportError(
            [...xsd.errors, `(esquema: ${xsd.mode})`].filter(Boolean).join(' · ')
          );
          return;
        }
        const r = parseCfdiXml(text);
        if (r.ok === false) {
          setCfdiImportError(r.errors.join(' '));
          return;
        }
        setCfdiPreview(r.data);
      } finally {
        setCfdiXsdValidating(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const runExcelImport = async (fileList: FileList | null) => {
    if (!fileList?.length || !user) return;
    setExcelImporting(true);
    setExcelImportMessage(null);
    try {
      const { parseContaiExcelBuffer, mergeExcelResults } = await import('./lib/excelContaiImportXlsx');
      const { commitExcelImport } = await import('./services/excelImportService');
      const results = [];
      for (const f of Array.from(fileList)) {
        const buf = await f.arrayBuffer();
        results.push(parseContaiExcelBuffer(buf, f.name));
      }
      const merged = mergeExcelResults(results);
      const skippedClosed: string[] = [];
      const txs = merged.transactions.filter((t) => {
        if (isTransactionDateInClosedPeriod(t.fecha, periodosCerrados)) {
          skippedClosed.push(t.concepto.slice(0, 40));
          return false;
        }
        return true;
      });
      const { txCount, productCount } = await commitExcelImport(user.uid, txs, merged.products);
      setExcelImportMessage(
        [
          `Listo: ${txCount} transacciones, ${productCount} productos.`,
          merged.warnings.length
            ? `Avisos (${merged.warnings.length}): ${merged.warnings.slice(0, 8).join(' · ')}`
            : '',
          skippedClosed.length ? `Omitidas por periodo cerrado: ${skippedClosed.length}.` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (e) {
      console.error(e);
      setExcelImportMessage('Error al importar. Revisa la consola o el formato de los archivos.');
    } finally {
      setExcelImporting(false);
    }
  };

  const importCfdiAsTransaction = async () => {
    if (!user || !cfdiPreview) return;
    const d = cfdiPreview;
    let fechaIso: string;
    try {
      fechaIso = new Date(d.fecha).toISOString();
    } catch {
      setCfdiImportError('Fecha inválida en el CFDI.');
      return;
    }
    if (isTransactionDateInClosedPeriod(fechaIso, periodosCerrados)) {
      alert('El periodo de la fecha del CFDI está cerrado.');
      return;
    }
    setCfdiImporting(true);
    setCfdiImportError(null);
    try {
      const tipo = mapTipoComprobanteToTxTipo(d.tipoComprobante);
      const iva_tasa = inferIvaTasaFromAmounts(d.subtotal, d.totalIvaTrasladado);
      const proveedor =
        tipo === 'ingreso'
          ? d.receptorNombre || d.receptorRfc || 'Cliente'
          : d.emisorNombre || d.emisorRfc || 'Proveedor';
      const concepto = d.descripcionPrimerConcepto
        ? `CFDI: ${d.descripcionPrimerConcepto}`
        : `CFDI importado${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`;

      const docRef = await addDoc(collection(db, 'transactions'), {
        organization_id: 'org_main',
        usuario_id: user.uid,
        tipo,
        monto: d.total,
        moneda: d.moneda || 'MXN',
        concepto,
        proveedor,
        fecha: fechaIso,
        status: 'pendiente',
        account_name: '',
        tags: [],
        iva_tasa,
        egreso_acredita_iva: tipo === 'egreso',
        deducible: tipo === 'egreso',
        fiscal_subtotal: d.subtotal,
        fiscal_iva: d.totalIvaTrasladado,
        rfc_contraparte: tipo === 'ingreso' ? d.receptorRfc : d.emisorRfc,
        uso_cfdi: d.receptorUsoCfdi || undefined,
        forma_pago_sat: d.formaPago || undefined,
        metodo_pago_sat: d.metodoPago || undefined,
        cp_expedicion: d.lugarExpedicion || undefined,
        cfdi_uuid: d.uuid || undefined,
        importado_cfdi: true,
        creado_en: serverTimestamp(),
      });

      const decision = await triggerAgent(AGENT_TYPES.CLASIFICADOR, {
        tipo,
        monto: d.total,
        concepto,
        proveedor,
        fecha: fechaIso,
        moneda: d.moneda || 'MXN',
      });
      if (decision) {
        const requiresPolicyReview = d.total > HIGH_AMOUNT_REVIEW_THRESHOLD;
        const requiresHumanApproval = decision.requires_human_approval || requiresPolicyReview;
        await setDoc(doc(db, 'transactions', docRef.id), {
          tipo,
          monto: d.total,
          moneda: d.moneda || 'MXN',
          concepto,
          proveedor,
          fecha: fechaIso,
          status: requiresHumanApproval ? 'revisión' : 'conciliado',
          account_name: decision.account_name,
          agente_ia_decision: decision.decision,
          confidence_score: decision.confidence_score,
          account_source: 'ai',
          policy_review_reason: requiresPolicyReview ? `Monto mayor a ${HIGH_AMOUNT_REVIEW_THRESHOLD}` : null,
          organization_id: 'org_main',
          usuario_id: user.uid,
          iva_tasa,
          egreso_acredita_iva: tipo === 'egreso',
          deducible: tipo === 'egreso',
          fiscal_subtotal: d.subtotal,
          fiscal_iva: d.totalIvaTrasladado,
          rfc_contraparte: tipo === 'ingreso' ? d.receptorRfc : d.emisorRfc,
          uso_cfdi: d.receptorUsoCfdi || undefined,
          forma_pago_sat: d.formaPago || undefined,
          metodo_pago_sat: d.metodoPago || undefined,
          cp_expedicion: d.lugarExpedicion || undefined,
          cfdi_uuid: d.uuid || undefined,
          importado_cfdi: true,
          creado_en: serverTimestamp(),
        });
      }

      await logAuditEntry('IMPORT_CFDI', 'transactions', { id: docRef.id, uuid: d.uuid });
      setIsCfdiImportOpen(false);
      setCfdiPreview(null);
    } catch (err) {
      console.error(err);
      setCfdiImportError('No se pudo guardar la transacción.');
    } finally {
      setCfdiImporting(false);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Fecha', 'Proveedor', 'Concepto', 'Tipo', 'Monto', 'Moneda', 'Estado', 'Cuenta', 'Confianza', 'Etiquetas', 'IVA tasa', 'Subtotal fiscal', 'IVA fiscal'];
    const metaRows = [
      ['Empresa', empresaNombre || '—'],
      ['RFC', empresaRfc || '—'],
      ['Exportado', formatDate(new Date().toISOString())],
      [],
    ];
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
      tx.tags ? tx.tags.join('; ') : '',
      tx.iva_tasa ?? '',
      tx.fiscal_subtotal ?? '',
      tx.fiscal_iva ?? '',
    ]);

    const escapeRow = (row: (string | number)[]) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');

    const csvContent = [
      ...metaRows.map((r) => (r.length === 0 ? '' : escapeRow(r))),
      escapeRow(headers),
      ...rows.map((row) => escapeRow(row)),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
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

  const addRecurringTransaction = () => {
    setSelectedRecurring(null);
    setIsRecurringModalOpen(true);
  };

  const saveManualTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const rawTags = String(formData.get('tags') || '');
    const tags = rawTags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const tipoTx = String(formData.get('tipo') || 'egreso') as 'ingreso' | 'egreso';
    const montoNum = Number(formData.get('monto'));
    const fiscalExtra = fiscalPayloadFromForm(formData, tipoTx, montoNum);

    const transactionData = {
      organization_id: 'org_main',
      usuario_id: user.uid,
      tipo: tipoTx,
      monto: montoNum,
      moneda: String(formData.get('moneda') || 'MXN'),
      concepto: String(formData.get('concepto') || ''),
      proveedor: String(formData.get('proveedor') || ''),
      fecha: new Date(String(formData.get('fecha'))).toISOString(),
      status: 'pendiente',
      account_name: String(formData.get('account_name') || ''),
      tags,
      ...fiscalExtra,
    };

    if (!transactionData.concepto || !transactionData.fecha || Number.isNaN(transactionData.monto) || transactionData.monto <= 0) {
      alert('Completa los campos obligatorios y captura un monto mayor a 0.');
      return;
    }

    if (isTransactionDateInClosedPeriod(transactionData.fecha, periodosCerrados)) {
      alert('Este periodo está cerrado. Ábrelo en la pestaña Fiscal o elige otra fecha.');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'transactions'), {
        ...transactionData,
        creado_en: serverTimestamp(),
      });

      const decision = await triggerAgent(AGENT_TYPES.CLASIFICADOR, transactionData);
      if (decision) {
        const requiresPolicyReview = transactionData.monto > HIGH_AMOUNT_REVIEW_THRESHOLD;
        const requiresHumanApproval = decision.requires_human_approval || requiresPolicyReview;
        const manualAccountName = transactionData.account_name?.trim();
        await setDoc(doc(db, 'transactions', docRef.id), {
          ...transactionData,
          status: requiresHumanApproval ? 'revisión' : 'conciliado',
          agente_ia_decision: decision.decision,
          confidence_score: decision.confidence_score,
          account_name: manualAccountName || decision.account_name,
          account_source: manualAccountName ? 'manual' : 'ai',
          policy_review_reason: requiresPolicyReview ? `Monto mayor a ${HIGH_AMOUNT_REVIEW_THRESHOLD}` : null,
          creado_en: serverTimestamp(),
        });
      }

      await logAuditEntry('CREATE_TRANSACTION', 'transactions', {
        id: docRef.id,
        tipo: transactionData.tipo,
        monto: transactionData.monto,
        proveedor: transactionData.proveedor,
      });

      setIsManualTxModalOpen(false);
      e.currentTarget.reset();
    } catch (error) {
      console.error('No se pudo crear la transacción manual:', error);
      alert('No se pudo guardar la transacción. Verifica permisos y vuelve a intentar.');
    }
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
      moneda: 'MXN',
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
    if (!user) return;
    setIsProcessing(true);
    const now = new Date();
    let processedCount = 0;

    try {
      if (isTransactionDateInClosedPeriod(now.toISOString(), periodosCerrados)) {
        alert('El periodo del mes actual está cerrado. No se generan movimientos recurrentes.');
        return;
      }
      for (const rec of recurringTransactions) {
        if (!rec.activa) continue;
        
        const nextExec = new Date(rec.proxima_ejecucion);
        if (nextExec <= now) {
          // Create transaction
          const txData = {
            organization_id: rec.organization_id,
            tipo: rec.tipo,
            monto: rec.monto,
            moneda: rec.moneda || 'MXN',
            concepto: `${rec.concepto} (Ejecución ${new Date().toLocaleDateString()})`,
            fecha: now.toISOString(),
            status: 'conciliado', // Recurring are usually pre-approved
            usuario_id: rec.usuario_id || user.uid,
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
    const monthlyTransactions = filterTransactionsByMonth(transactions, periodYear, periodMonth);
    const periodDate = new Date(periodYear, periodMonth, 1);

    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      netBalance: 0,
      categories: {} as Record<string, { income: number; expense: number }>,
      monthName: periodDate.toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      empresaNombre: empresaNombre || '',
      empresaRfc: empresaRfc || '',
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
    if (isTransactionDateInClosedPeriod(tx.fecha, periodosCerrados)) {
      alert('Este periodo está cerrado.');
      return;
    }
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

  const rejectTransaction = async (tx: any, reason: string) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert('Escribe un motivo de rechazo.');
      return;
    }

    if (isTransactionDateInClosedPeriod(tx.fecha, periodosCerrados)) {
      alert('Este periodo está cerrado.');
      return;
    }

    try {
      await setDoc(doc(db, 'transactions', tx.id), {
        ...tx,
        status: 'rechazado',
        motivo_rechazo: trimmedReason,
        rechazado_por: user?.email,
        rechazado_en: serverTimestamp(),
        actualizado_en: serverTimestamp(),
      });

      logAuditEntry('REJECT_TRANSACTION', 'transactions', {
        id: tx.id,
        concepto: tx.concepto,
        motivo: trimmedReason,
      });
      setSelectedTransaction(null);
      setRejectReason('');
    } catch (error) {
      console.error('Error rejecting transaction:', error);
    }
  };

  const updateTransactionTags = async (txId: string, newTags: string[]) => {
    try {
      const tx = transactions.find(t => t.id === txId);
      if (!tx) return;

      if (isTransactionDateInClosedPeriod(tx.fecha, periodosCerrados)) {
        alert('Este periodo está cerrado.');
        return;
      }
      
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

  const saveEditedTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedTransaction) return;

    const formData = new FormData(e.currentTarget);
    const rawTags = String(formData.get('tags') || '');
    const tags = rawTags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const tipoEd = String(formData.get('tipo') || selectedTransaction.tipo || 'egreso') as 'ingreso' | 'egreso';
    const montoEd = Number(formData.get('monto'));
    const fiscalEd = fiscalPayloadFromForm(formData, tipoEd, montoEd);

    const updatedData = {
      ...selectedTransaction,
      tipo: tipoEd,
      monto: montoEd,
      moneda: String(formData.get('moneda') || selectedTransaction.moneda || 'MXN'),
      concepto: String(formData.get('concepto') || selectedTransaction.concepto || ''),
      proveedor: String(formData.get('proveedor') || selectedTransaction.proveedor || ''),
      fecha: new Date(String(formData.get('fecha'))).toISOString(),
      account_name: String(formData.get('account_name') || ''),
      tags,
      ...fiscalEd,
      actualizado_en: serverTimestamp(),
      aprobado_por: null,
      aprobado_en: null,
    };

    if (!updatedData.concepto || !updatedData.fecha || Number.isNaN(updatedData.monto) || updatedData.monto <= 0) {
      alert('Completa los campos obligatorios y captura un monto mayor a 0.');
      return;
    }

    if (isTransactionDateInClosedPeriod(updatedData.fecha, periodosCerrados)) {
      alert('Este periodo está cerrado. No se pueden editar movimientos.');
      return;
    }

    try {
      const decision = await triggerAgent(AGENT_TYPES.CLASIFICADOR, updatedData);
      const requiresPolicyReview = updatedData.monto > HIGH_AMOUNT_REVIEW_THRESHOLD;
      const manualAccountName = updatedData.account_name?.trim();
      const finalData = decision
        ? {
            ...updatedData,
            status: (decision.requires_human_approval || requiresPolicyReview) ? 'revisión' : 'conciliado',
            agente_ia_decision: decision.decision,
            confidence_score: decision.confidence_score,
            account_name: manualAccountName || decision.account_name,
            account_source: manualAccountName ? 'manual' : 'ai',
            policy_review_reason: requiresPolicyReview ? `Monto mayor a ${HIGH_AMOUNT_REVIEW_THRESHOLD}` : null,
          }
        : updatedData;

      await setDoc(doc(db, 'transactions', selectedTransaction.id), finalData);
      setSelectedTransaction({ id: selectedTransaction.id, ...finalData });
      setIsEditTxModalOpen(false);

      await logAuditEntry('UPDATE_TRANSACTION', 'transactions', {
        id: selectedTransaction.id,
        tipo: finalData.tipo,
        monto: finalData.monto,
        proveedor: finalData.proveedor,
      });
    } catch (error) {
      console.error('No se pudo actualizar la transacción:', error);
      alert('No se pudo actualizar la transacción. Verifica permisos y vuelve a intentar.');
    }
  };

  const transactionsInPeriod = useMemo(
    () => filterTransactionsByMonth(transactions, periodYear, periodMonth),
    [transactions, periodYear, periodMonth]
  );

  const monthlyIncome = transactionsInPeriod
    .filter((tx) => tx.tipo === 'ingreso')
    .reduce((acc, tx) => acc + Number(tx.monto || 0), 0);
  const monthlyExpenses = transactionsInPeriod
    .filter((tx) => tx.tipo === 'egreso')
    .reduce((acc, tx) => acc + Number(tx.monto || 0), 0);
  const pendingCount = transactionsInPeriod.filter((tx) => tx.status === 'pendiente' || tx.status === 'revisión').length;
  const alertsCount = transactionsInPeriod.filter((tx) => tx.status === 'revisión').length;
  const classifiedTransactions = transactionsInPeriod
    .filter((tx) => tx.account_name || tx.agente_ia_decision || tx.confidence_score)
    .slice(0, 3);

  const riskRankings = useMemo(
    () => computeRiskRankings(transactionsInPeriod, HIGH_AMOUNT_REVIEW_THRESHOLD),
    [transactionsInPeriod]
  );

  const filteredRiskRows = useMemo(() => {
    if (riskSeverityFilter === 'all') return riskRankings;
    return riskRankings.filter((r) => r.severity === riskSeverityFilter);
  }, [riskRankings, riskSeverityFilter]);

  const periodContextPack = useMemo(
    () =>
      buildMonthlyContextPack(
        transactionsInPeriod,
        periodYear,
        periodMonth,
        empresaNombre,
        empresaRfc,
        transactions
      ),
    [transactionsInPeriod, periodYear, periodMonth, empresaNombre, empresaRfc, transactions]
  );

  const ivaBreakdown = useMemo(
    () => computeMonthlyIva(transactionsInPeriod, periodYear, periodMonth),
    [transactionsInPeriod, periodYear, periodMonth]
  );

  const isrYtdSummary = useMemo(() => {
    const ytd = filterTransactionsYtdThroughMonth(transactions, periodYear, periodMonth);
    return computeIsrProvisionalSummary(ytd, periodMonth);
  }, [transactions, periodYear, periodMonth]);

  const periodoActualCerrado = useMemo(
    () => isPeriodClosed(periodosCerrados, periodYear, periodMonth),
    [periodosCerrados, periodYear, periodMonth]
  );

  const stockByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const mov of inventoryMovements) {
      const q = Number(mov.cantidad) || 0;
      let delta = q;
      if (mov.tipo === 'entrada') delta = Math.abs(q);
      else if (mov.tipo === 'salida') delta = -Math.abs(q);
      else if (mov.tipo === 'ajuste') delta = q;
      const pid = String(mov.product_id);
      m[pid] = (m[pid] || 0) + delta;
    }
    return m;
  }, [inventoryMovements]);

  const runExecutiveBriefing = async () => {
    if (transactionsInPeriod.length === 0) {
      alert('No hay transacciones en el periodo seleccionado.');
      return;
    }
    setExecutiveLoading(true);
    setExecutiveDraftText('');
    setIsExecutiveModalOpen(true);
    try {
      const text = await generateExecutiveBriefing(periodContextPack);
      setExecutiveDraftText(text);
      await logAuditEntry('EXECUTIVE_BRIEFING', 'ai_insights', { periodo: periodContextPack.periodo });
    } catch (e) {
      console.error(e);
      setExecutiveDraftText(
        `No se pudo generar el borrador. ${e instanceof Error ? e.message : 'Error desconocido'}`
      );
    } finally {
      setExecutiveLoading(false);
    }
  };

  const sendChatQuestion = async () => {
    const q = chatInput.trim();
    if (!q || transactionsInPeriod.length === 0) {
      if (transactionsInPeriod.length === 0) alert('No hay datos del periodo para consultar.');
      return;
    }
    setChatLoading(true);
    setChatMessages((prev) => [...prev, { role: 'user', text: q }]);
    setChatInput('');
    try {
      const answer = await askMonthQuestion(q, periodContextPack);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
      await logAuditEntry('NL_MONTH_QUESTION', 'ai_insights', { q: q.slice(0, 200) });
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${e instanceof Error ? e.message : 'No disponible'}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleBankFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseBankCsv(text);
      setBankCsvPreview(parsed);
      if (parsed.rows.length > 0) {
        const hints = suggestBankMatches(parsed.rows, transactionsInPeriod);
        setBankMatchHints(hints);
      } else {
        setBankMatchHints([]);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  useEffect(() => {
    if (!bankCsvPreview?.rows?.length) return;
    setBankMatchHints(suggestBankMatches(bankCsvPreview.rows, transactionsInPeriod));
  }, [transactionsInPeriod, bankCsvPreview]);

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

        {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (empresaNombre || empresaRfc) && (
          <div className="px-4 pb-2 -mt-2">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
              {empresaNombre ? (
                <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">{empresaNombre}</p>
              ) : null}
              {empresaRfc ? (
                <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mt-1">RFC {empresaRfc}</p>
              ) : null}
            </div>
          </div>
        )}

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Panel General' },
            { id: 'transactions', icon: Receipt, label: 'Transacciones' },
            { id: 'analysis', icon: Activity, label: 'Análisis' },
            { id: 'fiscal', icon: Percent, label: 'Fiscal' },
            { id: 'inventory', icon: Package, label: 'Inventario' },
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
        <header className="min-h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2 px-4 lg:px-8 py-2 sticky top-0 z-10">
          <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-shrink">
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
              {activeTab === 'analysis' && 'Análisis'}
              {activeTab === 'fiscal' && 'Administración fiscal'}
              {activeTab === 'inventory' && 'Inventario'}
              {activeTab === 'recurring' && 'Transacciones Recurrentes'}
              {activeTab === 'audit' && 'Bitácora'}
              {activeTab === 'settings' && 'Configuración'}
            </h2>
          </div>

          {(empresaNombre || empresaRfc) && (
            <div className="flex-1 min-w-0 hidden md:flex flex-col items-center justify-center px-2 text-center">
              {empresaNombre ? (
                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate max-w-md lg:max-w-lg">{empresaNombre}</p>
              ) : null}
              {empresaRfc ? (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">RFC {empresaRfc}</p>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
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

        {(empresaNombre || empresaRfc) && (
          <div className="md:hidden px-4 py-2 bg-indigo-50/80 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40 text-center">
            {empresaNombre ? (
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{empresaNombre}</p>
            ) : null}
            {empresaRfc ? (
              <p className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">RFC {empresaRfc}</p>
            ) : null}
          </div>
        )}

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
                <Card className="p-4 flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Periodo para métricas</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Panel y reportes usan este mes/año.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Año</label>
                      <select
                        value={periodYear}
                        onChange={(e) => setPeriodYear(Number(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Array.from({ length: 6 }, (_, i) => nowInit.getFullYear() - i).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mes</label>
                      <select
                        value={periodMonth}
                        onChange={(e) => setPeriodMonth(Number(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-w-[160px]"
                      >
                        {Array.from({ length: 12 }, (_, m) => (
                          <option key={m} value={m}>
                            {new Date(2000, m, 1).toLocaleString('es-MX', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="secondary"
                      type="button"
                      className="text-sm"
                      onClick={() => {
                        const t = new Date();
                        setPeriodYear(t.getFullYear());
                        setPeriodMonth(t.getMonth());
                      }}
                    >
                      Mes actual
                    </Button>
                  </div>
                </Card>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                  {[
                    { label: 'Ingresos (periodo)', value: formatCurrency(monthlyIncome), trend: `${transactionsInPeriod.filter((tx) => tx.tipo === 'ingreso').length} tx`, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                    { label: 'Egresos (periodo)', value: formatCurrency(monthlyExpenses), trend: `${transactionsInPeriod.filter((tx) => tx.tipo === 'egreso').length} tx`, icon: Receipt, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'Pendientes', value: String(pendingCount), trend: pendingCount > 0 ? 'Atención' : 'OK', icon: Clock, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                    { label: 'Alertas', value: String(alertsCount), trend: alertsCount > 0 ? 'Crítico' : 'Sin alertas', icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4 border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex items-center gap-2 mb-2">
                      <Percent className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">IVA del periodo (informativo)</h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Trasladado {formatCurrency(ivaBreakdown.ivaTrasladadoTotal)} · Acreditable {formatCurrency(ivaBreakdown.ivaAcreditableTotal)}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      Saldo neto IVA: {formatCurrency(ivaBreakdown.saldoNetoIva)}
                    </p>
                    {ivaBreakdown.lineasSinDesglose > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1">{ivaBreakdown.lineasSinDesglose} movimientos sin tasa IVA</p>
                    )}
                  </Card>
                  <Card className="p-4 border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex items-center gap-2 mb-2">
                      <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">ISR estimado (YTD, aprox.)</h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{isrYtdSummary.nota}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      Base {formatCurrency(isrYtdSummary.baseGravable)} → ISR ~{formatCurrency(isrYtdSummary.isrEstimadoAnual.isr)}
                    </p>
                  </Card>
                </div>

                {/* IA Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                  <Card className="lg:col-span-2 p-4 lg:p-6">
                    <div className="flex items-center justify-between mb-4 lg:mb-6">
                      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm lg:text-base">
                        <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Actividad reciente de IA
                      </h3>
                      <Badge variant={classifiedTransactions.length > 0 ? 'success' : 'default'}>
                        {classifiedTransactions.length > 0 ? 'Activa' : 'Sin actividad'}
                      </Badge>
                    </div>
                    <div className="space-y-3 lg:space-y-4">
                      {classifiedTransactions.length === 0 && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm text-gray-500 dark:text-gray-400">
                          Aun no hay transacciones clasificadas.
                        </div>
                      )}
                      {classifiedTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 lg:p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                          <div className="flex items-center gap-3 lg:gap-4">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                            <div>
                              <p className="text-sm lg:font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">{tx.proveedor || tx.concepto}</p>
                              <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{tx.account_name || 'Sin cuenta'} • {tx.status}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs lg:text-sm font-bold text-gray-900 dark:text-white">{tx.confidence_score ? `${(tx.confidence_score * 100).toFixed(1)}%` : 'N/A'}</p>
                            <p className="text-[8px] lg:text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Confianza</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4 lg:p-6">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm lg:text-base">Operación en campo</h3>
                    <div className="space-y-2 lg:space-y-3">
                      <Button className="w-full justify-start text-sm" onClick={() => setIsManualTxModalOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Capturar Transacción
                      </Button>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
                        Simulación desactivada. Usa "Capturar Transacción" para registrar operaciones reales.
                      </div>
                      <Button variant="secondary" className="w-full justify-start text-sm" onClick={generateMonthlyReport}>
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
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setExcelImportMessage(null);
                        setIsExcelImportOpen(true);
                      }}
                      className="flex-1 sm:flex-none"
                      type="button"
                    >
                      <Upload className="w-4 h-4" />
                      Importar Excel
                    </Button>
                    <Button onClick={() => setIsManualTxModalOpen(true)} className="flex-1 sm:flex-none">
                      <Plus className="w-4 h-4" />
                      Capturar
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
                      <option value="rechazado">Rechazado</option>
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
                                tx.status === 'revisión' ? 'warning' :
                                tx.status === 'rechazado' ? 'error' : 'default'
                              }>
                                {tx.status === 'conciliado' ? 'Conciliado' : 
                                 tx.status === 'revisión' ? 'En Revisión' :
                                 tx.status === 'rechazado' ? 'Rechazado' : 'Pendiente'}
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

            {activeTab === 'analysis' && (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card className="p-4 flex flex-col lg:flex-row lg:items-end gap-4 flex-wrap">
                  <div className="flex-1 space-y-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Periodo de análisis</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Mismo periodo que el Panel General. Anomalías, IA y conciliación usan estas fechas.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Año</label>
                      <select
                        value={periodYear}
                        onChange={(e) => setPeriodYear(Number(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Array.from({ length: 6 }, (_, i) => nowInit.getFullYear() - i).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mes</label>
                      <select
                        value={periodMonth}
                        onChange={(e) => setPeriodMonth(Number(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm min-w-[160px] focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Array.from({ length: 12 }, (_, m) => (
                          <option key={m} value={m}>
                            {new Date(2000, m, 1).toLocaleString('es-MX', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Card className="p-4 lg:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h3 className="font-bold text-gray-900 dark:text-white">Anomalías y riesgo</h3>
                      </div>
                      <select
                        value={riskSeverityFilter}
                        onChange={(e) => setRiskSeverityFilter(e.target.value)}
                        className="bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="all">Todas</option>
                        <option value="critical">Crítico</option>
                        <option value="high">Alto</option>
                        <option value="medium">Medio</option>
                        <option value="low">Bajo</option>
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Reglas deterministas (montos altos, duplicados, percentil por cuenta, etc.). Ordenadas por puntaje.
                    </p>
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/90 z-[1]">
                          <tr>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">#</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Riesgo</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Monto</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Detalle</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {filteredRiskRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-8 text-center text-gray-500 text-sm">
                                No hay transacciones en este periodo o ninguna coincide con el filtro.
                              </td>
                            </tr>
                          ) : (
                            filteredRiskRows.slice(0, 80).map((row, idx) => {
                              const tx = row.transaction as any;
                              return (
                                <tr key={row.transactionId} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                  <td className="px-3 py-2">
                                    <span className="font-bold text-gray-900 dark:text-white">{row.score}</span>
                                    <Badge
                                      variant={
                                        row.severity === 'critical'
                                          ? 'error'
                                          : row.severity === 'high'
                                            ? 'warning'
                                            : row.severity === 'medium'
                                              ? 'info'
                                              : 'default'
                                      }
                                      className="ml-2 capitalize"
                                    >
                                      {row.severity}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                                    {formatCurrency(Number(tx.monto) || 0)}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 max-w-[220px]">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">{tx.proveedor || '—'}</p>
                                    <p className="truncate">{tx.concepto}</p>
                                    <ul className="mt-1 space-y-0.5 list-disc list-inside text-[10px]">
                                      {row.reasons.slice(0, 3).map((reason, i) => (
                                        <li key={i}>{reason}</li>
                                      ))}
                                    </ul>
                                  </td>
                                  <td className="px-3 py-2">
                                    <Button
                                      variant="ghost"
                                      className="text-xs py-1 px-2"
                                      onClick={() => setSelectedTransaction(tx)}
                                    >
                                      Ver
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <div className="space-y-6">
                    <Card className="p-4 lg:p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-gray-900 dark:text-white">Conciliación asistida (v1)</h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        CSV con columnas: <span className="font-mono">fecha, monto, descripción</span> (coma o punto y coma). Se sugieren coincidencias con el libro del periodo; no se guarda el banco aún.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-indigo-600 dark:text-indigo-400">
                        <input
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={(e) => {
                            handleBankFile(e.target.files?.[0] || null);
                            e.target.value = '';
                          }}
                        />
                        <span className="underline">Seleccionar archivo CSV</span>
                      </label>
                      {bankCsvPreview && (
                        <div className="mt-4 space-y-2">
                          {bankCsvPreview.errors.length > 0 && (
                            <p className="text-xs text-amber-600">{bankCsvPreview.errors.slice(0, 3).join(' · ')}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            {bankCsvPreview.rows.length} movimientos bancarios ·{' '}
                            {bankMatchHints.filter((h) => h.transactionId).length} posibles coincidencias
                          </p>
                          <div className="max-h-40 overflow-y-auto text-[10px] font-mono bg-gray-50 dark:bg-gray-800/50 rounded p-2 border border-gray-100 dark:border-gray-800">
                            {bankCsvPreview.rows.slice(0, 8).map((r, i) => (
                              <div key={i} className="truncate border-b border-gray-100 dark:border-gray-800 py-1">
                                {formatDate(r.fecha)} · {formatCurrency(r.monto)} · {r.descripcion.slice(0, 60)}
                                {bankMatchHints[i]?.transactionId ? (
                                  <span className="text-emerald-600 ml-1">→ match</span>
                                ) : (
                                  <span className="text-gray-400 ml-1">sin match</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>

                    <Card className="p-4 lg:p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-gray-900 dark:text-white">Borrador ejecutivo del mes</h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Genera un texto para dirección usando solo datos del periodo (requiere GROQ_API_KEY).
                      </p>
                      <Button className="w-full" onClick={runExecutiveBriefing} disabled={executiveLoading || transactionsInPeriod.length === 0}>
                        {executiveLoading ? 'Generando…' : 'Generar borrador'}
                      </Button>
                    </Card>

                    <Card className="p-4 lg:p-6 flex flex-col min-h-[280px]">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-gray-900 dark:text-white">Preguntas sobre el periodo</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-48 text-sm">
                        {chatMessages.length === 0 ? (
                          <p className="text-xs text-gray-500">Ej.: ¿Cuánto suman los egresos en Viáticos? ¿Qué proveedor concentró más gasto?</p>
                        ) : (
                          chatMessages.map((m, i) => (
                            <div
                              key={i}
                              className={cn(
                                'rounded-lg px-3 py-2 text-xs',
                                m.role === 'user'
                                  ? 'bg-indigo-50 dark:bg-indigo-900/20 text-gray-900 dark:text-white ml-4'
                                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 mr-4'
                              )}
                            >
                              {m.text}
                            </div>
                          ))
                        )}
                        {chatLoading && <p className="text-xs text-gray-400">Pensando…</p>}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendChatQuestion())}
                          placeholder="Escribe tu pregunta…"
                          className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <Button type="button" onClick={sendChatQuestion} disabled={chatLoading || !chatInput.trim()}>
                          Enviar
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'fiscal' && (
              <motion.div
                key="fiscal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6 max-w-4xl"
              >
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Usa el mismo periodo que el panel general. Los importes son internos y no sustituyen declaraciones ante el SAT.
                </p>
                <Card className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Cierre de mes</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Periodo {periodKey(periodYear, periodMonth)}:{' '}
                      {periodoActualCerrado ? (
                        <span className="text-amber-600 font-medium">cerrado — no se editan movimientos</span>
                      ) : (
                        <span className="text-emerald-600 font-medium">abierto</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant={periodoActualCerrado ? 'secondary' : 'danger'}
                    type="button"
                    onClick={togglePeriodoCerrado}
                  >
                    {periodoActualCerrado ? 'Abrir periodo' : 'Cerrar periodo'}
                  </Button>
                </Card>
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        Importar CFDI (XML)
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Archivo XML del comprobante. No valida timbrado; crea una transacción con datos del XML.
                      </p>
                    </div>
                    <Button variant="secondary" type="button" onClick={() => setIsCfdiImportOpen(true)}>
                      Importar XML
                    </Button>
                  </div>
                </Card>
                <Card className="p-6">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Percent className="w-5 h-5 text-indigo-600" />
                    IVA del mes
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">IVA trasladado (ingresos)</p>
                      <p className="text-xl font-bold text-emerald-600">{formatCurrency(ivaBreakdown.ivaTrasladadoTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">IVA acreditable (egresos)</p>
                      <p className="text-xl font-bold text-amber-600">{formatCurrency(ivaBreakdown.ivaAcreditableTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Saldo neto del periodo</p>
                      <p className="text-xl font-bold text-indigo-600">{formatCurrency(ivaBreakdown.saldoNetoIva)}</p>
                    </div>
                  </div>
                  {Object.keys(ivaBreakdown.porTasaIngreso).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs font-bold text-gray-500 mb-2">Por tasa (ingresos)</p>
                      <ul className="text-xs space-y-1 font-mono">
                        {Object.entries(ivaBreakdown.porTasaIngreso).map(([k, v]) => (
                          <li key={k}>
                            {k}: base {formatCurrency(v.subtotal)} · IVA {formatCurrency(v.iva)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ivaBreakdown.lineasSinDesglose > 0 && (
                    <p className="text-xs text-amber-600 mt-3">
                      {ivaBreakdown.lineasSinDesglose} movimiento(s) con tasa &quot;N/A&quot; — no entran en el cuadre IVA.
                    </p>
                  )}
                </Card>
                <Card className="p-6">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-600" />
                    ISR (estimación anual sobre acumulado YTD)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-gray-500">Ingresos acumulables (subtotal):</span>{' '}
                      <strong>{formatCurrency(isrYtdSummary.ingresosAcumulables)}</strong>
                    </p>
                    <p>
                      <span className="text-gray-500">Deducciones (egresos deducibles, subtotal):</span>{' '}
                      <strong>{formatCurrency(isrYtdSummary.deduccionesAcumuladas)}</strong>
                    </p>
                    <p>
                      <span className="text-gray-500">Base gravable:</span>{' '}
                      <strong>{formatCurrency(isrYtdSummary.baseGravable)}</strong>
                    </p>
                    <p>
                      <span className="text-gray-500">ISR estimado (tarifa anual art. 152 simplificada):</span>{' '}
                      <strong className="text-lg text-indigo-600">{formatCurrency(isrYtdSummary.isrEstimadoAnual.isr)}</strong>
                    </p>
                    <p className="text-xs text-gray-500 mt-3">{isrYtdSummary.isrEstimadoAnual.detalle}</p>
                    <p className="text-xs text-gray-500">
                      Factor tarifa: ({isrYtdSummary.mesAplicado + 1}/12) sobre tablas anuales 2024.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">{isrYtdSummary.nota}</p>
                  </div>
                </Card>
                <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40">
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    <strong>Integración IA:</strong> el borrador ejecutivo y el chat del mes incluyen el bloque <code className="text-[10px]">fiscal</code> en el JSON cuando hay datos.
                  </p>
                </Card>
              </motion.div>
            )}

            {activeTab === 'inventory' && (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6 max-w-4xl"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4">Nuevo producto</h3>
                    <form onSubmit={saveProduct} className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Código</label>
                        <input name="codigo" required className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Descripción</label>
                        <input name="descripcion" required className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Unidad</label>
                        <input name="unidad" placeholder="PZA, KG…" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <Button type="submit" className="w-full">
                        Guardar producto
                      </Button>
                    </form>
                  </Card>
                  <Card className="p-6">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4">Movimiento de inventario</h3>
                    <form onSubmit={saveInventoryMovement} className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Producto</label>
                        <select name="product_id" required className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm">
                          <option value="">— Seleccionar —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.codigo} — {p.descripcion}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Tipo</label>
                          <select name="tipo_mov" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm">
                            <option value="entrada">Entrada</option>
                            <option value="salida">Salida</option>
                            <option value="ajuste">Ajuste (+/−)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Cantidad</label>
                          <input name="cantidad" type="number" step="any" required className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Fecha</label>
                        <input
                          name="fecha_mov"
                          type="date"
                          required
                          defaultValue={new Date().toISOString().split('T')[0]}
                          className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Costo unitario (opcional)</label>
                        <input name="costo_unitario" type="number" step="0.01" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Nota</label>
                        <input name="nota_mov" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <Button type="submit" className="w-full" disabled={products.length === 0}>
                        Registrar movimiento
                      </Button>
                    </form>
                  </Card>
                </div>
                <Card className="p-0 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-gray-900 dark:text-white">Existencias por producto</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Código</th>
                          <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Descripción</th>
                          <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase text-right">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {products.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                              No hay productos. Crea uno arriba.
                            </td>
                          </tr>
                        ) : (
                          products.map((p) => (
                            <tr key={p.id}>
                              <td className="px-6 py-3 font-mono text-xs">{p.codigo}</td>
                              <td className="px-6 py-3">{p.descripcion}</td>
                              <td className="px-6 py-3 text-right font-bold">
                                {(stockByProduct[p.id] ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 4 })}
                              </td>
                            </tr>
                          ))
                        )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la empresa</label>
                        <input
                          type="text"
                          value={draftEmpresaNombre}
                          onChange={(e) => setDraftEmpresaNombre(e.target.value)}
                          placeholder="Ej. Mi Empresa SA de CV"
                          className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">RFC</label>
                        <input
                          type="text"
                          value={draftEmpresaRfc}
                          onChange={(e) => setDraftEmpresaRfc(e.target.value.toUpperCase())}
                          placeholder="Ej. ABC010101XYZ"
                          maxLength={13}
                          className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Catálogo de cuentas contables</label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Una cuenta por línea. Estas opciones aparecen al capturar o editar transacciones. Se guarda en tu perfil de Firebase.
                      </p>
                      <textarea
                        value={settingsCatalogDraft}
                        onChange={(e) => {
                          settingsCatalogDirtyRef.current = true;
                          setSettingsCatalogDraft(e.target.value);
                        }}
                        rows={12}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-y min-h-[200px]"
                        spellCheck={false}
                      />
                    </div>

                    <Button className="w-full" onClick={saveSettingsProfile} disabled={isSavingSettings}>
                      {isSavingSettings ? 'Guardando…' : 'Guardar configuración'}
                    </Button>
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
                    {(monthlyReport.empresaNombre || monthlyReport.empresaRfc) && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                        {monthlyReport.empresaNombre ? (
                          <p className="font-medium text-gray-800 dark:text-gray-200">{monthlyReport.empresaNombre}</p>
                        ) : null}
                        {monthlyReport.empresaRfc ? (
                          <p>RFC: <span className="font-mono">{monthlyReport.empresaRfc}</span></p>
                        ) : null}
                      </div>
                    )}
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
        {isManualTxModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManualTxModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Nueva Transacción</h3>
                <button onClick={() => setIsManualTxModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={saveManualTransaction} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha</label>
                    <input
                      name="fecha"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                    <select
                      name="tipo"
                      defaultValue="egreso"
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Monto</label>
                    <input
                      name="monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Moneda</label>
                    <select
                      name="moneda"
                      defaultValue="MXN"
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Proveedor</label>
                  <input
                    name="proveedor"
                    placeholder="Ej. Amazon Business"
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Concepto</label>
                  <input
                    name="concepto"
                    required
                    placeholder="Ej. Compra de insumos"
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cuenta contable (opcional)</label>
                  <select
                    name="account_name"
                    defaultValue=""
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Clasificación automática por IA</option>
                    {accountCatalog.map((account) => (
                      <option key={account} value={account}>{account}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-3">
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 uppercase tracking-wider">Datos fiscales (v1)</p>
                  <p className="text-[10px] text-gray-500">El monto capturado se interpreta como total (incluye IVA si aplica). Sin timbrado.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Tasa IVA</label>
                      <select name="iva_tasa" defaultValue="na" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm">
                        <option value="na">Sin desglose</option>
                        <option value="exento">Exento</option>
                        <option value="0">0%</option>
                        <option value="8">8%</option>
                        <option value="16">16%</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Método pago (SAT)</label>
                      <select name="metodo_pago_sat" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm">
                        <option value="">—</option>
                        <option value="PUE">PUE</option>
                        <option value="PPD">PPD</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Forma pago (clave)</label>
                      <input name="forma_pago_sat" placeholder="01, 03…" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">CP expedición</label>
                      <input name="cp_expedicion" placeholder="Código postal" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">RFC contraparte</label>
                      <input name="rfc_contraparte" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Uso CFDI</label>
                      <input name="uso_cfdi" placeholder="G03…" className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input type="checkbox" name="egreso_acredita_iva" value="true" defaultChecked className="rounded" />
                      Egreso: IVA acreditable
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input type="checkbox" name="deducible" value="true" defaultChecked className="rounded" />
                      Egreso deducible (ISR)
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Etiquetas (separadas por coma)</label>
                  <input
                    name="tags"
                    placeholder="Ej. Deducible, Oficina"
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => setIsManualTxModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isProcessing}>
                    Guardar
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

                {(selectedTransaction.iva_tasa || selectedTransaction.fiscal_subtotal != null) && (
                  <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                    <p className="text-[10px] font-bold text-indigo-800 dark:text-indigo-200 uppercase tracking-wider">Fiscal (v1)</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <p>
                        <span className="text-gray-500">Tasa IVA:</span> {selectedTransaction.iva_tasa || '—'}
                      </p>
                      <p>
                        <span className="text-gray-500">Subtotal:</span> {formatCurrency(Number(selectedTransaction.fiscal_subtotal) || 0)}
                      </p>
                      <p>
                        <span className="text-gray-500">IVA:</span> {formatCurrency(Number(selectedTransaction.fiscal_iva) || 0)}
                      </p>
                      <p>
                        <span className="text-gray-500">Acredita IVA:</span>{' '}
                        {selectedTransaction.tipo === 'egreso' ? (selectedTransaction.egreso_acredita_iva !== false ? 'Sí' : 'No') : '—'}
                      </p>
                    </div>
                  </div>
                )}

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
                        selectedTransaction.status === 'revisión' ? 'warning' :
                        selectedTransaction.status === 'rechazado' ? 'error' : 'default'
                      }>
                        {selectedTransaction.status === 'conciliado' ? 'Conciliado Automáticamente' : 
                         selectedTransaction.status === 'revisión' ? 'Requiere Revisión' :
                         selectedTransaction.status === 'rechazado' ? 'Rechazada por usuario' : 'Pendiente de Procesar'}
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
                    {selectedTransaction.status === 'rechazado' && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-red-700 dark:text-red-300">Motivo de rechazo</p>
                          <p className="text-xs text-red-600 dark:text-red-200">
                            {selectedTransaction.motivo_rechazo || 'Sin motivo registrado'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Approval & Conciliation Info */}
                {(selectedTransaction.status === 'conciliado' || selectedTransaction.status === 'revisión' || selectedTransaction.status === 'rechazado') && (
                  <div className={cn(
                    "p-4 rounded-xl border space-y-4",
                    selectedTransaction.status === 'conciliado' 
                      ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100/50 dark:border-emerald-900/20" 
                      : selectedTransaction.status === 'revisión'
                        ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-100/50 dark:border-amber-900/20"
                        : "bg-red-50/50 dark:bg-red-900/10 border-red-100/50 dark:border-red-900/20"
                  )}>
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <ShieldCheck className={cn("w-4 h-4",
                        selectedTransaction.status === 'conciliado'
                          ? "text-emerald-600"
                          : selectedTransaction.status === 'revisión'
                            ? "text-amber-600"
                            : "text-red-600"
                      )} />
                      <span className="text-xs font-bold uppercase tracking-wider">Registro de Validación</span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado de Conciliación</p>
                        <Badge variant={selectedTransaction.status === 'conciliado' ? 'success' : selectedTransaction.status === 'revisión' ? 'warning' : 'error'}>
                          {selectedTransaction.status === 'conciliado' ? 'Conciliado' : selectedTransaction.status === 'revisión' ? 'Pendiente de Aprobación' : 'Rechazado'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Usuario Validador</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {selectedTransaction.status === 'rechazado'
                            ? (selectedTransaction.rechazado_por || 'Pendiente')
                            : (selectedTransaction.aprobado_por || (selectedTransaction.status === 'conciliado' ? 'Sistema (IA)' : 'Pendiente'))}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha de Aprobación</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {selectedTransaction.status === 'rechazado'
                            ? (selectedTransaction.rechazado_en
                              ? formatDate(selectedTransaction.rechazado_en?.toDate?.() || selectedTransaction.rechazado_en)
                              : 'Pendiente')
                            : (selectedTransaction.aprobado_en
                              ? formatDate(selectedTransaction.aprobado_en?.toDate?.() || selectedTransaction.aprobado_en)
                              : (selectedTransaction.status === 'conciliado' ? 'Automática' : 'Pendiente'))}
                        </p>
                      </div>

                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha de Conciliación</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {selectedTransaction.status === 'conciliado' 
                            ? formatDate(selectedTransaction.aprobado_en?.toDate?.() || selectedTransaction.aprobado_en || selectedTransaction.creado_en?.toDate?.() || selectedTransaction.creado_en)
                            : selectedTransaction.status === 'rechazado'
                              ? formatDate(selectedTransaction.rechazado_en?.toDate?.() || selectedTransaction.rechazado_en || selectedTransaction.actualizado_en?.toDate?.() || selectedTransaction.actualizado_en || selectedTransaction.creado_en?.toDate?.() || selectedTransaction.creado_en)
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
                <Button variant="secondary" className="flex-1" onClick={() => setIsEditTxModalOpen(true)}>
                  <Edit2 className="w-4 h-4" />
                  Editar
                </Button>
                {selectedTransaction.status === 'revisión' && (
                  <Button variant="danger" className="flex-1" onClick={() => setIsRejectModalOpen(true)}>
                    Rechazar
                  </Button>
                )}
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

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {isEditTxModalOpen && selectedTransaction && (
          <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditTxModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Editar Transacción</h3>
                <button onClick={() => setIsEditTxModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={saveEditedTransaction} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha</label>
                    <input
                      name="fecha"
                      type="date"
                      required
                      defaultValue={selectedTransaction.fecha?.split?.('T')[0] || new Date(selectedTransaction.fecha).toISOString().split('T')[0]}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                    <select
                      name="tipo"
                      defaultValue={selectedTransaction.tipo || 'egreso'}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Monto</label>
                    <input
                      name="monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      defaultValue={selectedTransaction.monto}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Moneda</label>
                    <select
                      name="moneda"
                      defaultValue={selectedTransaction.moneda || 'MXN'}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Proveedor</label>
                  <input
                    name="proveedor"
                    defaultValue={selectedTransaction.proveedor || ''}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Concepto</label>
                  <input
                    name="concepto"
                    required
                    defaultValue={selectedTransaction.concepto || ''}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cuenta contable</label>
                  <select
                    name="account_name"
                    defaultValue={selectedTransaction.account_name || ''}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Clasificación automática por IA</option>
                    {(() => {
                      const cur = String(selectedTransaction.account_name || '').trim();
                      const opts = [...accountCatalog];
                      if (cur && !opts.includes(cur)) opts.unshift(cur);
                      return opts.map((account) => (
                        <option key={account} value={account}>{account}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-3">
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 uppercase tracking-wider">Datos fiscales (v1)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Tasa IVA</label>
                      <select
                        name="iva_tasa"
                        defaultValue={selectedTransaction.iva_tasa || 'na'}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="na">Sin desglose</option>
                        <option value="exento">Exento</option>
                        <option value="0">0%</option>
                        <option value="8">8%</option>
                        <option value="16">16%</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Método pago</label>
                      <select
                        name="metodo_pago_sat"
                        defaultValue={selectedTransaction.metodo_pago_sat || ''}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        <option value="PUE">PUE</option>
                        <option value="PPD">PPD</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Forma pago</label>
                      <input
                        name="forma_pago_sat"
                        defaultValue={selectedTransaction.forma_pago_sat || ''}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">CP expedición</label>
                      <input
                        name="cp_expedicion"
                        defaultValue={selectedTransaction.cp_expedicion || ''}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">RFC contraparte</label>
                      <input
                        name="rfc_contraparte"
                        defaultValue={selectedTransaction.rfc_contraparte || ''}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Uso CFDI</label>
                      <input
                        name="uso_cfdi"
                        defaultValue={selectedTransaction.uso_cfdi || ''}
                        className="w-full bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        name="egreso_acredita_iva"
                        value="true"
                        defaultChecked={selectedTransaction.egreso_acredita_iva !== false}
                        className="rounded"
                      />
                      Egreso: IVA acreditable
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        name="deducible"
                        value="true"
                        defaultChecked={selectedTransaction.deducible !== false}
                        className="rounded"
                      />
                      Egreso deducible (ISR)
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Etiquetas (separadas por coma)</label>
                  <input
                    name="tags"
                    defaultValue={(selectedTransaction.tags || []).join(', ')}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => setIsEditTxModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isProcessing}>
                    Guardar Cambios
                  </Button>
                </div>
              </form>
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

      {/* Reject Modal */}
      <AnimatePresence>
        {isRejectModalOpen && selectedTransaction && (
          <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRejectModalOpen(false)}
              className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Rechazar transacción</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Escribe el motivo para dejar trazabilidad de la decisión.
                </p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Ej. Monto incorrecto, documento incompleto..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    setRejectReason('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    rejectTransaction(selectedTransaction, rejectReason);
                    setIsRejectModalOpen(false);
                  }}
                >
                  Confirmar rechazo
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Importar CFDI */}
      <AnimatePresence>
        {isCfdiImportOpen && (
          <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cfdiImporting && !cfdiXsdValidating && setIsCfdiImportOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Importar CFDI</h3>
                <button
                  type="button"
                  onClick={() => !cfdiImporting && !cfdiXsdValidating && setIsCfdiImportOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <label className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">Archivo XML</span>
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    disabled={cfdiImporting || cfdiXsdValidating}
                    onChange={(e) => handleCfdiFile(e.target.files?.[0] || null)}
                    className="text-xs"
                  />
                </label>
                {cfdiXsdValidating && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Validando XML contra XSD…</p>
                )}
                {cfdiImportError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{cfdiImportError}</p>
                )}
                {cfdiPreview && cfdiXsdMode && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Validación XSD: {cfdiXsdMode}
                  </p>
                )}
                {cfdiPreview && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1 font-mono bg-gray-50 dark:bg-gray-800/50">
                    <p>
                      <span className="text-gray-500">Tipo:</span> {cfdiPreview.tipoComprobante} · Total{' '}
                      {formatCurrency(cfdiPreview.total)}
                    </p>
                    <p>
                      <span className="text-gray-500">Fecha:</span> {cfdiPreview.fecha}
                    </p>
                    <p>
                      <span className="text-gray-500">UUID:</span> {cfdiPreview.uuid || '—'}
                    </p>
                    <p>
                      <span className="text-gray-500">Emisor:</span> {cfdiPreview.emisorNombre} ({cfdiPreview.emisorRfc})
                    </p>
                    <p>
                      <span className="text-gray-500">Receptor:</span> {cfdiPreview.receptorNombre} ({cfdiPreview.receptorRfc})
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    type="button"
                    disabled={cfdiImporting || cfdiXsdValidating}
                    onClick={() => {
                      setIsCfdiImportOpen(false);
                      setCfdiPreview(null);
                      setCfdiImportError(null);
                      setCfdiXsdMode(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    type="button"
                    disabled={!cfdiPreview || cfdiImporting || cfdiXsdValidating}
                    onClick={() => importCfdiAsTransaction()}
                  >
                    {cfdiImporting ? 'Guardando…' : 'Registrar transacción'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Importar Excel (plantillas tipo data/) */}
      <AnimatePresence>
        {isExcelImportOpen && (
          <div className="fixed inset-0 z-[77] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !excelImporting && setIsExcelImportOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Importar Excel</h3>
                <button
                  type="button"
                  onClick={() => !excelImporting && setIsExcelImportOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p className="text-xs leading-relaxed">
                  Selecciona uno o varios .xlsx (como en <code className="text-indigo-600 dark:text-indigo-400">data/</code>
                  ): archivo tipo <strong>CARLOS</strong> (hojas ING y EGR), <strong>control inventarios</strong> (stock
                  menudeo) y <strong>Utilidad de ventas</strong> (Hoja1). Se crearán transacciones conciliadas y
                  productos; las fechas en periodos cerrados se omiten.
                </p>
                <label className="flex flex-col gap-2">
                  <span className="font-medium">Archivos .xlsx</span>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    multiple
                    disabled={excelImporting}
                    onChange={(e) => {
                      void runExcelImport(e.target.files);
                      e.target.value = '';
                    }}
                    className="text-xs"
                  />
                </label>
                {excelImporting && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Importando…</p>
                )}
                {excelImportMessage && (
                  <pre className="text-xs whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-800/80 p-3 text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
                    {excelImportMessage}
                  </pre>
                )}
                <Button
                  variant="secondary"
                  className="w-full"
                  type="button"
                  disabled={excelImporting}
                  onClick={() => setIsExcelImportOpen(false)}
                >
                  Cerrar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Borrador ejecutivo modal */}
      <AnimatePresence>
        {isExecutiveModalOpen && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !executiveLoading && setIsExecutiveModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Borrador ejecutivo</h3>
                  <p className="text-xs text-gray-500">{periodContextPack.periodo} · revisión humana obligatoria</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExecutiveModalOpen(false)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  disabled={executiveLoading}
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {executiveLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
                    <p className="text-sm text-gray-500">Generando borrador con IA…</p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-sans leading-relaxed">
                    {executiveDraftText || 'Sin contenido.'}
                  </pre>
                )}
              </div>
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    if (executiveDraftText) navigator.clipboard.writeText(executiveDraftText);
                  }}
                  disabled={!executiveDraftText || executiveLoading}
                >
                  Copiar
                </Button>
                <Button className="flex-1" onClick={() => setIsExecutiveModalOpen(false)} disabled={executiveLoading}>
                  Cerrar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
