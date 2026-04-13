import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Header from '@/components/Header';
import ThemedText from '@/components/ThemedText';
import Icon, { IconName } from '@/components/Icon';
import useThemeColors from '@/app/contexts/ThemeColors';
import {
  knowledgeApi,
  KnowledgeFolder,
  KnowledgeFile,
  formatFileSize,
  formatDate,
  getMimeLabel,
  getMimeColor,
} from '@/services/knowledgeApi';

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
      className="w-12 h-12 rounded-xl items-center justify-center"
    >
      <ThemedText className="text-xs font-bold text-white">{label}</ThemedText>
    </View>
  );
};

interface FolderCardProps {
  folder: KnowledgeFolder;
  onPress: () => void;
  onLongPress: () => void;
}

const FolderCard = ({ folder, onPress, onLongPress }: FolderCardProps) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      className="mr-4 items-center"
      style={{ width: 100 }}
    >
      <View className="w-24 h-20 rounded-xl bg-secondary items-center justify-center mb-2 relative">
        <View className="absolute top-2 right-2 w-10 h-12 bg-background rounded-md opacity-60" />
        <View className="absolute top-3 right-3 w-10 h-12 bg-background rounded-md opacity-80" />
        <View className="w-10 h-12 bg-background rounded-md shadow-sm" />
        <View className="absolute bottom-1.5 right-1.5 bg-background/80 rounded px-1">
          <ThemedText className="text-[10px] text-subtext">{folder.count}</ThemedText>
        </View>
      </View>
      <ThemedText className="text-xs text-center text-primary" numberOfLines={1}>
        {folder.name}
      </ThemedText>
    </TouchableOpacity>
  );
};

interface FileRowProps {
  file: KnowledgeFile;
  onPress: () => void;
  onMenuPress: () => void;
}

const FileRow = ({ file, onPress, onMenuPress }: FileRowProps) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className="flex-row items-center py-3 border-b border-border"
  >
    <FileBadge mimeType={file.mime_type} />
    <View className="flex-1 ml-3">
      <ThemedText className="text-sm font-medium text-primary" numberOfLines={1}>
        {file.filename}
      </ThemedText>
      <ThemedText className="text-xs text-subtext mt-0.5">
        {formatDate(file.created_at)}
      </ThemedText>
    </View>
    {file.status === 'processing' && (
      <ActivityIndicator size="small" style={{ marginRight: 8 }} />
    )}
    {file.status === 'error' && (
      <Icon name="AlertCircle" size={16} color="#E53935" style={{ marginRight: 8 }} />
    )}
    <TouchableOpacity onPress={onMenuPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Icon name="MoreHorizontal" size={20} />
    </TouchableOpacity>
  </TouchableOpacity>
);

// ─── File Detail Modal ──────────────────────────────────────────────────────────

interface FileDetailModalProps {
  file: KnowledgeFile | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}

