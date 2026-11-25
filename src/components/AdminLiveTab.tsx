import { useState, useEffect, useRef } from 'react';
import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import {
  db,
  mapLiveConfigToDb,
  mapLiveItemToDb,
  uploadDataUrlToStorage,
  uploadMediaFileToStorage,
} from '../firebase';
import { Product } from '../data/mockProducts';
import {
  type LiveBoxTheme,
  type LiveSaleBox,
  type LiveSaleConfig,
  type LiveSaleItem,
  addOrUpdateLiveItem,
  calculateLiveItemPricing,
  compressImageToTargetKB,
  computeLiveEndsAt,
  deleteLiveItemLocally,
  formatRemainingLiveTime,
  getDeletedLiveItemIds,
  getImageExtensionFromDataUrl,
  getYoutubeEmbedUrl,
  saveLiveConfig,
  saveLiveItems,
} from '../utils/storeSync';
import { getCategoryAutoImage } from '../utils/categoryArt';

interface AdminLiveTabProps {
  products: Product[];
  categories: string[];
  liveConfig: LiveSaleConfig;
  setLiveConfig: React.Dispatch<React.SetStateAction<LiveSaleConfig>>;
  liveItems: LiveSaleItem[];
  setLiveItems: React.Dispatch<React.SetStateAction<LiveSaleItem[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
  requestConfirm: (cfg: {
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }) => void;
}

const SAMPLE_LIVE_MODELS: Array<{
  title: string;
  modelName: string;
  category: string;
  originalPrice: number;
  discountPercent: number;
}> = [
  { title: 'Amal CoolGuard Pro Vest', modelName: 'Model V1-Ice', category: 'Vests', originalPrice: 2499, discountPercent: 20 },
  { title: 'Rider UV Cooling Overcoat', modelName: 'Model C2-Aero', category: 'Coats', originalPrice: 2899, discountPercent: 10 },
  { title: 'Arctic Gel Neck Shield', modelName: 'Model N3-Gel', category: 'Sun Protection', originalPrice: 899, discountPercent: 20 },
  { title: 'Breathable Mesh Summer Coat', modelName: 'Model C4-Breeze', category: 'Coats', originalPrice: 2199, discountPercent: 15 },
  { title: 'Delivery Hero Cooling Kit', modelName: 'Model V5-Rider', category: 'Vests', originalPrice: 2699, discountPercent: 25 },
  { title: 'UV50+ Arm Sleeves Pair', modelName: 'Model A6-Flex', category: 'Accessories', originalPrice: 599, discountPercent: 20 },
  { title: 'Dual-Fan Evaporative Vest', modelName: 'Model V7-Turbo', category: 'Vests', originalPrice: 3499, discountPercent: 10 },
  { title: 'Kerala Monsoon + Sun Shell', modelName: 'Model K8-Shield', category: 'Kerala Special', originalPrice: 1999, discountPercent: 20 },
  { title: 'Helmet Cool Liner Pad', modelName: 'Model H9-Cool', category: 'Accessories', originalPrice: 749, discountPercent: 10 },
  { title: 'Solar Reflective Rider Cap', modelName: 'Model S10-Cap', category: 'Sun Protection', originalPrice: 699, discountPercent: 20 },
  { title: 'Executive Commuter Cool Coat', modelName: 'Model C11-Lite', category: 'Coats', originalPrice: 2399, discountPercent: 10 },
  { title: 'Heavy-Duty Outdoor Work Vest', modelName: 'Model V12-Max', category: 'Vests', originalPrice: 2999, discountPercent: 20 },
];

export default function AdminLiveTab({
  products,
  categories,
  liveConfig,
  setLiveConfig,
  liveItems,
  setLiveItems,
  showToast,
  requestConfirm,
}: AdminLiveTabProps) {
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const itemFormRef = useRef<HTMLDivElement | null>(null);
  const [liveSectionFilter, setLiveSectionFilter] = useState<string>('all');

  // New Horizontal Box & Inline Rename state
  const [newBox, setNewBox] = useState<{
    title: string;
    sectionName: string;
    subtitle: string;
    offerBadge: string;
    offerPercent: number;
    offerAmount: number;
    ctaText: string;
    theme: LiveBoxTheme;
  }>({
    title: 'Special Live Percentage Deal',
    sectionName: '',
    subtitle: 'Instant Extra Savings During Live Hour',
    offerBadge: '20% OFF',
    offerPercent: 20,
    offerAmount: 0,
    ctaText: 'Order Live',
    theme: 'crimson',
  });
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [editBoxDraft, setEditBoxDraft] = useState<{
    title: string;
    sectionName: string;
    offerBadge: string;
  }>({ title: '', sectionName: '', offerBadge: '' });

  // New / Edit Live Card form state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<{
    title: string;
    modelName: string;
    category: string;
    boxId: string;
    sectionName: string;
    originalPrice: number;
    offerPrice: number;
    discountPercent: number;
    offerAmount: number;
    tag: string;
    description: string;
    images: string[];
    videos: string[];
    linkedProductId: string;
    visible: boolean;
  }>({
    title: '',
    modelName: '',
    category: categories[0] || 'Vests',
    boxId: '',
    sectionName: '',
    originalPrice: 2499,
    offerPrice: 1999,
    discountPercent: 20,
    offerAmount: 500,
    tag: 'LIVE 20% OFF',
    description: '',
    images: [],
    videos: [],
    linkedProductId: '',
    visible: true,
  });

  const [imageUrlInput, setImageUrlInput] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const persistConfigToCloud = async (cfg: LiveSaleConfig) => {
    const savedLocal = saveLiveConfig(cfg);
    setLiveConfig(savedLocal);
    try {
      await setDoc(
        doc(db, 'settings', 'live'),
        mapLiveConfigToDb(savedLocal, getDeletedLiveItemIds())
      );
      return true;
    } catch (err) {
      console.warn('Firestore save settings/live err:', err);
      return false;
    }
  };

