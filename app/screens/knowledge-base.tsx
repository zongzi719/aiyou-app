import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '@/app/contexts/ThemeColors';
import Header from '@/components/Header';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT } from '@/lib/globalBottomTabBar';
import {
  peekKnowledgeData,
  putKnowledgeData,
  knowledgeDataStale,
  LIST_CACHE_POLL_INTERVAL_MS,
} from '@/lib/listDataCache';
import { safeRouterBackOrHome } from '@/lib/safeRouterBack';
import {
  knowledgeApi,
  KnowledgeFolder,
  KnowledgeFile,
  formatDate,
  getMimeLabel,
  getMimeColor,
} from '@/services/knowledgeApi';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Sub-components ─────────────────────────────────────────────────────────────

interface FileBadgeProps {
  mimeType: string;
}

const FileBadge = ({ mimeType }: FileBadgeProps) => {
  const label = getMimeLabel(mimeType);
  const color = getMimeColor(mimeType);
  return (
    <View
      style={{ backgroundColor: color }}
      className="h-12 w-12 items-center justify-center rounded-xl">
      <ThemedText className="text-xs font-bold text-white">{label}</ThemedText>
    </View>
  );
};

interface FolderCardProps {
  folder: KnowledgeFolder;
  onPress: () => void;
  onLongPress: () => void;
}

// 3列 grid，每格宽度 = (屏幕宽 - 水平padding*2 - 列间距*2) / 3
const GRID_COLS = 3;
const GRID_GAP = 12;
const GRID_H_PADDING = 16; // px-global
const FOLDER_ITEM_WIDTH =
  (SCREEN_WIDTH - GRID_H_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const FolderCard = ({ folder, onPress, onLongPress }: FolderCardProps) => {
  const cardH = FOLDER_ITEM_WIDTH * 0.78;
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      style={{ width: FOLDER_ITEM_WIDTH, marginBottom: GRID_GAP }}>
      <View
        className="relative mb-1.5 items-center justify-center overflow-hidden rounded-2xl bg-secondary"
        style={{ height: cardH }}>
        {/* 叠层文档效果 */}
        <View
          className="absolute"
          style={{
            bottom: 8,
            left: 10,
            width: FOLDER_ITEM_WIDTH * 0.38,
            height: FOLDER_ITEM_WIDTH * 0.48,
            backgroundColor: '#fff',
            borderRadius: 6,
            opacity: 0.35,
          }}
        />
        <View
          className="absolute"
          style={{
            bottom: 10,
            left: 14,
            width: FOLDER_ITEM_WIDTH * 0.38,
            height: FOLDER_ITEM_WIDTH * 0.48,
            backgroundColor: '#fff',
            borderRadius: 6,
            opacity: 0.55,
          }}
        />
        <View
          className="absolute"
          style={{
            bottom: 12,
            left: 18,
            width: FOLDER_ITEM_WIDTH * 0.38,
            height: FOLDER_ITEM_WIDTH * 0.48,
            backgroundColor: '#fff',
            borderRadius: 6,
            opacity: 0.8,
          }}
        />
        {/* 文件数角标 */}
        <View className="bg-background/70 absolute right-2 top-2 rounded-md px-1.5 py-0.5">
          <ThemedText className="text-[10px] text-subtext">{folder.count}</ThemedText>
        </View>
      </View>
      <ThemedText className="px-1 text-center text-xs text-primary" numberOfLines={1}>
        {folder.name}
      </ThemedText>
    </TouchableOpacity>
  );
};

interface FileRowProps {
  file: KnowledgeFile;
  onPress: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}