const FileDetailModal = ({ file, visible, onClose, onDelete, onReindex }: FileDetailModalProps) => {
  const insets = useSafeAreaInsets();
  if (!file) return null;

  const label = getMimeLabel(file.mime_type);
  const color = getMimeColor(file.mime_type);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          className="bg-background rounded-t-3xl"
          style={{ maxHeight: '90%', paddingBottom: insets.bottom + 16 }}
        >
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-border" />
          </View>

          <View className="flex-row justify-between items-center px-global pt-2 pb-3">
            <ThemedText className="text-lg font-bold">预览</ThemedText>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View className="w-8 h-8 rounded-full bg-secondary items-center justify-center">
                <Icon name="X" size={16} />
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView className="px-global" showsVerticalScrollIndicator={false}>
            <View className="bg-secondary rounded-2xl p-4 mb-4">
              <View className="flex-row items-start">
                <View className="flex-1 mr-3">
                  <ThemedText className="text-base font-bold text-primary mb-1">
                    {file.filename}
                  </ThemedText>
                  <View className="flex-row items-center gap-x-3">
                    <ThemedText className="text-xs text-subtext">{formatFileSize(file.file_size)}</ThemedText>
                    <ThemedText className="text-xs text-subtext">{formatDate(file.created_at)}</ThemedText>
                  </View>
                </View>
                <View
                  style={{ backgroundColor: color }}
                  className="w-14 h-16 rounded-xl items-center justify-center"
                >
                  <ThemedText className="text-sm font-bold text-white">{label}</ThemedText>
                </View>
              </View>

              {file.status === 'processing' && (
                <View className="mt-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <ThemedText className="text-xs text-subtext">处理中…</ThemedText>
                    <ThemedText className="text-xs text-subtext">
                      {Math.round((file.progress ?? 0) * 100)}%
                    </ThemedText>
                  </View>
                  <View className="h-1 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-1 rounded-full bg-primary"
                      style={{ width: `${Math.round((file.progress ?? 0) * 100)}%` }}
                    />
                  </View>
                </View>
              )}

              {file.status === 'error' && (
                <View className="mt-3 flex-row items-center">
                  <Icon name="AlertCircle" size={14} color="#E53935" />
                  <ThemedText className="text-xs ml-1.5" style={{ color: '#E53935' }}>
                    处理失败
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => { onReindex(file.id); onClose(); }}
                    className="ml-3 bg-secondary rounded-lg px-2 py-1"
                  >
                    <ThemedText className="text-xs text-primary">重新处理</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {file.status === 'done' && file.chunk_count > 0 && (
              <View className="mb-4 flex-row items-center bg-secondary rounded-xl px-4 py-3">
                <Icon name="Database" size={16} />
                <ThemedText className="text-sm text-subtext ml-2">
                  已拆分为 <ThemedText className="font-bold text-primary">{file.chunk_count}</ThemedText> 个知识块，可被 AI 检索
                </ThemedText>
              </View>
            )}

            <View className="flex-row gap-x-3 mb-4">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 bg-secondary rounded-2xl py-4 items-center"
              >
                <ThemedText className="text-base font-semibold">查看更多</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    '删除文件',
                    `确定删除「${file.filename}」？此操作不可撤销。`,
                    [
                      { text: '取消', style: 'cancel' },
                      {
                        text: '删除',
                        style: 'destructive',
                        onPress: () => { onDelete(file.id); onClose(); },
                      },
                    ]
                  );
                }}
                className="flex-1 bg-primary rounded-2xl py-4 items-center"
              >
                <Text className="text-base font-semibold text-invert">修改</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
        <View className="bg-background rounded-2xl p-6">
          <ThemedText className="text-lg font-bold mb-4">新建文件夹</ThemedText>
          <TextInput
            className="bg-secondary rounded-xl px-4 py-3 text-primary text-base mb-4"
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
              onPress={() => { setName(''); onClose(); }}
              className="flex-1 bg-secondary rounded-xl py-3 items-center"
            >
              <ThemedText className="text-base font-semibold">取消</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              className="flex-1 bg-primary rounded-xl py-3 items-center"
            >
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
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <TouchableOpacity activeOpacity={1} style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="mx-4 mb-2 bg-secondary rounded-2xl overflow-hidden">
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => { onClose(); setTimeout(action.onPress, 250); }}
                activeOpacity={action.disabled ? 1 : 0.7}
                className={`flex-row items-center px-4 py-4 ${
                  index < actions.length - 1 ? 'border-b border-border' : ''
                } ${action.disabled ? 'opacity-40' : ''}`}
              >
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center mr-4"
                  style={{ backgroundColor: action.iconBg }}
                >
                  <Icon name={action.icon} size={22} color="white" />
                </View>
                <View className="flex-1">
                  <ThemedText className="text-base font-semibold text-primary">{action.title}</ThemedText>
                  <ThemedText className="text-xs text-subtext mt-0.5">{action.subtitle}</ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mx-4 bg-secondary rounded-2xl overflow-hidden">
            <TouchableOpacity
              onPress={() => { onClose(); setTimeout(folderAction.onPress, 250); }}
              activeOpacity={0.7}
              className="flex-row items-center px-4 py-4"
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center mr-4 bg-highlight/20">
                <Icon name="FolderPlus" size={22} color="#0EA5E9" />
              </View>
              <View className="flex-1">
                <ThemedText className="text-base font-semibold text-primary">{folderAction.title}</ThemedText>
                <ThemedText className="text-xs text-subtext mt-0.5">{folderAction.subtitle}</ThemedText>
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
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<KnowledgeFile | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [uploadSheetVisible, setUploadSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filteredFiles = files.filter((f) => {
    const matchFolder = selectedFolderId ? f.folder_id === selectedFolderId : true;
    const matchSearch = searchQuery
      ? f.filename.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchFolder && matchSearch;
  });

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [folderList, fileList] = await Promise.all([
        knowledgeApi.getFolders().catch(() => [] as KnowledgeFolder[]),
        knowledgeApi.getFiles().catch(() => ({ files: [] as KnowledgeFile[], total: 0 })),
      ]);
      setFolders(folderList);
      setFiles(fileList.files);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const uploadFile = async (uri: string, filename: string, mimeType: string) => {
    try {
      const { file_id } = await knowledgeApi.uploadFile(
        uri,
        filename,
        mimeType,
        selectedFolderId ?? undefined,
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
    } catch (e) {
      Alert.alert('上传失败', e instanceof Error ? e.message : '请稍后重试');
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

  const handleDeleteFile = async (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    try {
      await knowledgeApi.deleteFile(fileId);
    } catch {
      // ignore
    }
  };

  const handleReindex = async (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, status: 'queued' as const, progress: 0 } : f))
    );
    try {
      await knowledgeApi.reindexFile(fileId);
    } catch {
      // ignore
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

  const handleFileMenuPress = (file: KnowledgeFile) => {
    const actions: Array<{ text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }> = [
      {
        text: '删除',
        style: 'destructive',
        onPress: () => handleDeleteFile(file.id),
      },
    ];
    if (file.status === 'error') {
      actions.unshift({
        text: '重新处理',
        onPress: () => handleReindex(file.id),
      });
    }
    actions.push({ text: '取消', style: 'cancel' });
    Alert.alert(file.filename, undefined, actions);
  };

  const handleMockUpload = () => {
    const mocks = [
      { filename: '产品需求文档_v2.pdf', mime_type: 'application/pdf', file_size: 2.4 * 1024 * 1024 },
      { filename: '会议纪要_2026Q1.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size: 580 * 1024 },
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
        prev.map((f) =>
          f.id === newFile.id ? { ...f, status: 'processing', progress: 0.3 } : f
        )
      );
    }, 1000);
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === newFile.id ? { ...f, status: 'done', progress: 1.0, chunk_count: Math.floor(Math.random() * 50) + 10 } : f
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
    ...(__DEV__ ? [{
      icon: 'FlaskConical' as IconName,
      iconBg: '#9C27B0',
      title: '模拟上传（测试）',
      subtitle: '开发模式：随机生成一条上传记录',
      onPress: handleMockUpload,
    }] : []),
  ];

  const leftHeaderComponent = (
    <TouchableOpacity
      onPress={() => {}}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="mr-2"
    >
      <ThemedText className="text-base text-primary">多选</ThemedText>
    </TouchableOpacity>
  );

  const rightHeaderComponent = (
    <TouchableOpacity
      onPress={() => setUploadSheetVisible(true)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="flex-row items-center"
    >
      <Icon name="Plus" size={16} />
      <ThemedText className="text-base font-medium ml-0.5">新建</ThemedText>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-background">
      <Header
        title="知识库"
        showBackButton
        onBackPress={() => router.back()}
        leftComponent={leftHeaderComponent}
        rightComponents={[rightHeaderComponent]}
      />

      <View className="flex-1 px-global">
        <View className="flex-row items-center bg-secondary rounded-full px-4 mb-5 h-11">
          <Icon name="Search" size={18} />
          <TextInput
            className="flex-1 ml-2 text-sm text-primary"
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

        {folders.length > 0 && !searchQuery && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-5"
            contentContainerStyle={{ paddingRight: 16 }}
          >
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onPress={() =>
                  setSelectedFolderId((prev) => (prev === folder.id ? null : folder.id))
                }
                onLongPress={() => handleFolderLongPress(folder)}
              />
            ))}
          </ScrollView>
        )}

        <View className="flex-row items-center justify-between mb-3">
          <ThemedText className="text-base font-bold">
            {selectedFolderId
              ? folders.find((f) => f.id === selectedFolderId)?.name ?? '文件列表'
              : '近30天'}
          </ThemedText>
          {selectedFolderId && (
            <TouchableOpacity onPress={() => setSelectedFolderId(null)}>
              <ThemedText className="text-sm text-subtext">显示全部</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.icon} />
          }
          renderItem={({ item }) => (
            <FileRow
              file={item}
              onPress={() => {
                setSelectedFile(item);
                setDetailVisible(true);
              }}
              onMenuPress={() => handleFileMenuPress(item)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Icon name="FolderOpen" size={48} />
              <ThemedText className="text-subtext mt-3">暂无文件</ThemedText>
            </View>
          }
        />
      </View>

      <FileDetailModal
        file={selectedFile}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onDelete={handleDeleteFile}
        onReindex={handleReindex}
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
    </View>
  );
}