  const handleSaveLiveConfig = async (startTimerNow = false) => {
    setSavingConfig(true);
    const nowIso = new Date().toISOString();
    const computedEndsAt = computeLiveEndsAt(
      liveConfig.durationHours,
      liveConfig.durationMinutes,
      Date.now()
    );

    const nextCfg: LiveSaleConfig = {
      ...liveConfig,
      active: startTimerNow ? true : liveConfig.active,
      startedAt: startTimerNow ? nowIso : liveConfig.startedAt || nowIso,
      endsAt:
        startTimerNow || !liveConfig.endsAt
          ? computedEndsAt
          : computeLiveEndsAt(liveConfig.durationHours, liveConfig.durationMinutes, Date.now()),
    };

    const synced = await persistConfigToCloud(nextCfg);
    setSavingConfig(false);
    showToast(
      synced
        ? startTimerNow
          ? `✓ LIVE Started! Timer & offers live on Home & Profile.`
          : `✓ Live settings saved & synced!`
        : `✓ Saved locally (retrying cloud sync).`
    );
  };

  const handleToggleLiveActive = async () => {
    const nextActive = !liveConfig.active;
    const nowIso = new Date().toISOString();
    const nextCfg: LiveSaleConfig = {
      ...liveConfig,
      active: nextActive,
      startedAt: nextActive ? nowIso : liveConfig.startedAt,
      endsAt: nextActive
        ? computeLiveEndsAt(liveConfig.durationHours, liveConfig.durationMinutes, Date.now())
        : liveConfig.endsAt,
    };
    await persistConfigToCloud(nextCfg);
    showToast(
      nextActive
        ? '🔴 LIVE Mode is now ON across Home & Profile!'
        : '⏸️ LIVE Mode turned OFF.'
    );
  };

  const handleAddHorizontalBox = async () => {
    if (!newBox.title.trim()) return;
    const resolvedTitle = newBox.title.trim().slice(0, 100);
    const resolvedSectionName = (newBox.sectionName.trim() || resolvedTitle).slice(0, 80);
    const box: LiveSaleBox = {
      id: `box_${Date.now()}`,
      title: resolvedTitle,
      sectionName: resolvedSectionName,
      subtitle: newBox.subtitle.trim().slice(0, 140),
      offerBadge:
        newBox.offerBadge.trim() ||
        (newBox.offerPercent > 0
          ? `${newBox.offerPercent}% OFF`
          : newBox.offerAmount > 0
          ? `₹${newBox.offerAmount} OFF`
          : 'LIVE DEAL'),
      offerPercent: Math.max(0, Number(newBox.offerPercent || 0)),
      offerAmount: Math.max(0, Number(newBox.offerAmount || 0)),
      ctaText: newBox.ctaText.trim() || 'Shop Live',
      theme: newBox.theme,
    };
    const nextCfg: LiveSaleConfig = {
      ...liveConfig,
      liveBoxes: [...(liveConfig.liveBoxes || []), box].slice(0, 20),
    };
    await persistConfigToCloud(nextCfg);
    setNewBox({
      title: '',
      sectionName: '',
      subtitle: '',
      offerBadge: '10% OFF',
      offerPercent: 10,
      offerAmount: 0,
      ctaText: 'Shop Live',
      theme: 'amber',
    });
    showToast(`✓ Added horizontal Live box "${box.sectionName || box.title}"!`);
  };

  const handleSaveBoxEdit = async (boxId: string) => {
    const cleanTitle = editBoxDraft.title.trim().slice(0, 100);
    const cleanSectionName = (editBoxDraft.sectionName.trim() || cleanTitle).slice(0, 80);
    const cleanBadge = editBoxDraft.offerBadge.trim().slice(0, 40);
    if (!cleanTitle && !cleanSectionName) return;

    const nextBoxes = (liveConfig.liveBoxes || []).map(b =>
      b.id === boxId
        ? {
            ...b,
            title: cleanTitle || b.title,
            sectionName: cleanSectionName,
            offerBadge: cleanBadge || b.offerBadge,
          }
        : b
    );
    await persistConfigToCloud({ ...liveConfig, liveBoxes: nextBoxes });

    // Sync renamed sectionName on cards assigned to this box
    const impacted = liveItems.filter(it => it.boxId === boxId);
    if (impacted.length > 0) {
      const updatedItems = liveItems.map(it =>
        it.boxId === boxId
          ? { ...it, sectionName: cleanSectionName, updatedAt: new Date().toISOString() }
          : it
      );
      const savedList = saveLiveItems(updatedItems);
      setLiveItems(savedList);
      try {
        const batch = writeBatch(db);
        impacted.forEach(it =>
          batch.set(
            doc(db, 'live_items', it.id),
            mapLiveItemToDb({ ...it, sectionName: cleanSectionName, updatedAt: new Date().toISOString() }),
            { merge: true }
          )
        );
        await batch.commit();
      } catch {
        // ignore cloud sync warning
      }
    }

    setEditingBoxId(null);
    showToast(`✓ Renamed Live box to "${cleanSectionName}"!`);
  };

  const handleRemoveHorizontalBox = async (boxId: string) => {
    const nextCfg: LiveSaleConfig = {
      ...liveConfig,
      liveBoxes: (liveConfig.liveBoxes || []).filter(b => b.id !== boxId),
    };
    await persistConfigToCloud(nextCfg);
    if (editingBoxId === boxId) setEditingBoxId(null);
    showToast('✓ Horizontal Live box removed.');
  };

  const updatePricingFromPercent = (orig: number, pct: number) => {
    const calc = calculateLiveItemPricing({ originalPrice: orig, discountPercent: pct });
    setItemForm(prev => ({
      ...prev,
      originalPrice: calc.originalPrice,
      discountPercent: calc.discountPercent,
      offerPrice: calc.offerPrice,
      offerAmount: calc.offerAmount,
      tag: calc.discountPercent > 0 ? `LIVE ${calc.discountPercent}% OFF` : prev.tag,
    }));
  };

  const updatePricingFromOfferAmount = (orig: number, offAmt: number) => {
    const calc = calculateLiveItemPricing({ originalPrice: orig, offerAmount: offAmt });
    setItemForm(prev => ({
      ...prev,
      originalPrice: calc.originalPrice,
      offerAmount: calc.offerAmount,
      offerPrice: calc.offerPrice,
      discountPercent: calc.discountPercent,
      tag: calc.offerAmount > 0 ? `Save ₹${calc.offerAmount}` : prev.tag,
    }));
  };

  const updatePricingFromOfferPrice = (orig: number, offerPriceVal: number) => {
    const calc = calculateLiveItemPricing({ originalPrice: orig, offerPrice: offerPriceVal });
    setItemForm(prev => ({
      ...prev,
      originalPrice: calc.originalPrice,
      offerPrice: calc.offerPrice,
      discountPercent: calc.discountPercent,
      offerAmount: calc.offerAmount,
    }));
  };