const FileRow = ({ file, onPress, selectionMode, selected, onToggleSelect }: FileRowProps) => {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      onPress={() => (selectionMode ? onToggleSelect() : onPress())}
      activeOpacity={0.7}
      className="flex-row items-center border-b border-border py-3">
      {selectionMode && (
        <View
          className={`mr-2 h-6 w-6 items-center justify-center rounded border ${
            selected ? 'border-primary bg-primary' : 'border-border'
          }`}>
          {selected ? <Icon name="Check" size={14} color={colors.invert} /> : null}
        </View>
      )}
      <FileBadge mimeType={file.mime_type} />
      <View className="ml-3 flex-1">
        <ThemedText className="text-sm font-medium text-primary" numberOfLines={1}>
          {file.filename}
        </ThemedText>
        <ThemedText className="mt-0.5 text-xs text-subtext">
          {formatDate(file.created_at)}
        </ThemedText>
      </View>
      {file.status === 'processing' && (
        <ActivityIndicator size="small" style={{ marginRight: 8 }} />
      )}
      {file.status === 'error' && (
        <Icon name="AlertCircle" size={16} color="#E53935" style={{ marginRight: 8 }} />
      )}
    </TouchableOpacity>
  );
};

// ─── New Folder Modal ───────────────────────────────────────────────────────────

interface NewFolderModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

const NewFolderModal = ({ visible, onClose, onCreate }: NewFolderModalProps) => {
  const [name, setName] = useState('');
  const colors = useThemeColors();

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View className="flex-1 justify-center px-8" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View className="rounded-2xl bg-background p-6">
          <ThemedText className="mb-4 text-lg font-bold">新建文件夹</ThemedText>
          <TextInput
            className="mb-4 rounded-xl bg-secondary px-4 py-3 text-base text-primary"
            placeholder="文件夹名称"
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <View className="flex-row gap-x-3">
            <TouchableOpacity
              onPress={() => {
                setName('');
                onClose();
              }}
              className="flex-1 items-center rounded-xl bg-secondary py-3">
              <ThemedText className="text-base font-semibold">取消</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              className="flex-1 items-center rounded-xl bg-primary py-3">
              <Text className="text-base font-semibold text-invert">创建</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Upload Action Sheet ────────────────────────────────────────────────────────

interface UploadAction {
  icon: IconName;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}

interface UploadActionSheetProps {
  visible: boolean;
  onClose: () => void;
  actions: UploadAction[];
  folderAction: { title: string; subtitle: string; onPress: () => void };
}

const UploadActionSheet = ({ visible, onClose, actions, folderAction }: UploadActionSheetProps) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <TouchableOpacity activeOpacity={1} style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="mx-4 mb-2 overflow-hidden rounded-2xl bg-secondary">
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  onClose();
                  setTimeout(action.onPress, 250);
                }}
                activeOpacity={action.disabled ? 1 : 0.7}
                className={`flex-row items-center px-4 py-4 ${
                  index < actions.length - 1 ? 'border-b border-border' : ''
                } ${action.disabled ? 'opacity-40' : ''}`}>
                <View
                  className="mr-4 h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: action.iconBg }}>
                  <Icon name={action.icon} size={22} color="white" />
                </View>
                <View className="flex-1">
                  <ThemedText className="text-base font-semibold text-primary">
                    {action.title}
                  </ThemedText>
                  <ThemedText className="mt-0.5 text-xs text-subtext">{action.subtitle}</ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mx-4 overflow-hidden rounded-2xl bg-secondary">
            <TouchableOpacity
              onPress={() => {
                onClose();
                setTimeout(folderAction.onPress, 250);
              }}
              activeOpacity={0.7}
              className="flex-row items-center px-4 py-4">
              <View className="bg-highlight/20 mr-4 h-11 w-11 items-center justify-center rounded-xl">
                <Icon name="FolderPlus" size={22} color="#0EA5E9" />
              </View>
              <View className="flex-1">
                <ThemedText className="text-base font-semibold text-primary">
                  {folderAction.title}
                </ThemedText>
                <ThemedText className="mt-0.5 text-xs text-subtext">
                  {folderAction.subtitle}
                </ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function KnowledgeBaseScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const floatListPad = useGlobalFloatingTabBarInset();
  const initialKb = peekKnowledgeData();
  const [folders, setFolders] = useState<KnowledgeFolder[]>(() => initialKb?.folders ?? []);
  const [files, setFiles] = useState<KnowledgeFile[]>(() => initialKb?.files ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [uploadSheetVisible, setUploadSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const filteredFiles = files.filter((f) => {
    const matchFolder = selectedFolderId ? f.folder_id === selectedFolderId : true;
    const matchSearch = searchQuery
      ? f.filename.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchFolder && matchSearch;
  });

  const loadData = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (!force && !knowledgeDataStale()) return;
    if (force) setRefreshing(true);
    try {
      const [folderList, fileList] = await Promise.all([
        knowledgeApi.getFolders().catch(() => [] as KnowledgeFolder[]),
        knowledgeApi.getFiles().catch(() => ({ files: [] as KnowledgeFile[], total: 0 })),
      ]);
      setFolders(folderList);
      setFiles(fileList.files);
    } finally {
      if (force) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData({ force: false });
    }, [loadData])
  );

  useEffect(() => {
    const id = setInterval(() => {
      void loadData({ force: false });
    }, LIST_CACHE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    const seeded = peekKnowledgeData() != null;
    if (folders.length === 0 && files.length === 0 && !seeded) return;
    putKnowledgeData(folders, files);
  }, [folders, files]);

  const pollFileStatus = useCallback((fileId: string) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 60;

    const tick = async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) return;
      try {
        const result = await knowledgeApi.getFileStatus(fileId);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: result.status, progress: result.progress } : f
          )
        );
        if (result.status !== 'done' && result.status !== 'error') {
          setTimeout(tick, 2000);
        }
      } catch {
        // 轮询失败时静默忽略，不影响 UI
      }
    };

    setTimeout(tick, 2000);
  }, []);

  const uploadFile = async (uri: string, filename: string, mimeType: string) => {
    try {
      const { file_id } = await knowledgeApi.uploadFile(
        uri,
        filename,
        mimeType,
        selectedFolderId ?? undefined
      );
      const newFile: KnowledgeFile = {
        id: file_id,
        filename,
        mime_type: mimeType,
        file_size: 0,
        folder_id: selectedFolderId,
        status: 'queued',
        chunk_count: 0,
        created_at: new Date().toISOString(),
        progress: 0,
      };
      setFiles((prev) => [newFile, ...prev]);
      pollFileStatus(file_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[uploadFile] error:', msg, e);
      Alert.alert('上传失败', msg || '请稍后重试');
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相机权限', '请在设置中允许访问相机');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const filename = asset.fileName ?? `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      await uploadFile(asset.uri, filename, mimeType);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相册权限', '请在设置中允许访问相册');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!result.canceled) {
      for (const asset of result.assets) {
        const filename = asset.fileName ?? `image_${Date.now()}.jpg`;
        const mimeType = asset.mimeType ?? 'image/jpeg';
        await uploadFile(asset.uri, filename, mimeType);
      }
    }
  };

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadFile(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
      }
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      const result = await knowledgeApi.createFolder(name);
      setFolders((prev) => [...prev, { id: result.id, name: result.name, count: 0 }]);
    } catch {
      const tempFolder: KnowledgeFolder = { id: `temp_${Date.now()}`, name, count: 0 };
      setFolders((prev) => [...prev, tempFolder]);
    }
  };

  const handleFolderLongPress = (folder: KnowledgeFolder) => {
    Alert.alert(folder.name, undefined, [
      { text: '重命名', onPress: () => promptRenameFolder(folder) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setFolders((prev) => prev.filter((f) => f.id !== folder.id));
          knowledgeApi.deleteFolder(folder.id).catch(() => null);
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const promptRenameFolder = (folder: KnowledgeFolder) => {
    Alert.prompt(
      '重命名文件夹',
      undefined,
      (newName) => {
        if (!newName?.trim()) return;
        setFolders((prev) =>
          prev.map((f) => (f.id === folder.id ? { ...f, name: newName.trim() } : f))
        );
        knowledgeApi.renameFolder(folder.id, newName.trim()).catch(() => null);
      },
      'plain-text',
      folder.name
    );
  };

  const toggleFileSelected = (fileId: string) => {
    setSelectedIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    Alert.alert('批量删除', `确定删除已选中的 ${selectedIds.length} 个文件？此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ids = [...selectedIds];
            setBatchBusy(true);
            setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
            setSelectedIds([]);
            setSelectionMode(false);
            try {
              await Promise.all(ids.map((id) => knowledgeApi.deleteFile(id)));
            } catch {
              Alert.alert('删除失败', '部分文件可能未删除，请下拉刷新重试');
              void loadData({ force: true });
            } finally {
              setBatchBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) return;
    const list = files.filter((f) => selectedIds.includes(f.id));
    setBatchBusy(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      for (const f of list) {
        const uri = await knowledgeApi.downloadOriginalFile(f.id, f.filename);
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: f.mime_type, dialogTitle: f.filename });
        }
      }
      if (!canShare) {
        Alert.alert('下载完成', `已将 ${list.length} 个文件保存到应用缓存`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('下载失败', msg || '请稍后重试');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleMockUpload = () => {
    const mocks = [
      {
        filename: '产品需求文档_v2.pdf',
        mime_type: 'application/pdf',
        file_size: 2.4 * 1024 * 1024,
      },
      {
        filename: '会议纪要_2026Q1.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_size: 580 * 1024,
      },
      { filename: '战略规划报告.pdf', mime_type: 'application/pdf', file_size: 5.1 * 1024 * 1024 },
    ];
    const mock = mocks[Math.floor(Math.random() * mocks.length)];
    const newFile: KnowledgeFile = {
      id: `mock_${Date.now()}`,
      filename: mock.filename,
      mime_type: mock.mime_type,
      file_size: mock.file_size,
      folder_id: selectedFolderId,
      status: 'queued',
      chunk_count: 0,
      created_at: new Date().toISOString(),
      progress: 0,
    };
    setFiles((prev) => [newFile, ...prev]);
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) => (f.id === newFile.id ? { ...f, status: 'processing', progress: 0.3 } : f))
      );
    }, 1000);
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === newFile.id
            ? {
                ...f,
                status: 'done',
                progress: 1.0,
                chunk_count: Math.floor(Math.random() * 50) + 10,
              }
            : f
        )
      );
    }, 3000);
  };

  const uploadActions: UploadAction[] = [
    {
      icon: 'Camera',
      iconBg: '#FF6B35',
      title: '拍照',
      subtitle: '会议精华，一拍即得',
      onPress: handleTakePhoto,
    },
    {
      icon: 'Image',
      iconBg: '#4CAF50',
      title: '上传图片',
      subtitle: '上传有字图片，智能解读复杂文档',
      onPress: handlePickImage,
    },
    {
      icon: 'FilePlus',
      iconBg: '#2196F3',
      title: '上传文件',
      subtitle: '万千文档，融会贯通，一键生成全局视图',
      onPress: handlePickDocument,
    },
    {
      icon: 'MessageCircle',
      iconBg: '#07C160',
      title: '上传微信文件',
      subtitle: '汇总微信文件，碎片信息整合',
      onPress: () => {},
      disabled: true,
    },
    ...(__DEV__
      ? [
          {
            icon: 'FlaskConical' as IconName,
            iconBg: '#9C27B0',
            title: '模拟上传（测试）',
            subtitle: '开发模式：随机生成一条上传记录',
            onPress: handleMockUpload,
          },
        ]
      : []),
  ];

  const leftHeaderComponent = (
    <TouchableOpacity
      onPress={() => {
        if (selectionMode) {
          setSelectionMode(false);
          setSelectedIds([]);
        } else {
          setSelectionMode(true);
        }
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="mr-2">
      <ThemedText className="text-base text-primary">
        {selectionMode ? '取消' : '批量选择'}
      </ThemedText>
    </TouchableOpacity>
  );

  const rightHeaderComponent = (
    <TouchableOpacity
      onPress={() => setUploadSheetVisible(true)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="flex-row items-center">
      <Icon name="Plus" size={16} />
      <ThemedText className="ml-0.5 text-base font-medium">新建</ThemedText>
    </TouchableOpacity>
  );

  const listHeader = (
    <View>
      {/* 搜索栏 */}
      <View className="mb-4 h-11 flex-row items-center rounded-full bg-secondary px-4">
        <Icon name="Search" size={18} />
        <TextInput
          className="ml-2 flex-1 text-sm text-primary"
          placeholder="搜索文件"
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="X" size={16} />
          </TouchableOpacity>
        )}
      </View>

      {/* 文件夹 3列 grid */}
      {folders.length > 0 && !searchQuery && (
        <View className="mb-2 flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onPress={() => setSelectedFolderId((prev) => (prev === folder.id ? null : folder.id))}
              onLongPress={() => handleFolderLongPress(folder)}
            />
          ))}
        </View>
      )}

      {/* 文件列表标题行 */}
      <View className="mb-2 mt-1 flex-row items-center justify-between">
        <ThemedText className="text-base font-bold">
          {selectedFolderId
            ? (folders.find((f) => f.id === selectedFolderId)?.name ?? '文件列表')
            : '近30天'}
        </ThemedText>
        <TouchableOpacity onPress={() => setSelectedFolderId(null)}>
          <ThemedText className="text-sm text-subtext">
            {selectedFolderId ? '显示全部' : '显示正文'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="relative flex-1 bg-background">
      <Header
        title="知识库"
        showBackButton
        onBackPress={safeRouterBackOrHome}
        leftComponent={leftHeaderComponent}
        rightComponents={selectionMode ? [] : [rightHeaderComponent]}
      />

      <FlatList
        data={filteredFiles}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: selectionMode
            ? 24 + insets.bottom + 72 + GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT
            : floatListPad,
        }}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData({ force: true })}
            tintColor={colors.icon}
          />
        }
        renderItem={({ item }) => (
          <FileRow
            file={item}
            selectionMode={selectionMode}
            selected={selectedIds.includes(item.id)}
            onToggleSelect={() => toggleFileSelected(item.id)}
            onPress={() =>
              router.push({
                pathname: '/screens/knowledge-file-detail',
                params: {
                  fileId: item.id,
                  filename: item.filename,
                  mime_type: item.mime_type,
                  file_size: String(item.file_size),
                  created_at: item.created_at,
                  status: item.status,
                  chunk_count: String(item.chunk_count ?? 0),
                  progress: item.progress != null ? String(item.progress) : '',
                  folder_id: item.folder_id ?? '',
                },
              })
            }
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Icon name="FolderOpen" size={48} />
            <ThemedText className="mt-3 text-subtext">暂无文件</ThemedText>
          </View>
        }
      />

      <NewFolderModal
        visible={newFolderVisible}
        onClose={() => setNewFolderVisible(false)}
        onCreate={handleCreateFolder}
      />

      <UploadActionSheet
        visible={uploadSheetVisible}
        onClose={() => setUploadSheetVisible(false)}
        actions={uploadActions}
        folderAction={{
          title: '添加文件夹',
          subtitle: '构建您的私人战略智库',
          onPress: () => setNewFolderVisible(true),
        }}
      />

      {selectionMode && (
        <View
          className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-border bg-background px-4 pt-3"
          style={{
            paddingBottom: Math.max(insets.bottom, 12) + GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT,
          }}>
          <TouchableOpacity
            disabled={batchBusy || selectedIds.length === 0}
            className={`flex-1 items-center rounded-xl bg-secondary py-3 ${
              batchBusy || selectedIds.length === 0 ? 'opacity-40' : ''
            }`}
            onPress={handleBatchDownload}>
            <ThemedText className="text-base font-semibold text-primary">批量下载</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={batchBusy || selectedIds.length === 0}
            className={`flex-1 items-center rounded-xl bg-secondary py-3 ${
              batchBusy || selectedIds.length === 0 ? 'opacity-40' : ''
            }`}
            onPress={handleBatchDelete}>
            <ThemedText className="text-base font-semibold text-red-500">批量删除</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