  const handleLiveImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    try {
      const addedUrls: string[] = [];
      const sizeLabels: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImageToTargetKB(files[i], 10);
        const ext = getImageExtensionFromDataUrl(compressed.dataUrl);
        const cloudUrl = await uploadDataUrlToStorage(
          compressed.dataUrl,
          `live_media/img_${Date.now()}_${i}.${ext}`
        );
        addedUrls.push(cloudUrl || compressed.dataUrl);
        sizeLabels.push(`${compressed.sizeKB} KB`);
      }
      setItemForm(prev => ({
        ...prev,
        images: [...prev.images, ...addedUrls].slice(0, 15),
      }));
      showToast(`✓ Added ${addedUrls.length} live photo(s) (${sizeLabels.join(', ')})!`);
    } catch {
      showToast('Could not process selected photo(s).', 'error');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleLiveVideosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    try {
      const addedVideos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
        const cloudUrl = await uploadMediaFileToStorage(
          file,
          `live_videos/vid_${Date.now()}_${i}.${ext}`
        );
        if (cloudUrl) {
          addedVideos.push(cloudUrl);
        } else if (file.size <= 650 * 1024) {
          // Small video inline fallback if Storage upload unavailable
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Video read failed'));
            reader.readAsDataURL(file);
          });
          if (dataUrl) addedVideos.push(dataUrl);
        } else {
          showToast(
            `Video "${file.name}" is too large without Cloud Storage. Paste a video/YouTube URL below.`,
            'error'
          );
        }
      }
      if (addedVideos.length > 0) {
        setItemForm(prev => ({
          ...prev,
          videos: [...prev.videos, ...addedVideos].slice(0, 10),
        }));
        showToast(`✓ Attached ${addedVideos.length} live video(s)!`);
      }
    } catch {
      showToast('Could not upload video file.', 'error');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const resetItemForm = () => {
    setEditingItemId(null);
    setItemForm({
      title: '',
      modelName: '',
      category: categories[0] || 'Vests',
      boxId: '',
      sectionName: '',
      originalPrice: 2499,
      offerPrice: 1999,
      discountPercent: liveConfig.defaultDiscountPercent || 20,
      offerAmount: liveConfig.defaultOfferAmount || 500,
      tag: `LIVE ${liveConfig.defaultDiscountPercent || 20}% OFF`,
      description: '',
      images: [],
      videos: [],
      linkedProductId: '',
      visible: true,
    });
    setImageUrlInput('');
    setVideoUrlInput('');
  };

  const handleSaveLiveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.title.trim()) return;
    setSavingItem(true);

    const calc = calculateLiveItemPricing({
      originalPrice: itemForm.originalPrice,
      offerPrice: itemForm.offerPrice,
      discountPercent: itemForm.discountPercent,
      offerAmount: itemForm.offerAmount,
    });

    const itemId = editingItemId || `live_${Date.now()}`;
    const chosenCat = (itemForm.category || categories[0] || 'Vests').trim();
    const resolvedImages =
      itemForm.images.length > 0 ? itemForm.images : [getCategoryAutoImage(chosenCat)];
    const cleanBoxId = (itemForm.boxId || '').trim().slice(0, 64);
    const matchedBox = (liveConfig.liveBoxes || []).find(b => b.id === cleanBoxId);
    const cleanSectionName = (
      itemForm.sectionName.trim() ||
      matchedBox?.sectionName ||
      matchedBox?.title ||
      ''
    ).slice(0, 80);

    const newItem: LiveSaleItem = {
      id: itemId,
      title: itemForm.title.trim().slice(0, 200),
      modelName: itemForm.modelName.trim().slice(0, 120),
      category: chosenCat.slice(0, 100),
      boxId: cleanBoxId,
      sectionName: cleanSectionName,
      originalPrice: calc.originalPrice,
      offerPrice: calc.offerPrice,
      discountPercent: calc.discountPercent,
      offerAmount: calc.offerAmount,
      tag: (itemForm.tag || '').trim().slice(0, 80),
      description: (itemForm.description || '').trim().slice(0, 2000),
      images: resolvedImages.slice(0, 15),
      videos: itemForm.videos.slice(0, 10),
      linkedProductId: itemForm.linkedProductId || '',
      visible: itemForm.visible !== false,
      sortOrder: editingItemId
        ? liveItems.find(i => i.id === editingItemId)?.sortOrder ?? liveItems.length + 1
        : liveItems.length + 1,
      createdAt:
        liveItems.find(i => i.id === editingItemId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextList = addOrUpdateLiveItem(newItem);
    setLiveItems(nextList);

    try {
      await setDoc(doc(db, 'live_items', newItem.id), mapLiveItemToDb(newItem), { merge: true });
      showToast(
        editingItemId
          ? `✓ Updated Live model "${newItem.title}"!`
          : `✓ Added Live model "${newItem.title}" (${nextList.length} total cards)!`
      );
      resetItemForm();
    } catch (err: any) {
      showToast(
        `Saved locally; Firestore note: ${err?.message || 'check size limits'}`,
        'error'
      );
    } finally {
      setSavingItem(false);
    }
  };

  const handleToggleItemVisible = async (item: LiveSaleItem) => {
    const updated: LiveSaleItem = {
      ...item,
      visible: item.visible === false,
      updatedAt: new Date().toISOString(),
    };
    const nextList = addOrUpdateLiveItem(updated);
    setLiveItems(nextList);
    try {
      await setDoc(doc(db, 'live_items', updated.id), mapLiveItemToDb(updated), { merge: true });
    } catch {
      // ignore
    }
  };

  const handleDuplicateItem = async (item: LiveSaleItem) => {
    const copy: LiveSaleItem = {
      ...item,
      id: `live_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      modelName: item.modelName ? `${item.modelName} Copy` : 'New Variant',
      sortOrder: liveItems.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextList = addOrUpdateLiveItem(copy);
    setLiveItems(nextList);
    try {
      await setDoc(doc(db, 'live_items', copy.id), mapLiveItemToDb(copy));
    } catch {
      // ignore
    }
    showToast(`✓ Duplicated "${item.title}"! Edit or customize its photos/videos anytime.`);
  };

  const handleDeleteLiveItem = (item: LiveSaleItem) => {
    requestConfirm({
      title: 'Delete Live Card?',
      message: `Remove "${item.title}" from the Live sale section?`,
      confirmLabel: '🗑️ Delete Card',
      danger: true,
      onConfirm: async () => {
        const nextList = deleteLiveItemLocally(item.id);
        setLiveItems(nextList);
        try {
          await deleteDoc(doc(db, 'live_items', item.id));
          await setDoc(
            doc(db, 'settings', 'live'),
            mapLiveConfigToDb(liveConfig, getDeletedLiveItemIds())
          );
        } catch {
          // ignore
        }
        showToast(`✓ Removed "${item.title}" from Live section.`);
      },
    });
  };

  const handlePopulate12LiveModels = async () => {
    setSavingItem(true);
    const created: LiveSaleItem[] = SAMPLE_LIVE_MODELS.map((m, idx) => {
      const calc = calculateLiveItemPricing({
        originalPrice: m.originalPrice,
        discountPercent: m.discountPercent,
      });
      const id = `live_model_${Date.now()}_${idx + 1}`;
      return {
        id,
        title: m.title,
        modelName: m.modelName,
        category: m.category,
        originalPrice: calc.originalPrice,
        offerPrice: calc.offerPrice,
        discountPercent: calc.discountPercent,
        offerAmount: calc.offerAmount,
        tag: `LIVE ${calc.discountPercent}% OFF`,
        description: `${m.title} (${m.modelName}) — Limited Live Sale offer with ${calc.discountPercent}% instant discount.`,
        images: [getCategoryAutoImage(m.category)],
        videos: [],
        linkedProductId: '',
        visible: true,
        sortOrder: liveItems.length + idx + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const combined = [...liveItems, ...created];
    const savedLocal = saveLiveItems(combined);
    setLiveItems(savedLocal);

    try {
      const batch = writeBatch(db);
      created.forEach(item => {
        batch.set(doc(db, 'live_items', item.id), mapLiveItemToDb(item));
      });
      await batch.commit();
      showToast(`✓ Added 12 Live models! Upload custom photos & videos for any card anytime.`);
    } catch {
      showToast('✓ Added 12 Live models locally!');
    } finally {
      setSavingItem(false);
    }
  };

  const handleApplyGlobalPercentToAll = async (pct: number) => {
    const nextCfg: LiveSaleConfig = { ...liveConfig, defaultDiscountPercent: pct };
    await persistConfigToCloud(nextCfg);
    if (liveItems.length === 0) {
      showToast(`✓ Default Live offer set to ${pct}% OFF!`);
      return;
    }
    const updated = liveItems.map(item => {
      const calc = calculateLiveItemPricing({
        originalPrice: item.originalPrice,
        discountPercent: pct,
      });
      return {
        ...item,
        discountPercent: calc.discountPercent,
        offerPrice: calc.offerPrice,
        offerAmount: calc.offerAmount,
        tag: `LIVE ${pct}% OFF`,
        updatedAt: new Date().toISOString(),
      };
    });
    const saved = saveLiveItems(updated);
    setLiveItems(saved);
    try {
      const batch = writeBatch(db);
      saved.forEach(it => batch.set(doc(db, 'live_items', it.id), mapLiveItemToDb(it), { merge: true }));
      await batch.commit();
    } catch {
      // ignore
    }
    showToast(`✓ Applied ${pct}% OFF across all ${saved.length} Live cards!`);
  };

  const timeStatus = formatRemainingLiveTime(liveConfig, nowMs);

  return (
    <div className="space-y-6">
      {/* 1. LIVE HEADER, TIMER & MASTER OFFER CONTROLS */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-rose-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-1 rounded-md ${
                  liveConfig.active
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveConfig.active ? 'bg-white animate-pulse' : 'bg-gray-500'
                  }`}
                />
                {liveConfig.headerLabel || 'LIVE'}
              </span>
              <h2 className="font-extrabold text-base text-gray-900">
                Live Sale, Timer &amp; Offer Control Center
              </h2>
            </div>
            <p className="text-xs text-gray-500">
              Control Live header, custom countdown timer, 10%/20%+ offers, multiple horizontal offer boxes, and 10–15+ photo/video cards on Home &amp; Profile.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleToggleLiveActive}
              className={`h-10 px-4 rounded-xl text-xs font-extrabold shadow-xs transition flex items-center gap-2 whitespace-nowrap ${
                liveConfig.active
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <span>{liveConfig.active ? '🔴 LIVE IS ON (Click to Pause)' : '▶ Turn ON LIVE Now'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-gray-700 mb-1">Top Header Label (e.g. LIVE)</label>
            <input
              type="text"
              value={liveConfig.headerLabel}
              onChange={e => setLiveConfig({ ...liveConfig, headerLabel: e.target.value })}
              placeholder="LIVE"
              className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 font-black text-rose-700 uppercase outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block font-bold text-gray-700 mb-1">Live Sub-Heading / Promo Text</label>
            <input
              type="text"
              value={liveConfig.subtitle}
              onChange={e => setLiveConfig({ ...liveConfig, subtitle: e.target.value })}
              placeholder="Special Live Cooling Gear Deals • Extra 10% - 20% Off"
              className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 font-medium outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Live Timer Preview</label>
            <div className="h-[42px] px-3 bg-slate-900 text-white rounded-xl flex items-center justify-between font-mono font-black tabular-nums">
              <span className="text-[10px] text-rose-400 uppercase">{liveConfig.headerLabel || 'LIVE'}</span>
              <span className="text-sm">
                {timeStatus.expired ? '00:00:00' : timeStatus.countdownText}
              </span>
            </div>
          </div>
        </div>

        {/* Editable Duration / Timer + Offer Percentage & Price */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-rose-50/70 p-4 rounded-2xl border border-rose-200 text-xs">
          <div className="space-y-2.5">
            <p className="font-extrabold text-rose-950">⏱️ Live Timer &amp; Duration Settings</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={liveConfig.durationHours}
                  onChange={e =>
                    setLiveConfig({ ...liveConfig, durationHours: Math.max(0, Number(e.target.value || 0)) })
                  }
                  className="w-full p-2 border border-rose-300 rounded-xl bg-white font-extrabold text-center tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={liveConfig.durationMinutes}
                  onChange={e =>
                    setLiveConfig({
                      ...liveConfig,
                      durationMinutes: Math.max(0, Math.min(59, Number(e.target.value || 0))),
                    })
                  }
                  className="w-full p-2 border border-rose-300 rounded-xl bg-white font-extrabold text-center tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Custom Duration Note</label>
                <input
                  type="text"
                  value={liveConfig.durationText}
                  onChange={e => setLiveConfig({ ...liveConfig, durationText: e.target.value })}
                  placeholder="e.g. Ends 10 PM"
                  className="w-full p-2 border border-rose-300 rounded-xl bg-white font-bold"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={savingConfig}
                onClick={() => handleSaveLiveConfig(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-4 py-2 rounded-xl shadow-xs text-xs transition"
              >
                ▶ Start / Reset Timer Now ({liveConfig.durationHours}h {liveConfig.durationMinutes}m)
              </button>
              <button
                type="button"
                disabled={savingConfig}
                onClick={() => handleSaveLiveConfig(false)}
                className="bg-slate-900 hover:bg-black text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {savingConfig ? 'Saving...' : '💾 Save Settings'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="font-extrabold text-rose-950">🏷️ Quick Offer % &amp; Live Offer Amount</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[10, 15, 20, 25, 30, 50].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleApplyGlobalPercentToAll(pct)}
                  className={`px-3 py-1.5 rounded-lg font-extrabold border text-xs transition ${
                    liveConfig.defaultDiscountPercent === pct
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-gray-800 border-rose-200 hover:bg-emerald-50'
                  }`}
                >
                  {pct}% OFF
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="95"
                  placeholder="Custom %"
                  value={liveConfig.defaultDiscountPercent || ''}
                  onChange={e =>
                    setLiveConfig({
                      ...liveConfig,
                      defaultDiscountPercent: Math.max(0, Math.min(95, Number(e.target.value || 0))),
                    })
                  }
                  className="w-20 p-1.5 border border-rose-300 rounded-lg bg-white font-bold text-center"
                />
                <button
                  type="button"
                  onClick={() => handleApplyGlobalPercentToAll(liveConfig.defaultDiscountPercent || 10)}
                  className="bg-blue-600 text-white font-bold px-2.5 py-1.5 rounded-lg"
                >
                  Apply All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Special Live Offer Amount ₹ (Optional)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 500"
                  value={liveConfig.defaultOfferAmount || ''}
                  onChange={e =>
                    setLiveConfig({
                      ...liveConfig,
                      defaultOfferAmount: Math.max(0, Number(e.target.value || 0)),
                    })
                  }
                  className="w-full p-2 border border-rose-300 rounded-xl bg-white font-extrabold text-emerald-700"
                />
              </div>
              <div className="flex items-end">
                <span className="text-[11px] text-gray-600 bg-white border border-rose-200 rounded-xl p-2 w-full">
                  Active Offer: <b>{liveConfig.defaultDiscountPercent || 0}% OFF</b>
                  {liveConfig.defaultOfferAmount > 0 ? ` · ₹${liveConfig.defaultOfferAmount} Deal` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. HORIZONTAL SIDE-BY-SIDE LIVE BOXES MANAGER */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-amber-200 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-gray-900">
              📦 Horizontal Live Offer Boxes ({(liveConfig.liveBoxes || []).length})
            </h3>
            <p className="text-xs text-gray-500">
              Add multiple side-by-side scrollable offer boxes (e.g., 10% Off Box, 20% Off Box, Video Flash Box) displayed at the top of the Live strip.
            </p>
          </div>
        </div>

        {(liveConfig.liveBoxes || []).length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {liveConfig.liveBoxes.map(box => {
              const displaySectionName = box.sectionName || box.title;
              const assignedCount = liveItems.filter(it => it.boxId === box.id).length;
              const isEditingThis = editingBoxId === box.id;

              return (
                <div
                  key={box.id}
                  className="w-64 shrink-0 rounded-2xl p-3.5 border border-gray-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white relative space-y-2"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveHorizontalBox(box.id)}
                    title="Delete box"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>

                  {isEditingThis ? (
                    <div className="space-y-1.5 pr-6 text-xs">
                      <input
                        type="text"
                        maxLength={80}
                        placeholder="Section Name / Label"
                        value={editBoxDraft.sectionName}
                        onChange={e =>
                          setEditBoxDraft(prev => ({ ...prev, sectionName: e.target.value }))
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-950 border border-slate-600 text-white font-bold outline-none"
                      />
                      <input
                        type="text"
                        maxLength={100}
                        placeholder="Box Title"
                        value={editBoxDraft.title}
                        onChange={e =>
                          setEditBoxDraft(prev => ({ ...prev, title: e.target.value }))
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-950 border border-slate-600 text-white outline-none"
                      />
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="Offer Badge"
                        value={editBoxDraft.offerBadge}
                        onChange={e =>
                          setEditBoxDraft(prev => ({ ...prev, offerBadge: e.target.value }))
                        }
                        className="w-full p-1.5 rounded-lg bg-slate-950 border border-slate-600 text-amber-300 font-bold outline-none"
                      />
                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleSaveBoxEdit(box.id)}
                          className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                        >
                          ✓ Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBoxId(null)}
                          className="flex-1 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[11px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap pr-6">
                        <span className="inline-block text-[10px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
                          {box.offerBadge}
                        </span>
                        <span className="inline-block text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded truncate max-w-[130px]">
                          🏷️ {displaySectionName}
                        </span>
                      </div>
                      <p className="font-extrabold text-xs pr-6 truncate">{box.title}</p>
                      {box.subtitle && (
                        <p className="text-[11px] text-slate-300 line-clamp-1">{box.subtitle}</p>
                      )}
                      <div className="flex items-center justify-between gap-1.5 pt-1 text-[10.5px]">
                        <span className="text-slate-300 font-bold tabular-nums">
                          {assignedCount} {assignedCount === 1 ? 'card' : 'cards'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBoxId(box.id);
                              setEditBoxDraft({
                                title: box.title,
                                sectionName: box.sectionName || box.title,
                                offerBadge: box.offerBadge || '',
                              });
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold cursor-pointer"
                          >
                            ✏️ Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setItemForm(prev => ({
                                ...prev,
                                boxId: box.id,
                                sectionName: displaySectionName,
                              }));
                              itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              showToast(`Uploading card into "${displaySectionName}"!`);
                            }}
                            className="px-2 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-extrabold cursor-pointer whitespace-nowrap"
                          >
                            + Upload Card
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 text-xs">
          <input
            type="text"
            maxLength={80}
            placeholder="Custom Section Name (e.g. Cooling Vests)"
            value={newBox.sectionName}
            onChange={e => setNewBox({ ...newBox, sectionName: e.target.value })}
            className="p-2.5 border border-amber-300 rounded-xl bg-white font-bold outline-none"
          />
          <input
            type="text"
            maxLength={100}
            placeholder="Box Title (e.g. 20% Live Deal)"
            value={newBox.title}
            onChange={e => setNewBox({ ...newBox, title: e.target.value })}
            className="p-2.5 border border-amber-300 rounded-xl bg-white font-bold outline-none"
          />
          <input
            type="text"
            placeholder="Subtitle (e.g. Instant Savings)"
            value={newBox.subtitle}
            onChange={e => setNewBox({ ...newBox, subtitle: e.target.value })}
            className="p-2.5 border border-amber-300 rounded-xl bg-white outline-none"
          />
          <input
            type="text"
            placeholder="Badge (e.g. 10% OFF)"
            value={newBox.offerBadge}
            onChange={e => setNewBox({ ...newBox, offerBadge: e.target.value })}
            className="p-2.5 border border-amber-300 rounded-xl bg-white font-extrabold outline-none"
          />
          <select
            value={newBox.theme}
            onChange={e => setNewBox({ ...newBox, theme: e.target.value as LiveBoxTheme })}
            className="p-2.5 border border-amber-300 rounded-xl bg-white font-bold outline-none"
          >
            <option value="crimson">Red Live</option>
            <option value="amber">Gold Offer</option>
            <option value="blue">Flipkart Blue</option>
            <option value="emerald">Emerald Deal</option>
          </select>
          <button
            type="button"
            onClick={handleAddHorizontalBox}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-2.5 rounded-xl shadow-xs transition whitespace-nowrap"
          >
            + Add Live Box
          </button>
        </div>
      </div>

      {/* 3. ADD / EDIT MULTIPLE LIVE MODELS (IMAGES + VIDEOS + PRICING) */}
      <div ref={itemFormRef} className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-blue-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
          <div>
            <h3 className="font-extrabold text-sm text-gray-900">
              {editingItemId ? '✏️ Edit Live Model / Card' : '➕ Add Live Model / Card (Supports 10–15+ Cards)'}
            </h3>
            <p className="text-xs text-gray-500">
              Add multiple photos (~10 KB auto-compressed) &amp; multiple videos per Live model, assign to a named Live Box/Section, and set 10% / 20% / custom offers.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {editingItemId && (
              <button
                type="button"
                onClick={resetItemForm}
                className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
              >
                ✕ Cancel Edit
              </button>
            )}
            <button
              type="button"
              disabled={savingItem}
              onClick={handlePopulate12LiveModels}
              className="text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-xl transition whitespace-nowrap"
            >
              ✨ Quick Add 12 Live Models
            </button>
          </div>
        </div>

        {/* Optional Quick-Pick from Existing Products */}
        {products.length > 0 && !editingItemId && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <span className="font-bold text-slate-700 shrink-0">Quick Fill from Catalog:</span>
            <select
              value={itemForm.linkedProductId}
              onChange={e => {
                const picked = products.find(p => p.id === e.target.value);
                if (!picked) {
                  setItemForm(prev => ({ ...prev, linkedProductId: '' }));
                  return;
                }
                const pct = liveConfig.defaultDiscountPercent || 20;
                const orig = picked.price || picked.discountPrice || 1999;
                const calc = calculateLiveItemPricing({ originalPrice: orig, discountPercent: pct });
                const pics =
                  picked.galleryImages && picked.galleryImages.length > 0
                    ? picked.galleryImages
                    : picked.imageUrl
                    ? [picked.imageUrl]
                    : [];
                setItemForm(prev => ({
                  ...prev,
                  linkedProductId: picked.id,
                  title: picked.name,
                  category: picked.category || prev.category,
                  originalPrice: calc.originalPrice,
                  offerPrice: calc.offerPrice,
                  discountPercent: calc.discountPercent,
                  offerAmount: calc.offerAmount,
                  tag: `LIVE ${calc.discountPercent}% OFF`,
                  description: picked.description || '',
                  images: pics,
                }));
              }}
              className="flex-1 p-2 border border-slate-300 rounded-lg bg-white font-bold outline-none"
            >
              <option value="">-- Choose an existing product to copy into Live (Optional) --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (₹{p.discountPrice || p.price})
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSaveLiveItem} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Product / Card Title *</label>
              <input
                type="text"
                required
                value={itemForm.title}
                onChange={e => setItemForm({ ...itemForm, title: e.target.value })}
                placeholder="e.g. Amal CoolGuard Pro Vest"
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 font-bold outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Model Name / Variant</label>
              <input
                type="text"
                value={itemForm.modelName}
                onChange={e => setItemForm({ ...itemForm, modelName: e.target.value })}
                placeholder="e.g. Model V2-Ice / Edition 2026"
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Category</label>
              <select
                value={itemForm.category}
                onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 font-bold outline-none"
              >
                {Array.from(new Set([...categories, itemForm.category, 'Vests', 'Coats', 'Live Deals'])).map(
                  c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Named Section / Live Box Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200">
            <div>
              <label className="block font-bold text-indigo-950 mb-1">
                📦 Assign to Named Live Box / Section
              </label>
              <select
                value={itemForm.boxId}
                onChange={e => {
                  const chosenId = e.target.value;
                  const chosenBox = (liveConfig.liveBoxes || []).find(b => b.id === chosenId);
                  setItemForm(prev => ({
                    ...prev,
                    boxId: chosenId,
                    sectionName: chosenBox
                      ? chosenBox.sectionName || chosenBox.title
                      : prev.sectionName,
                  }));
                }}
                className="w-full p-2.5 border border-indigo-300 rounded-xl bg-white font-bold outline-none"
              >
                <option value="">General Live Feed (No specific box)</option>
                {(liveConfig.liveBoxes || []).map(box => (
                  <option key={box.id} value={box.id}>
                    {box.sectionName || box.title} ({box.offerBadge})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-indigo-950 mb-1">
                🏷️ Custom Card / Section Name (Label)
              </label>
              <input
                type="text"
                maxLength={80}
                placeholder="e.g. Rider Coats Flash Deal"
                value={itemForm.sectionName}
                onChange={e => setItemForm({ ...itemForm, sectionName: e.target.value })}
                className="w-full p-2.5 border border-indigo-300 rounded-xl bg-white font-bold outline-none"
              />
            </div>
          </div>

          {/* Pricing + Offer Percentage + Offer Amount Calculator */}
          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-extrabold text-emerald-950">💰 Live Pricing &amp; Quick Offer %</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[10, 15, 20, 25, 30, 50].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updatePricingFromPercent(itemForm.originalPrice, pct)}
                    className={`px-2.5 py-1 rounded-lg font-extrabold border text-[11px] ${
                      itemForm.discountPercent === pct
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white text-gray-700 border-emerald-200'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Original Price ₹ *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={itemForm.originalPrice}
                  onChange={e => {
                    const orig = Math.max(0, Number(e.target.value || 0));
                    updatePricingFromPercent(orig, itemForm.discountPercent);
                  }}
                  className="w-full p-2.5 border border-emerald-300 rounded-xl bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Offer % (e.g. 10 / 20)</label>
                <input
                  type="number"
                  min="0"
                  max="95"
                  value={itemForm.discountPercent}
                  onChange={e => {
                    const pct = Math.max(0, Math.min(95, Number(e.target.value || 0)));
                    updatePricingFromPercent(itemForm.originalPrice, pct);
                  }}
                  className="w-full p-2.5 border border-emerald-300 rounded-xl bg-white font-extrabold text-rose-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Discount Amount ₹ Off</label>
                <input
                  type="number"
                  min="0"
                  value={itemForm.offerAmount}
                  onChange={e => {
                    const amt = Math.max(0, Number(e.target.value || 0));
                    updatePricingFromOfferAmount(itemForm.originalPrice, amt);
                  }}
                  className="w-full p-2.5 border border-emerald-300 rounded-xl bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Final Live Offer Price ₹ *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={itemForm.offerPrice}
                  onChange={e => {
                    const offerP = Math.max(0, Number(e.target.value || 0));
                    updatePricingFromOfferPrice(itemForm.originalPrice, offerP);
                  }}
                  className="w-full p-2.5 border border-emerald-400 rounded-xl bg-white font-black text-emerald-800"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Offer Tag Badge</label>
              <input
                type="text"
                value={itemForm.tag}
                onChange={e => setItemForm({ ...itemForm, tag: e.target.value })}
                placeholder="e.g. LIVE 20% OFF / FLASH DEAL"
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Live Card Description</label>
              <input
                type="text"
                value={itemForm.description}
                onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Highlights or limited time deal details..."
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50"
              />
            </div>
          </div>

          {/* Multi-Image Uploader (~10 KB Auto Compression) */}
          <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-extrabold text-blue-950">
                📸 Multiple Photos for This Live Card ({itemForm.images.length}/15)
              </label>
              <span className="text-[10px] font-bold text-blue-700">Auto-compressed ~10 KB</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-xl cursor-pointer transition">
                <span>{uploadingMedia ? '⏳ Processing...' : '📷 Upload Multi Photos (Gallery)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingMedia}
                  onChange={handleLiveImagesUpload}
                  className="hidden"
                />
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Or paste photo URL..."
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                  className="flex-1 p-2 border border-blue-300 rounded-xl bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (imageUrlInput.trim()) {
                      setItemForm(prev => ({
                        ...prev,
                        images: [...prev.images, imageUrlInput.trim()].slice(0, 15),
                      }));
                      setImageUrlInput('');
                    }
                  }}
                  className="bg-blue-700 text-white font-bold px-3 rounded-xl"
                >
                  + Add
                </button>
              </div>
            </div>

            {itemForm.images.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {itemForm.images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-blue-300 bg-transparent shrink-0"
                  >
                    <img src={img} alt="live preview" className="w-full h-full object-cover object-center" />
                    <button
                      type="button"
                      onClick={() =>
                        setItemForm(prev => ({
                          ...prev,
                          images: prev.images.filter((_, i) => i !== idx),
                        }))
                      }
                      className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-[10px] font-bold flex items-center justify-center rounded-bl-md"
                    >
                      ✕
                    </button>
                    {idx === 0 && (
                      <span className="absolute bottom-0 inset-x-0 bg-blue-700/85 text-white text-[9px] font-bold text-center py-0.5">
                        MAIN
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multi-Video Uploader / Linker */}
          <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-extrabold text-purple-950">
                🎬 Multiple Videos for This Live Card ({itemForm.videos.length}/10)
              </label>
              <span className="text-[10px] font-bold text-purple-700">MP4 / WebM / YouTube URLs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-800 text-white font-bold py-2.5 px-3 rounded-xl cursor-pointer transition">
                <span>{uploadingMedia ? '⏳ Uploading Video...' : '🎥 Upload Video(s)'}</span>
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  disabled={uploadingMedia}
                  onChange={handleLiveVideosUpload}
                  className="hidden"
                />
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Or paste MP4 / YouTube link..."
                  value={videoUrlInput}
                  onChange={e => setVideoUrlInput(e.target.value)}
                  className="flex-1 p-2 border border-purple-300 rounded-xl bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (videoUrlInput.trim()) {
                      setItemForm(prev => ({
                        ...prev,
                        videos: [...prev.videos, videoUrlInput.trim()].slice(0, 10),
                      }));
                      setVideoUrlInput('');
                    }
                  }}
                  className="bg-purple-700 text-white font-bold px-3 rounded-xl"
                >
                  + Add
                </button>
              </div>
            </div>

            {itemForm.videos.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {itemForm.videos.map((vidUrl, idx) => {
                  const yt = getYoutubeEmbedUrl(vidUrl);
                  return (
                    <div
                      key={idx}
                      className="relative w-36 h-24 rounded-xl overflow-hidden border border-purple-300 bg-black shrink-0"
                    >
                      {yt ? (
                        <iframe
                          src={yt}
                          title={`live video ${idx + 1}`}
                          className="w-full h-full border-0 pointer-events-none"
                        />
                      ) : (
                        <video src={vidUrl} muted className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setItemForm(prev => ({
                            ...prev,
                            videos: prev.videos.filter((_, i) => i !== idx),
                          }))
                        }
                        className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow"
                      >
                        ✕
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        ▶ Video {idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={savingItem || uploadingMedia}
            className="w-full h-11 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold rounded-xl shadow-sm transition text-xs sm:text-sm"
          >
            {savingItem
              ? 'Saving Live Card...'
              : editingItemId
              ? '💾 Save Live Card Changes'
              : '🔴 Add Card to Live Section'}
          </button>
        </form>
      </div>

      {/* 4. MANAGE ALL LIVE MODELS / CARDS (10-15+ GRID) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-gray-900">
              🔴 Active Live Models &amp; Cards ({liveItems.length})
            </h3>
            <p className="text-xs text-gray-500">
              All visible cards appear side-by-side in the horizontal Live strip on Home Page and in the lower Profile Live section.
            </p>
          </div>
          {liveItems.length > 0 && (
            <button
              type="button"
              onClick={() =>
                requestConfirm({
                  title: 'Clear All Live Cards?',
                  message: `Remove all ${liveItems.length} Live cards from Home & Profile?`,
                  confirmLabel: '🗑️ Clear All',
                  danger: true,
                  onConfirm: async () => {
                    const ids = liveItems.map(i => i.id);
                    ids.forEach(id => deleteLiveItemLocally(id));
                    setLiveItems([]);
                    try {
                      const batch = writeBatch(db);
                      ids.forEach(id => batch.delete(doc(db, 'live_items', id)));
                      batch.set(
                        doc(db, 'settings', 'live'),
                        mapLiveConfigToDb(liveConfig, getDeletedLiveItemIds())
                      );
                      await batch.commit();
                    } catch {
                      // ignore
                    }
                    showToast('✓ All Live cards cleared.');
                  },
                })
              }
              className="text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg"
            >
              🗑️ Clear All Live Cards
            </button>
          )}
        </div>

        {liveItems.length === 0 ? (
          <div className="py-10 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-center space-y-3">
            <p className="text-xs font-bold text-gray-600">
              No Live models added yet. Add cards above or click &ldquo;Quick Add 12 Live Models&rdquo;.
            </p>
            <button
              type="button"
              onClick={handlePopulate12LiveModels}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs"
            >
              ✨ Populate 12 Ready-to-Edit Live Cards
            </button>
          </div>
        ) : (() => {
          const customSectionNames = Array.from(
            new Set(
              liveItems
                .filter(it => !it.boxId && (it.sectionName || '').trim())
                .map(it => (it.sectionName || '').trim())
            )
          );
          const filteredLiveItems = liveItems.filter(it => {
            if (liveSectionFilter === 'all') return true;
            if (liveSectionFilter.startsWith('box:')) {
              return it.boxId === liveSectionFilter.slice('box:'.length);
            }
            if (liveSectionFilter.startsWith('sec:')) {
              return (it.sectionName || '').trim() === liveSectionFilter.slice('sec:'.length);
            }
            if (liveSectionFilter === 'unassigned') {
              return !it.boxId && !(it.sectionName || '').trim();
            }
            return true;
          });

          return (
            <div className="space-y-3">
              {/* Filter by Named Live Box / Section */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setLiveSectionFilter('all')}
                  className={`h-8 px-3 rounded-xl text-xs font-extrabold border whitespace-nowrap transition cursor-pointer ${
                    liveSectionFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-rose-400'
                  }`}
                >
                  All Cards ({liveItems.length})
                </button>
                {(liveConfig.liveBoxes || []).map(box => {
                  const key = `box:${box.id}`;
                  const cnt = liveItems.filter(it => it.boxId === box.id).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLiveSectionFilter(key)}
                      className={`h-8 px-3 rounded-xl text-xs font-extrabold border whitespace-nowrap transition cursor-pointer ${
                        liveSectionFilter === key
                          ? 'bg-rose-600 text-white border-rose-700'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:border-rose-400'
                      }`}
                    >
                      📦 {box.sectionName || box.title} ({cnt})
                    </button>
                  );
                })}
                {customSectionNames.map(secName => {
                  const key = `sec:${secName}`;
                  const cnt = liveItems.filter(it => (it.sectionName || '').trim() === secName).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLiveSectionFilter(key)}
                      className={`h-8 px-3 rounded-xl text-xs font-extrabold border whitespace-nowrap transition cursor-pointer ${
                        liveSectionFilter === key
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:border-indigo-400'
                      }`}
                    >
                      🏷️ {secName} ({cnt})
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredLiveItems.map(item => {
                  const assignedBox = (liveConfig.liveBoxes || []).find(b => b.id === item.boxId);
                  const sectionBadgeText =
                    item.sectionName || assignedBox?.sectionName || assignedBox?.title || 'Live Feed';
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3.5 space-y-3 transition ${
                        item.visible !== false
                          ? 'bg-white border-gray-200 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-transparent border border-gray-200 shrink-0 relative">
                          <img
                            src={item.images?.[0] || getCategoryAutoImage(item.category || 'Coats')}
                            alt={item.title}
                            className="w-full h-full object-cover object-center"
                          />
                          {item.videos && item.videos.length > 0 && (
                            <span className="absolute bottom-1 left-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                              ▶ {item.videos.length} Vid
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-extrabold px-1.5 py-0.5 rounded truncate max-w-[140px]">
                              🏷️ {sectionBadgeText}
                            </span>
                            {item.discountPercent > 0 && (
                              <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums">
                                {item.discountPercent}% OFF
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-500 uppercase truncate">
                              {item.category}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-xs text-gray-900 line-clamp-2">{item.title}</h4>
                          {item.modelName && (
                            <p className="text-[11px] font-semibold text-blue-700 truncate">{item.modelName}</p>
                          )}
                          <div className="flex items-baseline gap-1.5 tabular-nums">
                            <span className="text-sm font-black text-emerald-700">₹{item.offerPrice}</span>
                            {item.originalPrice > item.offerPrice && (
                              <span className="text-[11px] text-gray-400 line-through">₹{item.originalPrice}</span>
                            )}
                            <span className="text-[10px] text-gray-500 ml-auto">
                              {item.images?.length || 1}📸 {item.videos?.length || 0}🎬
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-gray-100 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => handleToggleItemVisible(item)}
                          className={`py-1.5 rounded-lg border ${
                            item.visible !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-200 text-gray-700 border-gray-300'
                          }`}
                        >
                          {item.visible !== false ? 'Visible' : 'Hidden'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItemId(item.id);
                            setItemForm({
                              title: item.title,
                              modelName: item.modelName || '',
                              category: item.category || 'Vests',
                              boxId: item.boxId || '',
                              sectionName: item.sectionName || '',
                              originalPrice: item.originalPrice,
                              offerPrice: item.offerPrice,
                              discountPercent: item.discountPercent,
                              offerAmount: item.offerAmount,
                              tag: item.tag || '',
                              description: item.description || '',
                              images: item.images || [],
                              videos: item.videos || [],
                              linkedProductId: item.linkedProductId || '',
                              visible: item.visible !== false,
                            });
                            itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className="py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateItem(item)}
                          className="py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                        >
                          + Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLiveItem(item)}
                          className="py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
